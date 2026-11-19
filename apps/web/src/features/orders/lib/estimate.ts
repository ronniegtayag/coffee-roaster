import Big from 'big.js';
import type { TaxCode } from '../types';

export interface EstimateLine {
  quantity: number;
  unitPriceExGst: string;
  taxCode: TaxCode;
  /** Grams per bag for coffee products, null otherwise. */
  bagSizeGrams: number | null;
}

export interface Estimate {
  subtotalExGst: string;
  gstAmount: string;
  totalIncGst: string;
  totalWeightGrams: number;
}

/** big.js rounding mode 1 = round half up, the rule the API uses (ordering design section 3). */
const ROUND_HALF_UP = 1;

/**
 * A live estimate while the form is open: the same per-line GST rule as the server (10% of the line
 * ex-GST, rounded half up to the cent). The saved figures always come from the API.
 */
export function estimateTotals(lines: EstimateLine[]): Estimate {
  let subtotal = new Big(0);
  let gst = new Big(0);
  let weight = 0;
  for (const line of lines) {
    const lineEx = new Big(line.unitPriceExGst).times(line.quantity);
    const lineGst =
      line.taxCode === 'GST' ? lineEx.times('0.1').round(2, ROUND_HALF_UP) : new Big(0);
    subtotal = subtotal.plus(lineEx);
    gst = gst.plus(lineGst);
    if (line.bagSizeGrams) weight += line.bagSizeGrams * line.quantity;
  }
  return {
    subtotalExGst: subtotal.toFixed(2),
    gstAmount: gst.toFixed(2),
    totalIncGst: subtotal.plus(gst).toFixed(2),
    totalWeightGrams: weight,
  };
}

/** One line's ex-GST, GST and inc-GST estimate. */
export function estimateLine(line: Omit<EstimateLine, 'bagSizeGrams'>) {
  const { subtotalExGst, gstAmount, totalIncGst } = estimateTotals([
    { ...line, bagSizeGrams: null },
  ]);
  return { lineTotalExGst: subtotalExGst, gstAmount, lineTotalIncGst: totalIncGst };
}
