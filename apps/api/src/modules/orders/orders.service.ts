import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ApiException, apiError, FieldError } from '../../common/api-error';
import { dateToString, stringToDate } from '../../common/business-date';
import { Clock } from '../../common/clock';
import { lineAmounts, orderTotals, parsePrice } from '../../common/money';
import { OrderEventType, OrderStatus, Prisma, TaxCode } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hasPermission, Permission } from '../auth';
import type { AuthUser } from '../auth';
import { CustomersService } from '../customers';
import { ProductsService } from '../products';
import type { OrderableProduct } from '../products';
import {
  CopyOrderDto,
  CopyOrderResultDto,
  CreateOrderDto,
  ListOrdersQuery,
  OPEN_STATUSES,
  ORDER_STATUS_VALUES,
  OrderDto,
  OrderLineInput,
  OrderPageDto,
  RoastSummaryDto,
  UpdateOrderDto,
  VersionDto,
  VersionReasonDto,
} from './dto/order.dto';
import {
  formatOrderNumber,
  OrderDetailRow,
  OrderLineRow,
  toListItemDto,
  toOrderDto,
} from './orders.mapper';
import { computeAllowedActions } from './orders.rules';
import { CalendarView, RoastCalendarService } from './schedule/roast-calendar.service';
import type { ScheduleSuggestion } from './schedule/schedule.types';

