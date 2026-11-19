import { AUSTRALIAN_STATES, type AustralianState, type CustomerStatusFilter } from './types';

/** Customer list filters as they appear in the URL. Defaults are left out to keep URLs clean. */
export interface CustomerListSearch {
  page?: number;
  search?: string;
  status?: CustomerStatusFilter;
  state?: AustralianState;
}

/** Beyond this the URL is junk; the API would reject or choke on it. */
const MAX_PAGE = 100_000;

export const DEFAULT_STATUS: CustomerStatusFilter = 'active';

/** Never throws: junk in the URL falls back to defaults. */
export function validateCustomerListSearch(raw: Record<string, unknown>): CustomerListSearch {
  const page = Number(raw.page);
  const search = typeof raw.search === 'string' ? raw.search.trim().slice(0, 100) : '';
  const status = ['active', 'inactive', 'all'].includes(raw.status as string)
    ? (raw.status as CustomerStatusFilter)
    : undefined;
  const state = AUSTRALIAN_STATES.find((s) => s === raw.state);
  return {
    page: Number.isInteger(page) && page > 1 && page <= MAX_PAGE ? page : undefined,
    search: search || undefined,
    status: status && status !== DEFAULT_STATUS ? status : undefined,
    state,
  };
}
