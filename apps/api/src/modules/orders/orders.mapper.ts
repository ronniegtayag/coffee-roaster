import { customerDisplayName } from '../customers';
import { dateToString } from '../../common/business-date';
import { formatMoney } from '../../common/money';
import type {
  Branch,
  Customer,
  Order,
  OrderEvent,
  OrderItem,
  Product,
  Coffee,
  User,
} from '../../generated/prisma/client';
import {
  AllowedActionsDto,
  CutoffDto,
  OrderDto,
  OrderEventDto,
  OrderLineDto,
  OrderListItemDto,
} from './dto/order.dto';

export type OrderLineRow = OrderItem & { product: Product & { coffee: Coffee | null } };
export type OrderListRow = Order & {
  customer: Customer;
  branch: Branch;
  _count: { items: number };
};
export type OrderDetailRow = Order & {
  customer: Customer;
  branch: Branch;
  items: OrderLineRow[];
  createdBy: Pick<User, 'id' | 'name'>;
  updatedBy: Pick<User, 'id' | 'name'>;
  events: (OrderEvent & { user: Pick<User, 'id' | 'name'> })[];
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export const formatOrderNumber = (n: number): string => `ORD-${n}`;

export function toListItemDto(
  o: Order & { customer: Customer; branch: Branch },
  lineCount: number,
  pastCutoff: boolean,
): OrderListItemDto {
  return {
    id: o.id,
    orderNumber: formatOrderNumber(o.orderNumber),
    status: o.status,
    deliveryDate: dateToString(o.deliveryDate),
    roastDate: dateToString(o.roastDate),
    customer: {
      id: o.customer.id,
      displayName: customerDisplayName(o.customer),
      isActive: o.customer.isActive,
    },
    branch: {
      id: o.branch.id,
      name: o.branch.name,
      suburb: o.branch.suburb,
      isActive: o.branch.isActive,
    },
    lineCount,
    totalWeightGrams: Number(o.totalWeightGrams),
    subtotalExGst: formatMoney(o.subtotalExGst),
    gstAmount: formatMoney(o.gstAmount),
    totalIncGst: formatMoney(o.totalIncGst),
    afterCutoff: o.afterCutoff,
    pastCutoff,
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function toLineDto(i: OrderLineRow): OrderLineDto {
  return {
    id: i.id,
    productId: i.productId,
    sku: i.product.sku,
    description: i.description,
    taxCode: i.taxCode,
    quantity: i.quantity,
    unitPriceExGst: formatMoney(i.unitPriceExGst),
    lineTotalExGst: formatMoney(i.lineTotalExGst),
    gstAmount: formatMoney(i.gstAmount),
    lineTotalIncGst: formatMoney(i.lineTotalIncGst),
    productOrderable: i.product.isActive && (i.product.coffee?.isActive ?? true),
  };
}

export const sortLines = <T extends { description: string }>(lines: T[]): T[] =>
  [...lines].sort((a, b) => a.description.toLowerCase().localeCompare(b.description.toLowerCase()));

export function toEventDto(e: OrderDetailRow['events'][number]): OrderEventDto {
  return {
    id: e.id,
    type: e.type,
    user: { id: e.user.id, name: e.user.name },
    reason: e.reason,
    changes: (e.changes as Record<string, unknown> | null) ?? null,
    at: e.at.toISOString(),
  };
}

export function toOrderDto(
  o: OrderDetailRow,
  extra: { pastCutoff: boolean; cutoff: CutoffDto; allowedActions: AllowedActionsDto },
): OrderDto {
  return {
    ...toListItemDto(o, o.items.length, extra.pastCutoff),
    version: o.version,
    notes: o.notes,
    cutoff: extra.cutoff,
    branch: {
      id: o.branch.id,
      name: o.branch.name,
      isActive: o.branch.isActive,
      addressLine1: o.branch.addressLine1,
      addressLine2: o.branch.addressLine2,
      suburb: o.branch.suburb,
      state: o.branch.state,
      postcode: o.branch.postcode,
      contactName: o.branch.contactName,
      contactPhone: o.branch.contactPhone,
      deliveryNotes: o.branch.deliveryNotes,
    },
    lines: sortLines(o.items.map(toLineDto)),
    cancelReason: o.cancelReason,
    confirmedAt: iso(o.confirmedAt),
    packedAt: iso(o.packedAt),
    dispatchedAt: iso(o.dispatchedAt),
    deliveredAt: iso(o.deliveredAt),
    cancelledAt: iso(o.cancelledAt),
    createdAt: o.createdAt.toISOString(),
    createdBy: { id: o.createdBy.id, name: o.createdBy.name },
    updatedBy: { id: o.updatedBy.id, name: o.updatedBy.name },
    allowedActions: extra.allowedActions,
    events: [...o.events].sort((a, b) => b.at.getTime() - a.at.getTime()).map(toEventDto),
  };
}
