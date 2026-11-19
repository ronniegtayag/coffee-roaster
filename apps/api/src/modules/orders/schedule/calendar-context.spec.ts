import { toBusinessNow } from '../../../common/business-date';
import { CalendarContext } from './calendar-context';
import type { CalendarSettingsData } from './schedule.types';

const WEEKDAYS = [1, 2, 3, 4, 5];
const defaults: CalendarSettingsData = {
  roastDays: WEEKDAYS,
  deliveryDays: WEEKDAYS,
  businessDays: WEEKDAYS,
  cutoffTime: '12:00',
  cutoffLeadBusinessDays: 1,
  deliveryLagBusinessDays: 1,
  updatedAt: new Date(0),
};

function ctx(overrides: Partial<CalendarSettingsData> = {}, closures: string[] = []) {
  return new CalendarContext({ ...defaults, ...overrides }, new Set(closures));
}

/** Sydney wall-clock "now" for a UTC instant, as the service computes it. */
const at = (utc: string) => toBusinessNow(new Date(utc), 'Australia/Sydney');

describe('toBusinessNow (Sydney vs UTC)', () => {
  it('uses AEDT (UTC+11) in November', () => {
    expect(at('2026-11-23T23:00:00Z')).toMatchObject({ date: '2026-11-24', time: '10:00:00' });
  });

  it('crosses the day boundary at 13:00 UTC in AEDT', () => {
    expect(at('2026-11-23T12:59:59Z').date).toBe('2026-11-23');
    expect(at('2026-11-23T13:00:00Z').date).toBe('2026-11-24');
  });

  it('uses AEST (UTC+10) in June', () => {
    expect(at('2026-06-09T01:59:59Z')).toMatchObject({ date: '2026-06-09', time: '11:59:59' });
  });

  it('changes offset on the first Sunday in October and in April', () => {
    // AEST -> AEDT: 2026-10-04 02:00 AEST jumps to 03:00 AEDT.
    expect(at('2026-10-03T15:59:59Z').dateTime).toBe('2026-10-04T01:59:59');
    expect(at('2026-10-03T16:00:00Z').dateTime).toBe('2026-10-04T03:00:00');
    // AEDT -> AEST: 2026-04-05 03:00 AEDT falls back to 02:00 AEST.
    expect(at('2026-04-04T15:59:59Z').dateTime).toBe('2026-04-05T02:59:59');
    expect(at('2026-04-04T16:00:00Z').dateTime).toBe('2026-04-05T02:00:00');
  });

  it('formats midnight as 00:xx, never 24:xx', () => {
    expect(at('2026-11-23T13:00:00Z').time).toBe('00:00:00');
  });
});

describe('business days', () => {
  it('addBusinessDays skips weekends and returns the same day for 0', () => {
    const c = ctx();
    expect(c.addBusinessDays('2026-11-27', 1)).toBe('2026-11-30'); // Fri -> Mon
    expect(c.addBusinessDays('2026-11-24', 0)).toBe('2026-11-24');
    expect(c.addBusinessDays('2026-11-28', 1)).toBe('2026-11-30'); // Sat -> Mon
  });

  it('subBusinessDays skips weekends', () => {
    expect(ctx().subBusinessDays('2026-11-30', 1)).toBe('2026-11-27');
  });

  it('closure days are not business, roast or delivery days', () => {
    const c = ctx({}, ['2026-12-25']);
    expect(c.isBusinessDay('2026-12-25')).toBe(false);
    expect(c.isRoastDay('2026-12-25')).toBe(false);
    expect(c.isDeliveryDay('2026-12-25')).toBe(false);
    expect(c.addBusinessDays('2026-12-24', 1)).toBe('2026-12-28');
  });

  it('works across the DST changeover without shifting a day', () => {
    expect(ctx().addBusinessDays('2026-10-02', 1)).toBe('2026-10-05');
    expect(ctx().addBusinessDays('2026-04-02', 3)).toBe('2026-04-07');
  });
});