const DEFAULT_PAGE_SIZE = 25;
const DETAIL_INCLUDE = {
  customer: true,
  branch: true,
  items: { include: { product: { include: { coffee: true } } } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  events: { include: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.OrderInclude;

const escapeLike = (term: string): string => term.replace(/[\\%_]/g, (c) => `\\${c}`);
const validation = (fieldErrors: FieldError[]): ApiException =>
  apiError(400, 'VALIDATION_FAILED', 'Some fields need attention', { fieldErrors });

/** A line as it will be stored. */
interface FinalLine {
  productId: string;
  quantity: number;
  description: string;
  unitPriceExGst: Prisma.Decimal;
  taxCode: TaxCode;
  bagSizeGrams: number | null;
}

type Tx = Prisma.TransactionClient;
type Action = 'confirm' | 'pack' | 'dispatch' | 'deliver' | 'cancel' | 'revert';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly customers: CustomersService,
    private readonly calendar: RoastCalendarService,
    private readonly clock: Clock,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  async list(query: ListOrdersQuery, user: AuthUser): Promise<OrderPageDto> {
    void user;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const statuses = this.parseStatuses(query.status);
    if (query.deliveryFrom && query.deliveryTo && query.deliveryTo < query.deliveryFrom) {
      throw validation([
        {
          field: 'deliveryTo',
          code: 'dateRange',
          message: 'Delivery to must be on or after delivery from',
        },
      ]);
    }
    const where = this.listWhere(query, statuses);

    const [countRows, idRows, view] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT count(*) AS total FROM orders o
        JOIN customers c ON c.id = o."customerId" JOIN branches b ON b.id = o."branchId" ${where}`),
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT o.id FROM orders o
        JOIN customers c ON c.id = o."customerId" JOIN branches b ON b.id = o."branchId"
        ${where}
        ORDER BY o."deliveryDate" ASC, lower(coalesce(c."tradingName", c."legalName")) ASC,
          lower(b.name) ASC, o."orderNumber" ASC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      this.calendar.view(),
    ]);
    const totalItems = Number(countRows[0]?.total ?? 0);
    const ids = idRows.map((r) => r.id);
    const rows = ids.length
      ? await this.prisma.order.findMany({
          where: { id: { in: ids } },
          include: { customer: true, branch: true, _count: { select: { items: true } } },
        })
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      items: ids.map((id) => {
        const row = byId.get(id)!;
        const pastCutoff = view.ctx.isPastCutoff(dateToString(row.roastDate), view.now.dateTime);
        return toListItemDto(row, row._count.items, pastCutoff);
      }),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async get(id: string, user: AuthUser): Promise<OrderDto> {
    return this.toDetail(await this.findOrder(id), user);
  }

  async schedule(deliveryDate?: string): Promise<ScheduleSuggestion> {
    return this.calendar.suggest(deliveryDate);
  }

  async roastSummary(roastDate: string): Promise<RoastSummaryDto> {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: { status: 'CONFIRMED', roastDate: stringToDate(roastDate) },
        product: { coffeeId: { not: null } },
      },
      include: { product: { include: { coffee: true } } },
    });
    const byCoffee = new Map<
      string,
      { coffeeId: string; coffeeName: string; totalWeightGrams: number; orders: Set<string> }
    >();
    for (const item of items) {
      const coffee = item.product.coffee!;
      const entry = byCoffee.get(coffee.id) ?? {
        coffeeId: coffee.id,
        coffeeName: coffee.name,
        totalWeightGrams: 0,
        orders: new Set<string>(),
      };
      entry.totalWeightGrams += (item.product.bagSizeGrams ?? 0) * item.quantity;
      entry.orders.add(item.orderId);
      byCoffee.set(coffee.id, entry);
    }
    const coffees = [...byCoffee.values()]
      .sort((a, b) => a.coffeeName.toLowerCase().localeCompare(b.coffeeName.toLowerCase()))
      .map(({ orders, ...rest }) => ({ ...rest, orderCount: orders.size }));
    return {
      roastDate,
      coffees,
      totalWeightGrams: coffees.reduce((t, c) => t + c.totalWeightGrams, 0),
    };
  }

  // ── Create and copy ──────────────────────────────────────────────────────

  /** `created` is false when the requestId was already used by this user (respond 200). */
  async create(
    dto: CreateOrderDto,
    user: AuthUser,
  ): Promise<{ order: OrderDto; created: boolean }> {
    const existing = await this.findByRequestId(dto.requestId, user);
    if (existing) return { order: await this.toDetail(existing, user), created: false };

    const view = await this.calendar.view();
    const branchInfo = await this.customers.getBranchForOrdering(dto.branchId);
    if (!branchInfo) {
      throw validation([{ field: 'branchId', code: 'notFound', message: 'Branch not found' }]);
    }

    // Only name fields the request sent: reject explicit past dates before deriving the other.
    const pastErrors: FieldError[] = [];
    if (dto.deliveryDate && dto.deliveryDate < view.now.date) {
      pastErrors.push({
        field: 'deliveryDate',
        code: 'pastDate',
        message: "Delivery date can't be in the past",
      });
    }
    if (dto.roastDate && dto.roastDate < view.now.date) {
      pastErrors.push({
        field: 'roastDate',
        code: 'pastDate',
        message: "Roast date can't be in the past",
      });
    }
    if (pastErrors.length > 0) throw validation(pastErrors);

    const { roastDate, deliveryDate } = this.resolveNewDates(dto, view);
    this.checkHardDateRules(view, { roastDate, deliveryDate }, true, true);
    this.assertActive(branchInfo);

    const lines = await this.resolveLines(dto.lines ?? [], []);
    const afterCutoff = this.checkSchedule(view, roastDate, deliveryDate, user);
    const amounts = this.amountsFor(lines);

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            requestId: dto.requestId,
            customerId: branchInfo.customerId,
            branchId: branchInfo.branchId,
            deliveryDate: stringToDate(deliveryDate),
            roastDate: stringToDate(roastDate),
            afterCutoff,
            notes: dto.notes ?? null,
            ...amounts.totals,
            createdById: user.id,
            updatedById: user.id,
            items: { create: amounts.rows },
          },
        });
        await this.writeEvent(tx, order.id, 'CREATED', user.id, null, {
          roastDate,
          deliveryDate,
          lines: lines.map((l) => ({ description: l.description, quantity: l.quantity })),
        });
        return order.id;
      });
      return { order: await this.get(id, user), created: true };
    } catch (err) {
      const repeat = await this.recoverRequestId(err, dto.requestId, user);
      if (repeat) return { order: await this.toDetail(repeat, user), created: false };
      throw err;
    }
  }

  async copy(
    id: string,
    dto: CopyOrderDto,
    user: AuthUser,
  ): Promise<{ result: CopyOrderResultDto; created: boolean }> {
    const repeat = await this.findByRequestId(dto.requestId, user);
    if (repeat) {
      return {
        result: { order: await this.toDetail(repeat, user), skippedLines: [] },
        created: false,
      };
    }
    const source = await this.findOrder(id);
    const branchInfo = await this.customers.getBranchForOrdering(source.branchId);
    if (!branchInfo) throw apiError(404, 'ORDER_NOT_FOUND', 'Order not found');
    this.assertActive(branchInfo);

    const view = await this.calendar.view();
    const suggestion = view.ctx.suggestFromNow(view.now.date, view.now.dateTime);
    if (!suggestion) {
      throw apiError(409, 'NO_SCHEDULE_AVAILABLE', 'No roast and delivery day is available');
    }

    const current = await this.products.findForOrderLines(source.items.map((i) => i.productId));
    const skippedLines: CopyOrderResultDto['skippedLines'] = [];
    const lines: FinalLine[] = [];
    for (const item of source.items) {
      const product = current.get(item.productId);
      if (!product || !product.orderable) {
        skippedLines.push({
          productId: item.productId,
          description: item.description,
          reason:
            product?.unavailableReason === 'COFFEE_INACTIVE'
              ? 'COFFEE_INACTIVE'
              : 'PRODUCT_INACTIVE',
        });
        continue;
      }
      lines.push(this.snapshot(product, item.quantity));
    }
    const amounts = this.amountsFor(lines);
    try {
      const newId = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            requestId: dto.requestId,
            customerId: branchInfo.customerId,
            branchId: branchInfo.branchId,
            deliveryDate: stringToDate(suggestion.deliveryDate),
            roastDate: stringToDate(suggestion.roastDate),
            afterCutoff: false,
            notes: source.notes,
            ...amounts.totals,
            createdById: user.id,
            updatedById: user.id,
            items: { create: amounts.rows },
          },
        });
        await this.writeEvent(tx, order.id, 'CREATED', user.id, null, {
          copiedFrom: formatOrderNumber(source.orderNumber),
          roastDate: suggestion.roastDate,
          deliveryDate: suggestion.deliveryDate,
        });
        return order.id;
      });
      return { result: { order: await this.get(newId, user), skippedLines }, created: true };
    } catch (err) {
      const again = await this.recoverRequestId(err, dto.requestId, user);
      if (again) {
        return {
          result: { order: await this.toDetail(again, user), skippedLines: [] },
          created: false,
        };
      }
      throw err;
    }
  }

  // ── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateOrderDto, user: AuthUser): Promise<OrderDto> {
    const order = await this.findOrder(id);
    this.assertVersion(order, dto.version);
    const view = await this.calendar.view();
    const status = order.status;
    const storedRoast = dateToString(order.roastDate);
    const storedDelivery = dateToString(order.deliveryDate);
    const roastDate = dto.roastDate ?? storedRoast;
    const deliveryDate = dto.deliveryDate ?? storedDelivery;
    const roastChanged = roastDate !== storedRoast;
    const deliveryChanged = deliveryDate !== storedDelivery;
    const notesChanged = dto.notes !== undefined && (dto.notes ?? null) !== order.notes;

    const diff = dto.lines ? this.diffLines(order.items, dto.lines) : null;
    const linesChanged =
      !!diff && diff.added.length + diff.removed.length + diff.changed.length > 0;
    const raised = !!diff && (diff.added.length > 0 || diff.increased);
    const reduced = !!diff && (diff.removed.length > 0 || diff.reduced);

    // 5. Editability by status.
    const blocked: string[] = [];
    if (status === 'DELIVERED' || status === 'CANCELLED') {
      if (linesChanged) blocked.push('lines');
      if (roastChanged) blocked.push('roastDate');
      if (deliveryChanged) blocked.push('deliveryDate');
    } else if (status === 'PACKED' || status === 'DISPATCHED') {
      if (roastChanged) blocked.push('roastDate');
      if (linesChanged && raised) blocked.push('lines');
    }
    if (blocked.length > 0) {
      throw apiError(409, 'ORDER_NOT_EDITABLE', 'This order can no longer be changed that way', {
        meta: { status, fields: blocked },
      });
    }

    // 6. Status-based permission.
    const late = hasPermission(user, Permission.OrdersLateChange);
    const forbidden = (reason: string) =>
      apiError(403, 'FORBIDDEN', "You don't have permission to do this", { meta: { reason } });
    if (status === 'CONFIRMED' && (linesChanged || roastChanged || deliveryChanged) && !late) {
      if (view.ctx.isPastCutoff(storedRoast, view.now.dateTime)) throw forbidden('PAST_CUTOFF');
    }
    if ((status === 'PACKED' || status === 'DISPATCHED') && linesChanged && reduced) {
      if (!hasPermission(user, Permission.OrdersShortSupply)) throw forbidden('SHORT_SUPPLY');
    }
    if ((status === 'PACKED' || status === 'DISPATCHED') && deliveryChanged && !late) {
      throw forbidden('LATE_CHANGE');
    }
    if ((status === 'PACKED' || status === 'DISPATCHED') && linesChanged && !dto.reason) {
      throw validation([
        { field: 'reason', code: 'isNotEmpty', message: 'Give a reason for the short supply' },
      ]);
    }

    // 7. Hard date rules.
    this.checkHardDateRules(view, { roastDate, deliveryDate }, roastChanged, deliveryChanged);

    // 9. Products for new lines.
    const finalLines = dto.lines ? await this.resolveLines(dto.lines, order.items) : null;

    // 10. A non-draft order must keep at least one line.
    const lineCount = finalLines ? finalLines.length : order.items.length;
    if (status !== 'DRAFT' && lineCount === 0) {
      throw apiError(
        409,
        'ORDER_EMPTY',
        status === 'CONFIRMED'
          ? 'An order needs at least one line'
          : 'An order needs at least one line; cancel it instead',
      );
    }

    // 11. Schedule.
    let afterCutoff: boolean | undefined;
    const scheduleRelevant = linesChanged || roastChanged || deliveryChanged;
    if (scheduleRelevant && (status === 'DRAFT' || status === 'CONFIRMED')) {
      afterCutoff = this.checkSchedule(view, roastDate, deliveryDate, user);
    }

    const changes: Record<string, unknown> = {};
    if (roastChanged) changes.roastDate = [storedRoast, roastDate];
    if (deliveryChanged) changes.deliveryDate = [storedDelivery, deliveryDate];
    if (notesChanged) changes.notes = [order.notes, dto.notes ?? null];
    if (linesChanged && diff) changes.lines = diff.summary;

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id, version: dto.version },
        data: {
          version: { increment: 1 },
          updatedById: user.id,
          ...(roastChanged ? { roastDate: stringToDate(roastDate) } : {}),
          ...(deliveryChanged ? { deliveryDate: stringToDate(deliveryDate) } : {}),
          ...(notesChanged ? { notes: dto.notes ?? null } : {}),
          ...(afterCutoff !== undefined ? { afterCutoff } : {}),
        },
      });
      if (result.count === 0) throw await this.versionConflict(tx, id);
      if (finalLines && linesChanged) {
        await this.replaceLines(tx, id, order.items, finalLines);
      }
      if (Object.keys(changes).length > 0) {
        await this.writeEvent(
          tx,
          id,
          'UPDATED',
          user.id,
          (status === 'PACKED' || status === 'DISPATCHED') && linesChanged
            ? (dto.reason ?? null)
            : null,
          changes,
        );
      }
    });
    return this.get(id, user);
  }

  // ── Transitions ──────────────────────────────────────────────────────────

  confirm(id: string, dto: VersionDto, user: AuthUser): Promise<OrderDto> {
    return this.transition(id, 'confirm', dto.version, user);
  }
  pack(id: string, dto: VersionDto, user: AuthUser): Promise<OrderDto> {
    return this.transition(id, 'pack', dto.version, user);
  }
  dispatch(id: string, dto: VersionDto, user: AuthUser): Promise<OrderDto> {
    return this.transition(id, 'dispatch', dto.version, user);
  }
  deliver(id: string, dto: VersionDto, user: AuthUser): Promise<OrderDto> {
    return this.transition(id, 'deliver', dto.version, user);
  }
  cancel(id: string, dto: VersionReasonDto, user: AuthUser): Promise<OrderDto> {
    return this.transition(id, 'cancel', dto.version, user, dto.reason);
  }
  revert(id: string, dto: VersionReasonDto, user: AuthUser): Promise<OrderDto> {
    return this.transition(id, 'revert', dto.version, user, dto.reason);
  }

  async remove(id: string, version: number, user: AuthUser): Promise<void> {
    const order = await this.findOrder(id);
    this.assertVersion(order, version);
    if (order.status !== 'DRAFT' || order.confirmedAt !== null) {
      throw apiError(
        409,
        'ORDER_NOT_DELETABLE',
        'Only a draft that was never confirmed can be deleted',
        {
          meta: { status: order.status },
        },
      );
    }
    void user;
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.deleteMany({ where: { id, version } });
      if (result.count === 0) throw await this.versionConflict(tx, id);
    });
  }

  private async transition(
    id: string,
    action: Action,
    version: number,
    user: AuthUser,
    reason?: string,
  ): Promise<OrderDto> {
    const order = await this.findOrder(id);
    this.assertVersion(order, version);
    const view = await this.calendar.view();
    const status = order.status;
    const roast = dateToString(order.roastDate);
    const pastCutoff = view.ctx.isPastCutoff(roast, view.now.dateTime);
    const late = hasPermission(user, Permission.OrdersLateChange);
    const invalid = () =>
      apiError(
        409,
        'INVALID_TRANSITION',
        `This order can't be ${this.pastTense(action)} from ${status}`,
        {
          meta: { status },
        },
      );
    const forbidden = (why: string) =>
      apiError(403, 'FORBIDDEN', "You don't have permission to do this", { meta: { reason: why } });

    let next: OrderStatus;
    let eventType: OrderEventType;
    const data: Prisma.OrderUncheckedUpdateManyInput = {};
    const now = this.clock.now();

    switch (action) {
      case 'confirm': {
        if (status !== 'DRAFT') throw invalid();
        const branchInfo = await this.customers.getBranchForOrdering(order.branchId);
        if (branchInfo) this.assertActive(branchInfo);
        await this.assertLinesOrderable(order.items);
        if (order.items.length === 0)
          throw apiError(409, 'ORDER_EMPTY', 'Add at least one line before confirming');
        const afterCutoff = this.checkSchedule(view, roast, dateToString(order.deliveryDate), user);
        next = 'CONFIRMED';
        eventType = 'CONFIRMED';
        data.afterCutoff = afterCutoff;
        if (!order.confirmedAt) data.confirmedAt = now;
        break;
      }
      case 'pack':
        if (status !== 'CONFIRMED') throw invalid();
        next = 'PACKED';
        eventType = 'PACKED';
        data.packedAt = now;
        break;
      case 'dispatch':
        if (status !== 'PACKED') throw invalid();
        next = 'DISPATCHED';
        eventType = 'DISPATCHED';
        data.dispatchedAt = now;
        break;
      case 'deliver':
        if (status !== 'PACKED' && status !== 'DISPATCHED') throw invalid();
        next = 'DELIVERED';
        eventType = 'DELIVERED';
        data.deliveredAt = now;
        break;
      case 'cancel': {
        if (status === 'DELIVERED' || status === 'CANCELLED') throw invalid();
        const needsLate =
          status === 'PACKED' || status === 'DISPATCHED' || (status === 'CONFIRMED' && pastCutoff);
        if (needsLate && !late)
          throw forbidden(status === 'CONFIRMED' ? 'PAST_CUTOFF' : 'LATE_CHANGE');
        next = 'CANCELLED';
        eventType = 'CANCELLED';
        data.cancelReason = reason;
        data.cancelledAt = now;
        break;
      }
      case 'revert':
        if (status === 'CONFIRMED') next = 'DRAFT';
        else if (status === 'PACKED') {
          next = 'CONFIRMED';
          data.packedAt = null;
        } else if (status === 'DISPATCHED') {
          next = 'PACKED';
          data.dispatchedAt = null;
        } else throw invalid();
        eventType = 'REVERTED';
        break;
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id, version },
        data: { ...data, status: next, version: { increment: 1 }, updatedById: user.id },
      });
      if (result.count === 0) throw await this.versionConflict(tx, id);
      await this.writeEvent(tx, id, eventType, user.id, reason ?? null, { status: [status, next] });
    });
    return this.get(id, user);
  }

  private pastTense(action: Action): string {
    return {
      confirm: 'confirmed',
      pack: 'packed',
      dispatch: 'dispatched',
      deliver: 'delivered',
      cancel: 'cancelled',
      revert: 'reverted',
    }[action];
  }

  // ── Helpers: loading ─────────────────────────────────────────────────────

  private async findOrder(id: string): Promise<OrderDetailRow> {
    const order = isUUID(id)
      ? await this.prisma.order.findUnique({ where: { id }, include: DETAIL_INCLUDE })
      : null;
    if (!order) throw apiError(404, 'ORDER_NOT_FOUND', 'Order not found');
    return order;
  }

  private async findByRequestId(requestId: string, user: AuthUser): Promise<OrderDetailRow | null> {
    const found = await this.prisma.order.findUnique({
      where: { requestId },
      include: DETAIL_INCLUDE,
    });
    if (!found) return null;
    if (found.createdById !== user.id) {
      throw apiError(409, 'REQUEST_ID_REUSED', 'This request id belongs to another order');
    }
    return found;
  }

  /** Two simultaneous creates with one requestId: the loser gets the winner's order. */
  private async recoverRequestId(err: unknown, requestId: string, user: AuthUser) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return this.findByRequestId(requestId, user);
    }
    return null;
  }

  private async toDetail(order: OrderDetailRow, user: AuthUser): Promise<OrderDto> {
    const view = await this.calendar.view();
    const roast = dateToString(order.roastDate);
    const pastCutoff = view.ctx.isPastCutoff(roast, view.now.dateTime);
    return toOrderDto(order, {
      pastCutoff,
      cutoff: view.ctx.cutoffOf(roast),
      allowedActions: computeAllowedActions({ ...order, pastCutoff }, user),
    });
  }

  private assertVersion(
    order: { id: string; version: number; status: OrderStatus },
    version: number,
  ): void {
    if (order.version !== version) {
      throw this.conflictError(order.version, order.status);
    }
  }

  private conflictError(currentVersion: number, status: OrderStatus): ApiException {
    return apiError(409, 'VERSION_CONFLICT', 'This order was changed by someone else — reload', {
      meta: { currentVersion, status },
    });
  }

  private async versionConflict(tx: Tx, id: string): Promise<ApiException> {
    const current = await tx.order.findUnique({
      where: { id },
      select: { version: true, status: true },
    });
    if (!current) return apiError(404, 'ORDER_NOT_FOUND', 'Order not found');
    return this.conflictError(current.version, current.status);
  }

  private writeEvent(
    tx: Tx,
    orderId: string,
    type: OrderEventType,
    userId: string,
    reason: string | null,
    changes: Record<string, unknown> | null,
  ) {
    return tx.orderEvent.create({
      data: {
        orderId,
        type,
        userId,
        reason,
        changes: (changes ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  // ── Helpers: rules ───────────────────────────────────────────────────────

  private assertActive(info: {
    customerId: string;
    customerIsActive: boolean;
    branchIsActive: boolean;
  }): void {
    if (!info.customerIsActive) {
      throw apiError(409, 'CUSTOMER_INACTIVE', 'This customer is inactive', {
        meta: { customerId: info.customerId },
      });
    }
    if (!info.branchIsActive) {
      throw apiError(409, 'BRANCH_INACTIVE', 'This branch is inactive', {
        meta: { customerId: info.customerId },
      });
    }
  }

  private resolveNewDates(
    dto: CreateOrderDto,
    view: CalendarView,
  ): { roastDate: string; deliveryDate: string } {
    const none = () =>
      apiError(409, 'NO_SCHEDULE_AVAILABLE', 'No roast and delivery day is available');
    if (dto.roastDate && dto.deliveryDate)
      return { roastDate: dto.roastDate, deliveryDate: dto.deliveryDate };
    if (dto.deliveryDate) {
      const s = view.ctx.suggestFromDelivery(dto.deliveryDate, view.now.dateTime, view.now.date);
      if (!s) throw none();
      return { roastDate: s.roastDate, deliveryDate: dto.deliveryDate };
    }
    if (dto.roastDate) {
      const delivery = view.ctx.deliveryFor(dto.roastDate);
      if (!delivery) throw none();
      return { roastDate: dto.roastDate, deliveryDate: delivery };
    }
    const s = view.ctx.suggestFromNow(view.now.date, view.now.dateTime);
    if (!s) throw none();
    return { roastDate: s.roastDate, deliveryDate: s.deliveryDate };
  }

  /** Hard rules apply to everyone, only to dates being set or changed (design §5.3). */
  private checkHardDateRules(
    view: CalendarView,
    dates: { roastDate: string; deliveryDate: string },
    roastChanged: boolean,
    deliveryChanged: boolean,
  ): void {
    const today = view.now.date;
    const errors: FieldError[] = [];
    if (deliveryChanged && dates.deliveryDate < today) {
      errors.push({
        field: 'deliveryDate',
        code: 'pastDate',
        message: "Delivery date can't be in the past",
      });
    }
    if (roastChanged && dates.roastDate < today) {
      errors.push({
        field: 'roastDate',
        code: 'pastDate',
        message: "Roast date can't be in the past",
      });
    }
    if ((roastChanged || deliveryChanged) && dates.roastDate > dates.deliveryDate) {
      errors.push({
        field: 'roastDate',
        code: 'afterDelivery',
        message: 'Roast date must be on or before the delivery date',
      });
    }
    if (errors.length > 0) throw validation(errors);
  }

  /** Off schedule needs orders:late-change; returns the afterCutoff flag to store. */
  private checkSchedule(
    view: CalendarView,
    roastDate: string,
    deliveryDate: string,
    user: AuthUser,
  ): boolean {
    const { onSchedule, reasons } = view.ctx.evaluate(roastDate, deliveryDate, view.now.dateTime);
    if (onSchedule) return false;
    if (hasPermission(user, Permission.OrdersLateChange)) return true;
    const suggestion = view.ctx.suggestFromNow(view.now.date, view.now.dateTime);
    throw apiError(
      409,
      'SCHEDULE_OVERRIDE_REQUIRED',
      reasons.includes('CUTOFF_PASSED')
        ? `Cut-off for ${roastDate} has passed — ask a manager or pick the next date`
        : 'These dates are off the roast and delivery schedule — ask a manager or pick the suggested dates',
      {
        meta: {
          reasons,
          cutoff: view.ctx.cutoffOf(roastDate),
          suggestion: suggestion
            ? { roastDate: suggestion.roastDate, deliveryDate: suggestion.deliveryDate }
            : null,
        },
      },
    );
  }

  // ── Helpers: lines ───────────────────────────────────────────────────────

  private snapshot(product: OrderableProduct, quantity: number): FinalLine {
    return {
      productId: product.id,
      quantity,
      description: product.displayName,
      unitPriceExGst: product.listPriceExGst,
      taxCode: product.taxCode,
      bagSizeGrams: product.bagSizeGrams,
    };
  }

  /**
   * Validates a full desired set of lines (design §6.3). Products already on the order keep
   * their snapshot; new ones are priced from the current list price after the price check.
   */
  private async resolveLines(
    inputs: OrderLineInput[],
    existing: OrderLineRow[],
  ): Promise<FinalLine[]> {
    const seen = new Set<string>();
    const duplicates: FieldError[] = [];
    inputs.forEach((l, i) => {
      if (seen.has(l.productId)) {
        duplicates.push({
          field: `lines.${i}.productId`,
          code: 'duplicateProduct',
          message: 'Already on this order — change the quantity instead',
        });
      }
      seen.add(l.productId);
    });
    if (duplicates.length > 0) throw validation(duplicates);

    const onOrder = new Map(existing.map((i) => [i.productId, i]));
    const newIds = inputs.filter((l) => !onOrder.has(l.productId)).map((l) => l.productId);
    const found = await this.products.findForOrderLines(newIds);

    const fieldErrors: FieldError[] = [];
    const unavailable: Record<string, unknown>[] = [];
    const changed: Record<string, unknown>[] = [];
    const finals: FinalLine[] = [];

    inputs.forEach((input, i) => {
      const kept = onOrder.get(input.productId);
      if (kept) {
        finals.push({
          productId: kept.productId,
          quantity: input.quantity,
          description: kept.description,
          unitPriceExGst: kept.unitPriceExGst,
          taxCode: kept.taxCode,
          bagSizeGrams: kept.product.bagSizeGrams,
        });
        return;
      }
      const product = found.get(input.productId);
      if (!product) {
        fieldErrors.push({
          field: `lines.${i}.productId`,
          code: 'notFound',
          message: 'Product not found',
        });
        return;
      }
      if (!input.expectedUnitPriceExGst) {
        fieldErrors.push({
          field: `lines.${i}.expectedUnitPriceExGst`,
          code: 'isNotEmpty',
          message: 'Send the price the form showed',
        });
      }
      if (!input.expectedTaxCode) {
        fieldErrors.push({
          field: `lines.${i}.expectedTaxCode`,
          code: 'isNotEmpty',
          message: 'Send the tax code the form showed',
        });
      }
      if (!product.orderable) {
        unavailable.push({
          productId: product.id,
          description: product.displayName,
          reason: product.unavailableReason,
        });
        return;
      }
      const expected = input.expectedUnitPriceExGst
        ? parsePrice(input.expectedUnitPriceExGst)
        : null;
      if (
        expected &&
        input.expectedTaxCode &&
        (!expected.equals(product.listPriceExGst) || input.expectedTaxCode !== product.taxCode)
      ) {
        changed.push({
          productId: product.id,
          description: product.displayName,
          expected: { unitPriceExGst: expected.toFixed(2), taxCode: input.expectedTaxCode },
          current: { unitPriceExGst: product.listPriceExGst.toFixed(2), taxCode: product.taxCode },
        });
      }
      finals.push(this.snapshot(product, input.quantity));
    });

    if (fieldErrors.length > 0) throw validation(fieldErrors);
    if (unavailable.length > 0) {
      throw apiError(409, 'PRODUCT_UNAVAILABLE', 'Some products can no longer be ordered', {
        meta: { lines: unavailable },
      });
    }
    if (changed.length > 0) {
      throw apiError(
        409,
        'PRICE_CHANGED',
        'Some prices have changed — check the lines and try again',
        {
          meta: { lines: changed },
        },
      );
    }
    return finals;
  }

  /** Confirm needs every line's product to be orderable now. */
  private async assertLinesOrderable(items: OrderLineRow[]): Promise<void> {
    const current = await this.products.findForOrderLines(items.map((i) => i.productId));
    const bad = items
      .map((i) => ({ item: i, product: current.get(i.productId) }))
      .filter(({ product }) => !product || !product.orderable)
      .map(({ item, product }) => ({
        productId: item.productId,
        description: item.description,
        reason: product?.unavailableReason ?? 'PRODUCT_INACTIVE',
      }));
    if (bad.length > 0) {
      throw apiError(409, 'PRODUCT_UNAVAILABLE', 'Some products can no longer be ordered', {
        meta: { lines: bad },
      });
    }
  }

  private amountsFor(lines: FinalLine[]) {
    const computed = lines.map((l) => ({
      line: l,
      amounts: lineAmounts(l.quantity, l.unitPriceExGst, l.taxCode),
    }));
    const totals = orderTotals(
      computed.map(({ line, amounts }) => ({
        ...amounts,
        quantity: line.quantity,
        bagSizeGrams: line.bagSizeGrams,
      })),
    );
    return {
      totals: {
        subtotalExGst: totals.subtotalExGst,
        gstAmount: totals.gstAmount,
        totalIncGst: totals.totalIncGst,
        totalWeightGrams: totals.totalWeightGrams,
      },
      rows: computed.map(({ line, amounts }) => ({
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
        unitPriceExGst: line.unitPriceExGst,
        taxCode: line.taxCode,
        ...amounts,
      })),
    };
  }

  private diffLines(existing: OrderLineRow[], inputs: OrderLineInput[]) {
    const before = new Map(existing.map((i) => [i.productId, i]));
    const after = new Map(inputs.map((l) => [l.productId, l]));
    const added = inputs.filter((l) => !before.has(l.productId));
    const removed = existing.filter((i) => !after.has(i.productId));
    const changed = inputs.filter((l) => {
      const b = before.get(l.productId);
      return b && b.quantity !== l.quantity;
    });
    const increased = changed.some((l) => l.quantity > before.get(l.productId)!.quantity);
    const reduced = changed.some((l) => l.quantity < before.get(l.productId)!.quantity);
    return {
      added,
      removed,
      changed,
      increased,
      reduced,
      summary: {
        added: added.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        removed: removed.map((i) => ({ description: i.description, quantity: i.quantity })),
        changed: changed.map((l) => ({
          description: before.get(l.productId)!.description,
          quantity: [before.get(l.productId)!.quantity, l.quantity],
        })),
      },
    };
  }

  /** Replaces the order's lines and recomputes stored totals in the caller's transaction. */
  private async replaceLines(
    tx: Tx,
    orderId: string,
    existing: OrderLineRow[],
    finals: FinalLine[],
  ) {
    const keep = new Set(finals.map((l) => l.productId));
    const stored = new Map(existing.map((i) => [i.productId, i]));
    const removedIds = existing.filter((i) => !keep.has(i.productId)).map((i) => i.id);
    if (removedIds.length > 0) await tx.orderItem.deleteMany({ where: { id: { in: removedIds } } });

    const { totals, rows } = this.amountsFor(finals);
    for (const row of rows) {
      const kept = stored.get(row.productId);
      if (kept) {
        await tx.orderItem.update({
          where: { id: kept.id },
          data: {
            quantity: row.quantity,
            lineTotalExGst: row.lineTotalExGst,
            gstAmount: row.gstAmount,
            lineTotalIncGst: row.lineTotalIncGst,
          },
        });
      } else {
        await tx.orderItem.create({ data: { ...row, orderId } });
      }
    }
    await tx.order.update({ where: { id: orderId }, data: totals });
  }

  // ── Helpers: list ────────────────────────────────────────────────────────

  private parseStatuses(raw?: string): OrderStatus[] {
    if (raw === undefined || raw === '') return OPEN_STATUSES;
    const values = raw.split(',').map((s) => s.trim());
    const bad = values.filter((v) => !(ORDER_STATUS_VALUES as string[]).includes(v));
    if (bad.length > 0) {
      throw validation([
        { field: 'status', code: 'isIn', message: `Unknown order status: ${bad.join(', ')}` },
      ]);
    }
    return values as OrderStatus[];
  }

  private listWhere(query: ListOrdersQuery, statuses: OrderStatus[]): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`o.status = ANY(${statuses}::"OrderStatus"[])`];
    if (query.deliveryFrom)
      conditions.push(Prisma.sql`o."deliveryDate" >= ${query.deliveryFrom}::date`);
    if (query.deliveryTo)
      conditions.push(Prisma.sql`o."deliveryDate" <= ${query.deliveryTo}::date`);
    if (query.roastDate) conditions.push(Prisma.sql`o."roastDate" = ${query.roastDate}::date`);
    if (query.customerId) conditions.push(Prisma.sql`o."customerId" = ${query.customerId}::uuid`);
    if (query.branchId) conditions.push(Prisma.sql`o."branchId" = ${query.branchId}::uuid`);
    if (query.productId) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = o.id AND oi."productId" = ${query.productId}::uuid)`,
      );
    }
    const term = query.search?.trim();
    if (term) {
      const pattern = `%${escapeLike(term)}%`;
      const alternatives: Prisma.Sql[] = [
        Prisma.sql`c."legalName" ILIKE ${pattern}`,
        Prisma.sql`c."tradingName" ILIKE ${pattern}`,
        Prisma.sql`b.name ILIKE ${pattern}`,
      ];
      const number = /^(?:ord-?)?(\d+)$/i.exec(term);
      if (number) alternatives.push(Prisma.sql`o."orderNumber"::text LIKE ${`${number[1]}%`}`);
      conditions.push(Prisma.sql`(${Prisma.join(alternatives, ' OR ')})`);
    }
    return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  }
}
