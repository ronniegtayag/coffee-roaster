import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { apiError } from '../../common/api-error';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hasPermission, Permission } from '../auth';
import type { AuthUser } from '../auth';
import { CreateBranchDto, BranchDto, UpdateBranchDto } from './dto/branch.dto';
import {
  CreateCustomerDto,
  CustomerDto,
  CustomerPageDto,
  ListCustomersQuery,
  PAYMENT_TERMS_DEFAULT_DAYS,
  UpdateCustomerDto,
} from './dto/customer.dto';
import type { OrderingBranch } from './customers.types';
import { displayName, toBranchDto, toCustomerDto, toListItemDto } from './customers.mapper';

const DEFAULT_PAGE_SIZE = 25;
const BRANCH_CONTACT_FIELDS = ['contactName', 'contactPhone', 'deliveryNotes'] as const;
const BRANCH_REQUIRED_FIELDS = ['name', 'addressLine1', 'suburb', 'state', 'postcode'] as const;

const escapeLike = (term: string): string => term.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Keeps only the properties that were actually sent. */
function defined<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as Partial<T>;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCustomersQuery): Promise<CustomerPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = this.listWhere(query);

    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT count(*) AS total FROM customers c ${where}`,
      ),
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT c.id FROM customers c ${where}
        ORDER BY lower(coalesce(c."tradingName", c."legalName")) ASC, c.id ASC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    ]);
    const totalItems = Number(countRows[0]?.total ?? 0);

    const ids = idRows.map((r) => r.id);
    const customers = ids.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: ids } },
          include: { _count: { select: { branches: { where: { isActive: true } } } } },
        })
      : [];
    const byId = new Map(customers.map((c) => [c.id, c]));

    return {
      items: ids.map((id) => {
        const { _count, ...customer } = byId.get(id)!;
        return toListItemDto(customer, _count.branches);
      }),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  /** Branch and customer status for order entry. Null for unknown or malformed ids. */
  async getBranchForOrdering(branchId: string): Promise<OrderingBranch | null> {
    if (!isUUID(branchId)) return null;
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { customer: true },
    });
    if (!branch) return null;
    return {
      branchId: branch.id,
      branchName: branch.name,
      branchIsActive: branch.isActive,
      customerId: branch.customerId,
      customerDisplayName: displayName(branch.customer),
      customerIsActive: branch.customer.isActive,
    };
  }

  async get(id: string): Promise<CustomerDto> {
    return toCustomerDto(await this.findCustomer(id));
  }

  async create(dto: CreateCustomerDto, user: AuthUser): Promise<CustomerDto> {
    if (dto.paymentTermsDays !== undefined) {
      this.requireFieldPermission(user, Permission.CustomersEditTerms, ['paymentTermsDays']);
    }
    if (dto.abn) await this.assertAbnFree(dto.abn);
    try {
      const customer = await this.prisma.customer.create({
        data: {
          ...dto,
          paymentTermsDays: dto.paymentTermsDays ?? PAYMENT_TERMS_DEFAULT_DAYS,
        },
        include: { branches: true },
      });
      return toCustomerDto(customer);
    } catch (err) {
      throw await this.mapAbnConflict(err, dto.abn);
    }
  }

  async update(id: string, dto: UpdateCustomerDto, user: AuthUser): Promise<CustomerDto> {
    const data = defined(dto);
    this.rejectNulls(data, ['legalName', 'billingEmail', 'paymentTermsDays'], {
      legalName: 'Legal name is required',
      billingEmail: 'Enter a valid email address',
      paymentTermsDays: 'Payment terms must be a whole number of days from 0 to 90',
    });
    if (data.paymentTermsDays !== undefined) {
      this.requireFieldPermission(user, Permission.CustomersEditTerms, ['paymentTermsDays']);
    }
    const existing = await this.findCustomer(id);
    if (data.abn && data.abn !== existing.abn) await this.assertAbnFree(data.abn, id);
    try {
      const customer = await this.prisma.customer.update({
        where: { id },
        data,
        include: { branches: true },
      });
      return toCustomerDto(customer);
    } catch (err) {
      throw await this.mapAbnConflict(err, data.abn, id);
    }
  }

  async deactivate(id: string): Promise<CustomerDto> {
    await this.findCustomer(id);
    // Conditional write keeps the first deactivatedAt under concurrent calls.
    await this.prisma.customer.updateMany({
      where: { id, isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    return this.get(id);
  }

  async reactivate(id: string): Promise<CustomerDto> {
    await this.findCustomer(id);
    await this.prisma.customer.updateMany({
      where: { id, isActive: false },
      data: { isActive: true, deactivatedAt: null },
    });
    return this.get(id);
  }

  async createBranch(customerId: string, dto: CreateBranchDto): Promise<BranchDto> {
    await this.findCustomer(customerId);
    const branch = await this.prisma.branch.create({ data: { ...dto, customerId } });
    return toBranchDto(branch);
  }

  async updateBranch(id: string, dto: UpdateBranchDto, user: AuthUser): Promise<BranchDto> {
    const data = defined(dto);
    this.rejectNulls(data, BRANCH_REQUIRED_FIELDS, {
      name: 'Branch name is required',
      addressLine1: 'Address line 1 is required',
      suburb: 'Suburb is required',
      state: 'Choose a state or territory',
      postcode: 'Postcode must be 4 digits',
    });
    const others = Object.keys(data).filter(
      (k) => !(BRANCH_CONTACT_FIELDS as readonly string[]).includes(k),
    );
    if (others.length > 0) this.requireFieldPermission(user, Permission.BranchesWrite, others);

    await this.findBranch(id);
    const branch = await this.prisma.branch.update({
      where: { id },
      data,
    });
    return toBranchDto(branch);
  }

  async deactivateBranch(id: string): Promise<BranchDto> {
    await this.findBranch(id);
    await this.prisma.branch.updateMany({
      where: { id, isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    return toBranchDto(await this.findBranch(id));
  }

  async reactivateBranch(id: string): Promise<BranchDto> {
    await this.findBranch(id);
    // Row lock on the customer so it cannot be deactivated between the check and the write.
    await this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findUniqueOrThrow({ where: { id } });
      if (branch.isActive) return;
      const [customer] = await tx.$queryRaw<{ id: string; isActive: boolean }[]>(
        Prisma.sql`SELECT id, "isActive" FROM customers WHERE id = ${branch.customerId}::uuid FOR SHARE`,
      );
      if (!customer.isActive) {
        throw apiError(
          409,
          'CUSTOMER_INACTIVE',
          'Reactivate the customer before reactivating its branches',
          { meta: { customerId: customer.id } },
        );
      }
      await tx.branch.update({ where: { id }, data: { isActive: true, deactivatedAt: null } });
    });
    return toBranchDto(await this.findBranch(id));
  }

  private listWhere(query: ListCustomersQuery): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (query.status === 'inactive') conditions.push(Prisma.sql`c."isActive" = false`);
    else if (query.status !== 'all') conditions.push(Prisma.sql`c."isActive" = true`);

    const term = query.search?.trim();
    if (term) {
      const pattern = `%${escapeLike(term)}%`;
      const alternatives: Prisma.Sql[] = [
        Prisma.sql`c."legalName" ILIKE ${pattern}`,
        Prisma.sql`c."tradingName" ILIKE ${pattern}`,
        Prisma.sql`EXISTS (SELECT 1 FROM branches b WHERE b."customerId" = c.id
          AND (b.name ILIKE ${pattern} OR b.suburb ILIKE ${pattern}))`,
      ];
      if (/^[\d ]+$/.test(term)) {
        alternatives.push(Prisma.sql`c.abn LIKE ${`%${term.replace(/ /g, '')}%`}`);
      }
      conditions.push(Prisma.sql`(${Prisma.join(alternatives, ' OR ')})`);
    }

    if (query.state) {
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM branches b WHERE b."customerId" = c.id
        AND b."isActive" = true AND b.state = ${query.state}::"AustralianState")`);
    }

    return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  }

  private async findCustomer(id: string) {
    const customer = isUUID(id)
      ? await this.prisma.customer.findUnique({ where: { id }, include: { branches: true } })
      : null;
    if (!customer) throw apiError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    return customer;
  }

  private async findBranch(id: string) {
    const branch = isUUID(id) ? await this.prisma.branch.findUnique({ where: { id } }) : null;
    if (!branch) throw apiError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
    return branch;
  }

  private requireFieldPermission(user: AuthUser, permission: Permission, fields: string[]): void {
    if (!hasPermission(user, permission)) {
      throw apiError(403, 'FORBIDDEN', "You don't have permission to do this", {
        meta: { fields },
      });
    }
  }

  private rejectNulls(
    data: object,
    fields: readonly string[],
    messages: Record<string, string>,
  ): void {
    const record = data as Record<string, unknown>;
    const fieldErrors = fields
      .filter((f) => record[f] === null)
      .map((field) => ({ field, code: 'isNotEmpty', message: messages[field] }));
    if (fieldErrors.length > 0) {
      throw apiError(400, 'VALIDATION_FAILED', 'Some fields need attention', { fieldErrors });
    }
  }

  private async assertAbnFree(abn: string, exceptId?: string): Promise<void> {
    const owner = await this.prisma.customer.findUnique({ where: { abn } });
    if (owner && owner.id !== exceptId) throw this.abnTaken(owner);
  }

  /** Maps a unique violation on abn (a race between two saves) to the same 409. */
  private async mapAbnConflict(err: unknown, abn: string | null | undefined, exceptId?: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && abn) {
      const owner = await this.prisma.customer.findUnique({ where: { abn } });
      if (owner && owner.id !== exceptId) return this.abnTaken(owner);
    }
    return err;
  }

  private abnTaken(owner: { id: string; legalName: string; tradingName: string | null }) {
    const name = displayName(owner);
    const message = `This ABN is already used by ${name}`;
    return apiError(409, 'ABN_TAKEN', message, {
      fieldErrors: [{ field: 'abn', code: 'abnTaken', message }],
      meta: { customerId: owner.id, displayName: name },
    });
  }
}
