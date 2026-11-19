/** Wire types for the customers API (docs/design/auth-and-customers.md section 4). */
export const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;
export type AustralianState = (typeof AUSTRALIAN_STATES)[number];

export type CustomerStatusFilter = 'active' | 'inactive' | 'all';

export interface CustomerListFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CustomerStatusFilter;
  state?: AustralianState;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CustomerListItem {
  id: string;
  displayName: string;
  legalName: string;
  tradingName: string | null;
  /** 11 digits, no spaces. */
  abn: string | null;
  billingEmail: string;
  phone: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  activeBranchCount: number;
  updatedAt: string;
}

export interface Branch {
  id: string;
  customerId: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  suburb: string;
  state: AustralianState;
  postcode: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryNotes: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer extends CustomerListItem {
  notes: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  branches: Branch[];
}

export interface CustomerInput {
  legalName: string;
  tradingName: string | null;
  abn: string | null;
  billingEmail: string;
  phone: string | null;
  paymentTermsDays?: number;
  notes: string | null;
}

export interface BranchInput {
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  suburb: string;
  state: AustralianState;
  postcode: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryNotes: string | null;
}

/** Working default until the roaster confirms (Q8). Not a business rule. */
export const PAYMENT_TERMS_DEFAULT_DAYS = 14;
export const PAYMENT_TERMS_MAX_DAYS = 90;
