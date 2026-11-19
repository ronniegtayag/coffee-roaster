import type { Branch, Customer, CustomerListItem, Page } from '@/features/customers/types';
import type { Permission, SessionUser } from '@/stores/auth.store';

export const MANAGER_PERMISSIONS: Permission[] = [
  'customers:read',
  'customers:write',
  'customers:edit-terms',
  'customers:deactivate',
  'branches:write',
  'branches:update-contact',
  'branches:deactivate',
];
export const STAFF_PERMISSIONS: Permission[] = ['customers:read', 'branches:update-contact'];

export const manager: SessionUser = {
  id: 'u-manager',
  email: 'mia@example.com',
  name: 'Mia Manager',
  role: 'MANAGER',
  permissions: MANAGER_PERMISSIONS,
};
export const staff: SessionUser = {
  id: 'u-staff',
  email: 'sam@example.com',
  name: 'Sam Staff',
  role: 'STAFF',
  permissions: STAFF_PERMISSIONS,
};

export function sessionBody(user: SessionUser = manager) {
  return {
    accessToken: 'token-123',
    expiresIn: 900,
    sessionExpiresAt: '2026-11-20T01:00:00.000Z',
    user,
  };
}

export function listItem(overrides: Partial<CustomerListItem> = {}): CustomerListItem {
  return {
    id: 'c-1',
    displayName: 'Bean There',
    legalName: 'Bean There Pty Ltd',
    tradingName: 'Bean There',
    abn: '51824753556',
    billingEmail: 'ap@beanthere.com',
    phone: null,
    paymentTermsDays: 14,
    isActive: true,
    activeBranchCount: 2,
    updatedAt: '2026-11-19T05:52:51.000Z',
    ...overrides,
  };
}

export function branch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'b-1',
    customerId: 'c-1',
    name: 'Surry Hills',
    addressLine1: '1 Crown St',
    addressLine2: null,
    suburb: 'Surry Hills',
    state: 'NSW',
    postcode: '2010',
    contactName: 'Sam',
    contactPhone: '0400 000 000',
    deliveryNotes: 'Back lane after 7am',
    isActive: true,
    deactivatedAt: null,
    createdAt: '2026-11-19T05:52:51.000Z',
    updatedAt: '2026-11-19T05:52:51.000Z',
    ...overrides,
  };
}

export function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    ...listItem(),
    notes: null,
    deactivatedAt: null,
    createdAt: '2026-11-19T05:52:51.000Z',
    branches: [],
    ...overrides,
  };
}

export function page<T>(items: T[], overrides: Partial<Page<T>> = {}): Page<T> {
  return {
    items,
    page: 1,
    pageSize: 25,
    totalItems: items.length,
    totalPages: items.length === 0 ? 0 : 1,
    ...overrides,
  };
}

export function errorBody(
  statusCode: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return { statusCode, error: 'Error', code, message, ...extra };
}
