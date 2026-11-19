import type { Order, OrderListItem } from '@/features/orders/types';
import type { Product } from '@/features/products/types';
import type { Branch, Customer, CustomerListItem, Page } from '@/features/customers/types';
import type { Permission, SessionUser } from '@/stores/auth.store';

export const MANAGER_PERMISSIONS: Permission[] = [
  'products:read',
  'products:write',
  'orders:read',
  'orders:write',
  'orders:late-change',
  'orders:fulfil',
  'orders:short-supply',
  'customers:read',
  'customers:write',
  'customers:edit-terms',
  'customers:deactivate',
  'branches:write',
  'branches:update-contact',
  'branches:deactivate',
];
export const STAFF_PERMISSIONS: Permission[] = [
  'customers:read',
  'branches:update-contact',
  'products:read',
  'orders:read',
  'orders:write',
  'orders:fulfil',
];
export const ADMIN_PERMISSIONS: Permission[] = [...MANAGER_PERMISSIONS, 'settings:roast-calendar'];

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

export const admin: SessionUser = {
  id: 'u-admin',
  email: 'ada@example.com',
  name: 'Ada Admin',
  role: 'ADMIN',
  permissions: ADMIN_PERMISSIONS,
};

export function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    sku: 'HE-1KG-WB',
    kind: 'COFFEE',
    displayName: 'House Espresso — 1 kg — Whole bean',
    name: null,
    coffee: { id: 'cf-1', name: 'House Espresso', type: 'BLEND', isActive: true },
    bagSizeGrams: 1000,
    grind: { id: 'g-1', name: 'Whole bean' },
    listPriceExGst: '34.00',
    taxCode: 'GST_FREE',
    isActive: true,
    orderable: true,
    deactivatedAt: null,
    createdAt: '2026-11-19T05:52:51.000Z',
    updatedAt: '2026-11-19T05:52:51.000Z',
    ...overrides,
  };
}

export function orderListItem(overrides: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: 'o-1',
    orderNumber: 'ORD-1001',
    status: 'CONFIRMED',
    deliveryDate: '2026-11-26',
    roastDate: '2026-11-25',
    customer: { id: 'c-1', displayName: 'Bean There', isActive: true },
    branch: { id: 'b-1', name: 'Surry Hills', suburb: 'Surry Hills', isActive: true },
    lineCount: 2,
    totalWeightGrams: 14500,
    subtotalExGst: '444.36',
    gstAmount: '3.64',
    totalIncGst: '448.00',
    afterCutoff: false,
    pastCutoff: false,
    updatedAt: '2026-11-19T05:52:51.000Z',
    ...overrides,
  };
}

const NO_ACTIONS = {
  editLines: 'none',
  editRoastDate: false,
  editDeliveryDate: false,
  editNotes: false,
  confirm: false,
  pack: false,
  dispatch: false,
  deliver: false,
  cancel: false,
  revert: false,
  delete: false,
  copy: false,
} as const;

export function order(
  overrides: Partial<Omit<Order, 'allowedActions'>> & {
    allowedActions?: Partial<Order['allowedActions']>;
  } = {},
): Order {
  const { allowedActions, ...rest } = overrides;
  const { branch: _b, ...base } = orderListItem();
  void _b;
  return {
    ...base,
    version: 3,
    notes: null,
    cutoff: { date: '2026-11-24', time: '12:00' },
    branch: {
      id: 'b-1',
      name: 'Surry Hills',
      isActive: true,
      addressLine1: '1 Crown St',
      addressLine2: null,
      suburb: 'Surry Hills',
      state: 'NSW',
      postcode: '2010',
      contactName: 'Sam',
      contactPhone: '0400 000 000',
      deliveryNotes: 'Back lane after 7am',
    },
    lines: [
      {
        id: 'l-1',
        productId: 'p-1',
        sku: 'HE-1KG-WB',
        description: 'House Espresso — 1 kg — Whole bean',
        taxCode: 'GST_FREE',
        quantity: 12,
        unitPriceExGst: '34.00',
        lineTotalExGst: '408.00',
        gstAmount: '0.00',
        lineTotalIncGst: '408.00',
        productOrderable: true,
      },
      {
        id: 'l-2',
        productId: 'p-9',
        sku: 'CT-100',
        description: 'Cleaning tablets — tub of 100',
        taxCode: 'GST',
        quantity: 2,
        unitPriceExGst: '18.18',
        lineTotalExGst: '36.36',
        gstAmount: '3.64',
        lineTotalIncGst: '40.00',
        productOrderable: true,
      },
    ],
    cancelReason: null,
    confirmedAt: '2026-11-19T05:52:51.000Z',
    packedAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    createdAt: '2026-11-19T05:52:51.000Z',
    createdBy: { id: 'u-staff', name: 'Sam Staff' },
    updatedBy: { id: 'u-staff', name: 'Sam Staff' },
    allowedActions: { ...NO_ACTIONS, ...allowedActions },
    events: [],
    ...rest,
  };
}
