import { Prisma } from '../generated/prisma/client';
import type { TaxCode } from '../generated/prisma/client';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

export const MAX_UNIT_PRICE = new Decimal('9999.99');
/** Request money format: up to 4 integer digits, up to 2 decimals. */
export const MONEY_PATTERN = /^\d{1,4}(\.\d{1,2})?$/;

export interface LineAmounts {
  lineTotalExGst: Decimal;
  gstAmount: Decimal;
  lineTotalIncGst: Decimal;
}

/** GST is per line: 10% of the ex-GST total rounded half-up to cents; GST_FREE is 0. */
export function lineAmounts(
  quantity: number,
  unitPriceExGst: Decimal,
  taxCode: TaxCode,
): LineAmounts {
  const lineTotalExGst = unitPriceExGst.times(quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const gstAmount =
    taxCode === 'GST'
      ? lineTotalExGst.times('0.1').toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : new Decimal(0);
  return { lineTotalExGst, gstAmount, lineTotalIncGst: lineTotalExGst.plus(gstAmount) };
}

export interface OrderTotals {
  subtotalExGst: Decimal;
  gstAmount: Decimal;
  totalIncGst: Decimal;
  /** Sum of bagSizeGrams x quantity over coffee lines. */
  totalWeightGrams: number;
}

export interface TotalsLine extends LineAmounts {
  quantity: number;
  /** Null for non-coffee lines. */
  bagSizeGrams: number | null;
}

export function orderTotals(lines: TotalsLine[]): OrderTotals {
  const zero = new Decimal(0);
  const subtotalExGst = lines.reduce((t, l) => t.plus(l.lineTotalExGst), zero);
  const gstAmount = lines.reduce((t, l) => t.plus(l.gstAmount), zero);
  const totalWeightGrams = lines.reduce((t, l) => t + (l.bagSizeGrams ?? 0) * l.quantity, 0);
  return { subtotalExGst, gstAmount, totalIncGst: subtotalExGst.plus(gstAmount), totalWeightGrams };
}

/** Money for DTOs: always exactly 2 decimals. */
export function formatMoney(value: Decimal | string): string {
  return new Decimal(value).toFixed(2);
}

/** Parses a request price string; returns null if it breaks the format or the 0 < price <= 9999.99 rule. */
export function parsePrice(value: unknown): Decimal | null {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) return null;
  const price = new Decimal(value);
  return price.gt(0) && price.lte(MAX_UNIT_PRICE) ? price : null;
}