describe('cut-off', () => {
  it('is 12:00 on the business day before the roast date', () => {
    expect(ctx().cutoffOf('2026-11-25')).toEqual({ date: '2026-11-24', time: '12:00' });
    expect(ctx().cutoffOf('2026-11-30')).toEqual({ date: '2026-11-27', time: '12:00' });
  });

  it('a closure on the cut-off day moves the cut-off to the business day before', () => {
    expect(ctx({}, ['2026-11-24']).cutoffOf('2026-11-25').date).toBe('2026-11-23');
  });

  it('exactly 12:00:00 counts as past the cut-off; one second earlier does not', () => {
    const c = ctx();
    expect(c.isPastCutoff('2026-11-25', '2026-11-24T11:59:59')).toBe(false);
    expect(c.isPastCutoff('2026-11-25', '2026-11-24T12:00:00')).toBe(true);
  });

  it('AEDT oracle: Tue 6 Oct 2026 11:59:59 is before, 12:00:00 is past (Wed roast)', () => {
    const c = ctx();
    expect(c.isPastCutoff('2026-10-07', at('2026-10-06T00:59:59Z').dateTime)).toBe(false);
    expect(c.isPastCutoff('2026-10-07', at('2026-10-06T01:00:00Z').dateTime)).toBe(true);
  });

  it('AEST oracle: Tue 9 Jun 2026 11:59:59 is before, 12:00:00 is past (Wed roast)', () => {
    const c = ctx();
    expect(c.isPastCutoff('2026-06-10', at('2026-06-09T01:59:59Z').dateTime)).toBe(false);
    expect(c.isPastCutoff('2026-06-10', at('2026-06-09T02:00:00Z').dateTime)).toBe(true);
  });

  it('the Sydney/UTC boundary: 23:30 Sydney Monday is still Monday for the cut-off check', () => {
    // 2026-11-23 12:30Z is Mon 23:30 AEDT; the Wed 25 roast cut-off (Tue 24 12:00) has not passed.
    const now = at('2026-11-23T12:30:00Z');
    expect(now.date).toBe('2026-11-23');
    expect(ctx().isPastCutoff('2026-11-25', now.dateTime)).toBe(false);
    // Half an hour later it is Tuesday 00:30 Sydney, still before 12:00.
    expect(ctx().isPastCutoff('2026-11-25', at('2026-11-23T13:30:00Z').dateTime)).toBe(false);
  });

  it('cutoffLeadBusinessDays = 0 puts the cut-off on the roast day itself', () => {
    expect(ctx({ cutoffLeadBusinessDays: 0 }).cutoffOf('2026-11-25')).toEqual({
      date: '2026-11-25',
      time: '12:00',
    });
  });
});

describe('suggestions from now (design §5.2)', () => {
  const from = (utc: string, c = ctx()) => {
    const now = at(utc);
    return c.suggestFromNow(now.date, now.dateTime);
  };

  it('Tue 24 Nov 10:00 -> roast Wed 25, deliver Thu 26', () => {
    expect(from('2026-11-23T23:00:00Z')).toMatchObject({
      roastDate: '2026-11-25',
      deliveryDate: '2026-11-26',
      onSchedule: true,
      reasons: [],
      cutoff: { date: '2026-11-24', time: '12:00' },
    });
  });

  it('Tue 24 Nov 12:01 -> roast Thu 26, deliver Fri 27', () => {
    expect(from('2026-11-24T01:01:00Z')).toMatchObject({
      roastDate: '2026-11-26',
      deliveryDate: '2026-11-27',
    });
  });

  it('Tue 24 Nov exactly 12:00:00 is past the cut-off for Wed', () => {
    expect(from('2026-11-24T01:00:00Z')?.roastDate).toBe('2026-11-26');
  });

  it('Fri 27 Nov 15:00 -> roast Tue 1 Dec, deliver Wed 2 Dec', () => {
    expect(from('2026-11-27T04:00:00Z')).toMatchObject({
      roastDate: '2026-12-01',
      deliveryDate: '2026-12-02',
    });
  });

  it('Christmas: Wed 23 Dec 13:00 with Fri 25 and Mon 28 closed -> roast Tue 29, deliver Wed 30', () => {
    const s = from('2026-12-23T02:00:00Z', ctx({}, ['2026-12-25', '2026-12-28']));
    expect(s).toMatchObject({
      roastDate: '2026-12-29',
      deliveryDate: '2026-12-30',
      cutoff: { date: '2026-12-24', time: '12:00' },
    });
  });

  it('Mon 30 Nov 13:00: the Tuesday cut-off has passed, so roast is Wed 2 Dec', () => {
    // Mon 30 Nov 13:00: the cut-off for Tue 1 Dec (Mon 12:00) has passed, so Wed 2 Dec.
    expect(from('2026-11-30T02:00:00Z')?.roastDate).toBe('2026-12-02');
  });

  it('a closure on the suggested delivery day pushes delivery to the next delivery day', () => {
    const s = from('2026-11-23T23:00:00Z', ctx({}, ['2026-11-26']));
    expect(s).toMatchObject({ roastDate: '2026-11-25', deliveryDate: '2026-11-27' });
  });

  it('returns null when nothing is available within a year (everything closed)', () => {
    const c = ctx({ roastDays: [], businessDays: WEEKDAYS });
    expect(from('2026-11-23T23:00:00Z', c)).toBeNull();
  });
});

