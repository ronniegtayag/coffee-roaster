/** Wire types for the products API (docs/design/ordering.md section 6.2). */
export type TaxCode = 'GST' | 'GST_FREE';
export type CoffeeType = 'SINGLE_ORIGIN' | 'BLEND';
export type ActiveFilter = 'active' | 'inactive' | 'all';

export const TAX_CODE_LABELS: Record<TaxCode, string> = { GST: 'GST', GST_FREE: 'GST-free' };
export const COFFEE_TYPE_LABELS: Record<CoffeeType, string> = {
  SINGLE_ORIGIN: 'Single origin',
  BLEND: 'Blend',
};

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Coffee {
  id: string;
  name: string;
  type: CoffeeType;
  origin: string | null;
  description: string | null;
  isActive: boolean;
  activeProductCount: number;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoffeeDetail extends Coffee {
  products: Product[];
}

export interface CoffeeInput {
  name: string;
  type: CoffeeType;
  origin: string | null;
  description: string | null;
}

export interface Grind {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Product {
  id: string;
  sku: string;
  kind: 'COFFEE' | 'OTHER';
  /** Built by the API ("House Espresso — 1 kg — Whole bean"); never build it here. */
  displayName: string;
  name: string | null;
  coffee: { id: string; name: string; type: CoffeeType; isActive: boolean } | null;
  bagSizeGrams: number | null;
  grind: { id: string; name: string } | null;
  /** AUD ex-GST, a decimal string like "34.00". */
  listPriceExGst: string;
  taxCode: TaxCode;
  isActive: boolean;
  /** isActive and its coffee (if any) is active. */
  orderable: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListProductsFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ActiveFilter;
  coffeeId?: string;
  kind?: 'coffee' | 'other';
}

export type CreateProductInput =
  | {
      sku: string;
      coffeeId: string;
      bagSizeGrams: number;
      grindId: string;
      listPriceExGst: string;
      taxCode: TaxCode;
    }
  | { sku: string; name: string; listPriceExGst: string; taxCode: TaxCode };

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  listPriceExGst?: string;
  taxCode?: TaxCode;
}
