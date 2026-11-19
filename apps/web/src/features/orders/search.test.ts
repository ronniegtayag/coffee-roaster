import { describe, expect, it } from 'vitest';
import { isDefaultView, parseStatuses, validateOrderListSearch } from './search';

describe('validateOrderListSearch', () => {
  it('keeps clean values and drops junk without throwing', () => {
    expect(
      validateOrderListSearch({
        page: '3',
        search: '  ord-1001  ',
        status: 'DRAFT,BOGUS,CONFIRMED',
        deliveryFrom: '2026-11-24',
        deliveryTo: 'tomorrow',
        roastDate: '2026-11-25',
        customerId: 'c-1',
        branchId: 'bad id!',
      }),
    ).toEqual({
      page: 3,
      search: 'ord-1001',
      status: 'DRAFT,CONFIRMED',
      deliveryFrom: '2026-11-24',
      deliveryTo: undefined,
      roastDate: '2026-11-25',
      customerId: 'c-1',
      branchId: undefined,
    });
  });

  it.each(['1e300', '100001', '0', '-3', 'abc', '1.5', 'Infinity', '1'])('ignores page %s', (p) => {
    expect(validateOrderListSearch({ page: p }).page).toBeUndefined();
  });

  it('treats an all-invalid status list as absent', () => {
    expect(validateOrderListSearch({ status: 'NOPE' }).status).toBeUndefined();
  });

  it('parseStatuses filters unknown values', () => {
    expect(parseStatuses('DRAFT,x,CANCELLED')).toEqual(['DRAFT', 'CANCELLED']);
    expect(parseStatuses(undefined)).toEqual([]);
  });

  it('isDefaultView is false once any date or search filter is set', () => {
    expect(isDefaultView({})).toBe(true);
    expect(isDefaultView({ status: 'DRAFT' })).toBe(true);
    for (const f of [
      { deliveryFrom: '2026-11-24' },
      { deliveryTo: '2026-11-24' },
      { roastDate: '2026-11-24' },
      { search: 'x' },
    ])
      expect(isDefaultView(f)).toBe(false);
  });
});
