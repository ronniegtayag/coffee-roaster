import { describe, expect, it } from 'vitest';
import { estimateLine, estimateTotals } from './estimate';

describe('estimateTotals matches the server worked examples', () => {
  it('12 x 34.00 GST-free', () => {
    expect(
      estimateTotals([
        { quantity: 12, unitPriceExGst: '34.00', taxCode: 'GST_FREE', bagSizeGrams: 1000 },
      ]),
    ).toEqual({
      subtotalExGst: '408.00',
      gstAmount: '0.00',
      totalIncGst: '408.00',
      totalWeightGrams: 12000,
    });
  });

  it('mixed order: 444.36 / 3.64 / 448.00', () => {
    const t = estimateTotals([
      { quantity: 12, unitPriceExGst: '34.00', taxCode: 'GST_FREE', bagSizeGrams: 1000 },
      { quantity: 2, unitPriceExGst: '18.18', taxCode: 'GST', bagSizeGrams: null },
    ]);
    expect(t).toMatchObject({ subtotalExGst: '444.36', gstAmount: '3.64', totalIncGst: '448.00' });
  });

  it('3 x 12.35 GST rounds 3.705 half-up to 3.71', () => {
    expect(estimateLine({ quantity: 3, unitPriceExGst: '12.35', taxCode: 'GST' })).toEqual({
      lineTotalExGst: '37.05',
      gstAmount: '3.71',
      lineTotalIncGst: '40.76',
    });
  });

  it('1 x 0.05 GST rounds 0.005 half-up to 0.01', () => {
    expect(estimateLine({ quantity: 1, unitPriceExGst: '0.05', taxCode: 'GST' })).toEqual({
      lineTotalExGst: '0.05',
      gstAmount: '0.01',
      lineTotalIncGst: '0.06',
    });
  });

  it('rounds per line, not on the total: two 0.05 GST lines give 0.02, not 0.01', () => {
    const t = estimateTotals([
      { quantity: 1, unitPriceExGst: '0.05', taxCode: 'GST', bagSizeGrams: null },
      { quantity: 1, unitPriceExGst: '0.05', taxCode: 'GST', bagSizeGrams: null },
    ]);
    expect(t.gstAmount).toBe('0.02');
  });

  it('has no float drift at the caps (999 x 9999.99 GST)', () => {
    expect(estimateLine({ quantity: 999, unitPriceExGst: '9999.99', taxCode: 'GST' })).toEqual({
      lineTotalExGst: '9989990.01',
      gstAmount: '998999.00',
      lineTotalIncGst: '10988989.01',
    });
  });

  it('classic float traps: 3 x 0.10 and 0.1 + 0.2 style sums stay exact', () => {
    expect(
      estimateLine({ quantity: 3, unitPriceExGst: '0.10', taxCode: 'GST_FREE' }).lineTotalExGst,
    ).toBe('0.30');
    const t = estimateTotals([
      { quantity: 1, unitPriceExGst: '0.10', taxCode: 'GST_FREE', bagSizeGrams: null },
      { quantity: 1, unitPriceExGst: '0.20', taxCode: 'GST_FREE', bagSizeGrams: null },
    ]);
    expect(t.subtotalExGst).toBe('0.30');
  });

  it('is zero for no lines and only coffee lines add weight', () => {
    expect(estimateTotals([])).toEqual({
      subtotalExGst: '0.00',
      gstAmount: '0.00',
      totalIncGst: '0.00',
      totalWeightGrams: 0,
    });
    expect(
      estimateTotals([
        { quantity: 12, unitPriceExGst: '34.00', taxCode: 'GST_FREE', bagSizeGrams: 1000 },
        { quantity: 2, unitPriceExGst: '11.50', taxCode: 'GST_FREE', bagSizeGrams: 250 },
        { quantity: 2, unitPriceExGst: '18.18', taxCode: 'GST', bagSizeGrams: null },
      ]).totalWeightGrams,
    ).toBe(12500);
  });
});
