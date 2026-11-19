import type { ActiveFilter } from './types';

export interface ProductListSearch {
  page?: number;
  search?: string;
  status?: ActiveFilter;
  kind?: 'coffee' | 'other';
  coffeeId?: string;
}

export const MAX_PAGE = 100_000;

export function validateProductListSearch(raw: Record<string, unknown>): ProductListSearch {
  const page = Number(raw.page);
  const search = typeof raw.search === 'string' ? raw.search.trim().slice(0, 100) : '';
  const status = raw.status === 'inactive' || raw.status === 'all' ? raw.status : undefined;
  const kind = raw.kind === 'coffee' || raw.kind === 'other' ? raw.kind : undefined;
  const coffeeId =
    typeof raw.coffeeId === 'string' && /^[\w-]{1,64}$/.test(raw.coffeeId)
      ? raw.coffeeId
      : undefined;
  return {
    page: Number.isInteger(page) && page > 1 && page <= MAX_PAGE ? page : undefined,
    search: search || undefined,
    status,
    kind,
    coffeeId,
  };
}

export interface CoffeeListSearch {
  search?: string;
  status?: ActiveFilter;
}

export function validateCoffeeListSearch(raw: Record<string, unknown>): CoffeeListSearch {
  const search = typeof raw.search === 'string' ? raw.search.trim().slice(0, 100) : '';
  return {
    search: search || undefined,
    status: raw.status === 'inactive' || raw.status === 'all' ? raw.status : undefined,
  };
}
