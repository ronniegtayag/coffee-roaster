import {
  addDays,
  compareDates,
  dateToString,
  isoWeekday,
  isPlainDate,
  stringToDate,
} from './business-date';

describe('business-date helpers', () => {
  it.each([
    ['2026-11-23', 1],
    ['2026-11-27', 5],
    ['2026-11-28', 6],
    ['2026-11-29', 7],
  ])('isoWeekday(%s) = %i', (d, n) => expect(isoWeekday(d)).toBe(n));

  it('addDays crosses month, year and DST boundaries by whole days', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-03', 1)).toBe('2026-10-04');
    expect(addDays('2026-10-04', 1)).toBe('2026-10-05');
    expect(addDays('2026-04-04', 2)).toBe('2026-04-06');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-11-24', -1)).toBe('2026-11-23');
  });

  it('isPlainDate rejects malformed and impossible dates', () => {
    expect(isPlainDate('2026-11-24')).toBe(true);
    expect(isPlainDate('2024-02-29')).toBe(true);
    for (const bad of [
      '2026-02-30',
      '2025-02-29',
      '2026-13-01',
      '2026-1-1',
      '24/11/2026',
      '',
      '2026-11-24T00:00:00Z',
    ]) {
      expect(isPlainDate(bad)).toBe(false);
    }
  });

  it('round-trips through the @db.Date representation (UTC midnight) with no shift', () => {
    const d = stringToDate('2026-11-24');
    expect(d.toISOString()).toBe('2026-11-24T00:00:00.000Z');
    expect(dateToString(d)).toBe('2026-11-24');
  });

  it('compareDates orders lexically', () => {
    expect(compareDates('2026-11-24', '2026-11-25')).toBe(-1);
    expect(compareDates('2026-11-25', '2026-11-25')).toBe(0);
    expect(compareDates('2027-01-01', '2026-12-31')).toBe(1);
  });
});
