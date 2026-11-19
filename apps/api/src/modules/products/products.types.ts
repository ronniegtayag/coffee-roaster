import type { Prisma, TaxCode } from '../../generated/prisma/client';

/** The only thing orders needs from the catalogue. */
export interface OrderableProduct {
  id: string;
  sku: string;
  displayName: string;
  coffeeId: string | null;
  bagSizeGrams: number | null;
  listPriceExGst: Prisma.Decimal;
  taxCode: TaxCode;
  orderable: boolean;
  unavailableReason: 'PRODUCT_INACTIVE' | 'COFFEE_INACTIVE' | null;
}