describe('suggestions from a delivery date (design §5.2)', () => {
  const now = at('2026-11-23T23:00:00Z'); // Tue 24 Nov 10:00

  it('Fri 27 Nov -> roast Thu 26', () => {
    expect(ctx().suggestFromDelivery('2026-11-27', now.dateTime, now.date)).toMatchObject({
      roastDate: '2026-11-26',
      deliveryDate: '2026-11-27',
      onSchedule: true,
    });
  });

  it('Mon 30 Nov -> roast Fri 27 Nov', () => {
    expect(ctx().suggestFromDelivery('2026-11-30', now.dateTime, now.date)?.roastDate).toBe(
      '2026-11-27',
    );
  });

  it('too late for the delivery date: roast is clamped to today and flagged off schedule', () => {
    const s = ctx().suggestFromDelivery('2026-11-24', now.dateTime, now.date);
    expect(s?.roastDate).toBe('2026-11-24');
    expect(s?.onSchedule).toBe(false);
    expect(s?.reasons).toContain('DELIVERY_TOO_SOON');
  });

  it('delivery whose roast cut-off has passed is off schedule with CUTOFF_PASSED', () => {
    const late = at('2026-11-24T01:01:00Z'); // Tue 12:01
    const s = ctx().suggestFromDelivery('2026-11-26', late.dateTime, late.date);
    expect(s).toMatchObject({ roastDate: '2026-11-25', onSchedule: false });
    expect(s?.reasons).toContain('CUTOFF_PASSED');
  });
});

describe('evaluate (reasons)', () => {
  const now = '2026-11-23T10:00:00';
  it('on schedule', () => {
    expect(ctx().evaluate('2026-11-25', '2026-11-26', now)).toEqual({
      onSchedule: true,
      reasons: [],
    });
  });

  it('weekend roast and delivery', () => {
    const r = ctx().evaluate('2026-11-28', '2026-11-29', now);
    expect(r.reasons).toEqual(expect.arrayContaining(['NOT_A_ROAST_DAY', 'NOT_A_DELIVERY_DAY']));
  });

  it('delivery too soon (same day as roast with lag 1)', () => {
    expect(ctx().evaluate('2026-11-25', '2026-11-25', now).reasons).toEqual(['DELIVERY_TOO_SOON']);
  });

  it('collects several reasons', () => {
    expect(ctx().evaluate('2026-11-23', '2026-11-23', '2026-11-23T10:00:00').reasons).toEqual([
      'CUTOFF_PASSED',
      'DELIVERY_TOO_SOON',
    ]);
  });

  it('deliveryLagBusinessDays = 0 allows delivery on the roast day', () => {
    expect(
      ctx({ deliveryLagBusinessDays: 0 }).evaluate('2026-11-25', '2026-11-25', now).onSchedule,
    ).toBe(true);
  });

  it('closure days show as not a roast or delivery day', () => {
    const r = ctx({}, ['2026-11-25', '2026-11-26']).evaluate('2026-11-25', '2026-11-26', now);
    expect(r.reasons).toEqual(expect.arrayContaining(['NOT_A_ROAST_DAY', 'NOT_A_DELIVERY_DAY']));
  });
});

describe('changed settings (OQ-PO-8 scenario)', () => {
  const twiceWeekly = ctx({ roastDays: [1, 4] });

  it('roasting Mon and Thu: Tue 10:00 -> roast Thu 26, deliver Fri 27', () => {
    const now = at('2026-11-23T23:00:00Z');
    expect(twiceWeekly.suggestFromNow(now.date, now.dateTime)).toMatchObject({
      roastDate: '2026-11-26',
      deliveryDate: '2026-11-27',
    });
  });

  it('a Wednesday roast is off schedule', () => {
    expect(
      twiceWeekly.evaluate('2026-11-25', '2026-11-26', '2026-11-23T10:00:00').reasons,
    ).toContain('NOT_A_ROAST_DAY');
  });

  it('delivery Wed 2 Dec with roast days Mon/Thu -> latest roast is Mon 30 Nov', () => {
    const now = at('2026-11-23T23:00:00Z');
    expect(twiceWeekly.suggestFromDelivery('2026-12-02', now.dateTime, now.date)?.roastDate).toBe(
      '2026-11-30',
    );
  });
});
