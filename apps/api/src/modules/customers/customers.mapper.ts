import type { Branch, Customer } from '../../generated/prisma/client';
import { BranchDto } from './dto/branch.dto';
import { CustomerDto, CustomerListItemDto } from './dto/customer.dto';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toBranchDto(b: Branch): BranchDto {
  return {
    id: b.id,
    customerId: b.customerId,
    name: b.name,
    addressLine1: b.addressLine1,
    addressLine2: b.addressLine2,
    suburb: b.suburb,
    state: b.state,
    postcode: b.postcode,
    contactName: b.contactName,
    contactPhone: b.contactPhone,
    deliveryNotes: b.deliveryNotes,
    isActive: b.isActive,
    deactivatedAt: iso(b.deactivatedAt),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export const displayName = (c: Pick<Customer, 'legalName' | 'tradingName'>): string =>
  c.tradingName ?? c.legalName;

export function toListItemDto(c: Customer, activeBranchCount: number): CustomerListItemDto {
  return {
    id: c.id,
    displayName: displayName(c),
    legalName: c.legalName,
    tradingName: c.tradingName,
    abn: c.abn,
    billingEmail: c.billingEmail,
    phone: c.phone,
    paymentTermsDays: c.paymentTermsDays,
    isActive: c.isActive,
    activeBranchCount,
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Active branches first, then inactive; each group by name, case-insensitive. */
export function sortBranches(branches: Branch[]): Branch[] {
  return [...branches].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}

export function toCustomerDto(c: Customer & { branches: Branch[] }): CustomerDto {
  return {
    ...toListItemDto(c, c.branches.filter((b) => b.isActive).length),
    notes: c.notes,
    deactivatedAt: iso(c.deactivatedAt),
    createdAt: c.createdAt.toISOString(),
    branches: sortBranches(c.branches).map(toBranchDto),
  };
}
