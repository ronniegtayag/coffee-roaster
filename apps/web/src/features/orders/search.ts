import { isBusinessDateString } from '@/shared/lib/dates';
import { ORDER_STATUSES, type OrderStatus } from './types';

/** Order list filters as they appear in the URL. */
export interface OrderListSearch {
  page?: number;
  search?: string;
  /** Comma-separated statuses; absent means the open statuses. */
  status?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  roastDate?: string;
  customerId?: string;
  branchId?: string;
}

const MAX_PAGE = 100_000;
const idParam = (value: unknown) =>
  typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : undefined;

export function parseStatuses(value: string | undefined): OrderStatus[] {
  return (value?.split(',') ?? []).filter((s): s is OrderStatus =>
    ORDER_STATUSES.includes(s as OrderStatus),
  );
}

/** Never throws: junk in the URL falls back to the default view. */
export function validateOrderListSearch(raw: Record<string, unknown>): OrderListSearch {
  const page = Number(raw.page);
  const search = typeof raw.search === 'string' ? raw.search.trim().slice(0, 100) : '';
  const statuses = typeof raw.status === 'string' ? parseStatuses(raw.status) : [];
  const date = (value: unknown) => (isBusinessDateString(value) ? value : undefined);
  return {
    page: Number.isInteger(page) && page > 1 && page <= MAX_PAGE ? page : undefined,
    search: search || undefined,
    status: statuses.length > 0 ? statuses.join(',') : undefined,
    deliveryFrom: date(raw.deliveryFrom),
    deliveryTo: date(raw.deliveryTo),
    roastDate: date(raw.roastDate),
    customerId: idParam(raw.customerId),
    branchId: idParam(raw.branchId),
  };
}

/** The default view (no date or search filter) shows upcoming orders from today. */
export function isDefaultView(search: OrderListSearch): boolean {
  return !search.deliveryFrom && !search.deliveryTo && !search.roastDate && !search.search;
}
