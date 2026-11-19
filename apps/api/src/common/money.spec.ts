import { Prisma } from '../generated/prisma/client';
import { lineAmounts, orderTotals } from './money';

const D = (v: string | number) => new Prisma.Decimal(v);
const str = (a: {
  lineTotalExGst: Prisma.Decimal;
  gstAmount: Prisma.Decimal;
  lineTotalIncGst: Prisma.Decimal;
}) => ({
  ex: a.lineTotalExGst.toFixed(2),
  gst: a.gstAmount.toFixed(2),
  inc: a.lineTotalIncGst.toFixed(2),
});

describe('lineAmounts (GST per line, half-up to cents)', () => {
  it('GST_FREE has no GST', () => {
    expect(str(lineAmounts(12, D('34.00'), 'GST_FREE'))).toEqual({
      ex: '408.00',
      gst: '0.00',
      inc: '408.00',
    });
  });

  it('GST is 10% of the ex-GST line total', () => {
    expect(str(lineAmounts(2, D('18.18'), 'GST'))).toEqual({
      ex: '36.36',
      gst: '3.64',
      inc: '40.00',
    });
  });

  it('rounds half-up on the line, not per unit: 3 x 12.35 -> 3.705 -> 3.71', () => {
    expect(str(lineAmounts(3, D('12.35'), 'GST'))).toEqual({
      ex: '37.05',
      gst: '3.71',
      inc: '40.76',
    });
  });

  it('rounds 0.005 up to 0.01', () => {
    expect(str(lineAmounts(1, D('0.05'), 'GST'))).toEqual({ ex: '0.05', gst: '0.01', inc: '0.06' });
  });

  it('rounds down when below half: 0.04 -> 0.004 -> 0.00', () => {
    expect(str(lineAmounts(1, D('0.04'), 'GST'))).toEqual({ ex: '0.04', gst: '0.00', inc: '0.04' });
  });

  it('per-line rounding differs from rounding the unit: 7 x 0.15 GST is 0.105 -> 0.11 (not 7 x 0.02)', () => {
    expect(lineAmounts(7, D('0.15'), 'GST').gstAmount.toFixed(2)).toBe('0.11');
  });

  it('handles the caps without float drift: 999 x 9999.99 with GST', () => {
    expect(str(lineAmounts(999, D('9999.99'), 'GST'))).toEqual({
      ex: '9989990.01',
      gst: '998999.00',
      inc: '10988989.01',
    });
  });

  it('inc = ex + gst exactly for many awkward prices', () => {
    for (let cents = 1; cents <= 400; cents++) {
      const price = D(cents).div(100);
      for (const qty of [1, 3, 7, 11, 999]) {
        const a = lineAmounts(qty, price, 'GST');
        expect(a.lineTotalIncGst.toFixed(2)).toBe(a.lineTotalExGst.plus(a.gstAmount).toFixed(2));
        expect(a.gstAmount.decimalPlaces()).toBeLessThanOrEqual(2);
      }
    }
  });

  it('never returns JS numbers for money', () => {
    const a = lineAmounts(2, D('1.10'), 'GST');
    expect(typeof a.lineTotalExGst).toBe('object');
    expect(a.lineTotalExGst.toFixed(2)).toBe('2.20');
  });
});

describe('orderTotals', () => {
  const lines = [
    { quantity: 12, unitPriceExGst: D('34.00'), taxCode: 'GST_FREE' as const, bagSizeGrams: 1000 },
    { quantity: 2, unitPriceExGst: D('18.18'), taxCode: 'GST' as const, bagSizeGrams: null },
  ];

  it('sums per-line amounts: mixed order totals 444.36 / 3.64 / 448.00', () => {
    const totals = orderTotals(
      lines.map((l) => ({ ...l, ...lineAmounts(l.quantity, l.unitPriceExGst, l.taxCode) })),
    );
    expect(totals.subtotalExGst.toFixed(2)).toBe('444.36');
    expect(totals.gstAmount.toFixed(2)).toBe('3.64');
    expect(totals.totalIncGst.toFixed(2)).toBe('448.00');
  });

  it('totalIncGst = subtotal + gst, and only coffee lines add weight', () => {
    const totals = orderTotals(
      [
        ...lines,
        {
          quantity: 2,
          unitPriceExGst: D('11.50'),
          taxCode: 'GST_FREE' as const,
          bagSizeGrams: 250,
        },
      ].map((l) => ({ ...l, ...lineAmounts(l.quantity, l.unitPriceExGst, l.taxCode) })),
    );
    expect(totals.totalWeightGrams).toBe(12 * 1000 + 2 * 250);
    expect(totals.totalIncGst.toFixed(2)).toBe(
      totals.subtotalExGst.plus(totals.gstAmount).toFixed(2),
    );
  });

  it('is zero for no lines', () => {
    const totals = orderTotals([]);
    expect(totals.subtotalExGst.toFixed(2)).toBe('0.00');
    expect(totals.totalWeightGrams).toBe(0);
  });
});
