/**
 * Money arrives from the API as a decimal string in AUD (e.g. "1234.50"), from Prisma Decimal(12,2).
 * Never convert it with Number/parseFloat for arithmetic: totals and GST come from the server.
 */
const DECIMAL = /^-?\d+(\.\d+)?$/;

const audFormatter = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

/** "1234.5" → "$1,234.50". Missing values show as an em dash. */
export function formatAud(amount: string | null | undefined): string {
  if (amount == null || amount === '') return '—';
  if (!DECIMAL.test(amount)) throw new Error(`Not a decimal money string: "${amount}"`);
  // Intl formats numeric strings exactly, without going through a float.
  return audFormatter.format(amount as Intl.StringNumericLiteral);
}

export interface GstAmounts {
  subtotalExGst: string;
  gstAmount: string;
  totalIncGst: string;
}

/** Formats the three amounts the API returns on invoices and orders. */
export function formatGstBreakdown(amounts: GstAmounts): Record<keyof GstAmounts, string> {
  return {
    subtotalExGst: formatAud(amounts.subtotalExGst),
    gstAmount: formatAud(amounts.gstAmount),
    totalIncGst: formatAud(amounts.totalIncGst),
  };
}
