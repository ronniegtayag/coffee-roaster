/** Wire types for the orders API (docs/design/ordering.md section 6.3 and 6.4). */
export type OrderStatus =
  'DRAFT' | 'CONFIRMED' | 'PACKED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export type TaxCode = 'GST' | 'GST_FREE';
export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

export const ORDER_STATUSES: OrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** What the API shows when no status filter is sent. */
export const DEFAULT_OPEN_STATUSES: OrderStatus[] = ['DRAFT', 'CONFIRMED', 'PACKED', 'DISPATCHED'];

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ListOrdersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  /** Comma-separated OrderStatus values. */
  status?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  roastDate?: string;
  customerId?: string;
  branchId?: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryDate: string;
  roastDate: string;
  customer: { id: string; displayName: string; isActive: boolean };
  branch: { id: string; name: string; suburb: string; isActive: boolean };
  lineCount: number;
  totalWeightGrams: number;
  subtotalExGst: string;
  gstAmount: string;
  totalIncGst: string;
  afterCutoff: boolean;
  pastCutoff: boolean;
  updatedAt: string;
}

export interface OrderLine {
  id: string;
  productId: string;
  sku: string;
  description: string;
  taxCode: TaxCode;
  quantity: number;
  unitPriceExGst: string;
  lineTotalExGst: string;
  gstAmount: string;
  lineTotalIncGst: string;
  /** False when the product (or its coffee) was deactivated since; show an "Inactive product" badge. */
  productOrderable: boolean;
}

export interface AllowedActions {
  editLines: 'full' | 'reduceOnly' | 'none';
  editRoastDate: boolean;
  editDeliveryDate: boolean;
  editNotes: boolean;
  confirm: boolean;
  pack: boolean;
  dispatch: boolean;
  deliver: boolean;
  cancel: boolean;
  revert: boolean;
  delete: boolean;
  copy: boolean;
}

export type OrderEventType =
  | 'CREATED'
  | 'UPDATED'
  | 'CONFIRMED'
  | 'PACKED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REVERTED';

export interface OrderEvent {
  id: string;
  type: OrderEventType;
  user: { id: string; name: string };
  reason: string | null;
  changes: Record<string, unknown> | null;
  at: string;
}

export interface Order extends Omit<OrderListItem, 'branch'> {
  version: number;
  notes: string | null;
  /** Cut-off for the roast date, Sydney local. */
  cutoff: { date: string; time: string };
  branch: {
    id: string;
    name: string;
    isActive: boolean;
    addressLine1: string;
    addressLine2: string | null;
    suburb: string;
    state: AustralianState;
    postcode: string;
    contactName: string | null;
    contactPhone: string | null;
    deliveryNotes: string | null;
  };
  lines: OrderLine[];
  cancelReason: string | null;
  confirmedAt: string | null;
  packedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  updatedBy: { id: string; name: string };
  allowedActions: AllowedActions;
  events: OrderEvent[];
}

export interface OrderLineInput {
  productId: string;
  quantity: number;
  /** Required for a product not already on the order: the price and tax code the form showed. */
  expectedUnitPriceExGst?: string;
  expectedTaxCode?: TaxCode;
}

export interface CreateOrderInput {
  requestId: string;
  branchId: string;
  deliveryDate?: string;
  roastDate?: string;
  notes?: string | null;
  lines?: OrderLineInput[];
}

export interface UpdateOrderInput {
  version: number;
  deliveryDate?: string;
  roastDate?: string;
  notes?: string | null;
  lines?: OrderLineInput[];
  /** Required when reducing or removing lines on a packed or dispatched order. */
  reason?: string;
}

export interface CopyOrderResult {
  order: Order;
  skippedLines: {
    productId: string;
    description: string;
    reason: 'PRODUCT_INACTIVE' | 'COFFEE_INACTIVE';
  }[];
}

export type ScheduleReason =
  'CUTOFF_PASSED' | 'NOT_A_ROAST_DAY' | 'NOT_A_DELIVERY_DAY' | 'DELIVERY_TOO_SOON';

export interface ScheduleSuggestion {
  roastDate: string;
  deliveryDate: string;
  cutoff: { date: string; time: string };
  onSchedule: boolean;
  reasons: ScheduleReason[];
}

export interface RoastSummary {
  roastDate: string;
  coffees: { coffeeId: string; coffeeName: string; totalWeightGrams: number; orderCount: number }[];
  totalWeightGrams: number;
}

export interface RoastCalendar {
  /** ISO weekdays: 1 (Mon) to 7 (Sun). */
  roastDays: number[];
  deliveryDays: number[];
  businessDays: number[];
  /** "HH:mm", Sydney time. */
  cutoffTime: string;
  cutoffLeadBusinessDays: number;
  deliveryLagBusinessDays: number;
  updatedAt: string;
}

export type RoastCalendarInput = Omit<RoastCalendar, 'updatedAt'>;

export interface ClosureDay {
  id: string;
  date: string;
  description: string;
}
