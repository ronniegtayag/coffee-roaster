import { describe, expect, it } from 'vitest';
import {
  daysBetweenBusinessDates,
  formatBusinessDate,
  formatBusinessDateLong,
  formatClockTime,
  formatTimestamp,
  isBusinessDateString,
  todayInSydney,
} from './dates';

describe('business dates (plain YYYY-MM-DD, never parsed as instants)', () => {
  it('formats the same day whatever the day boundary', () => {
    expect(formatBusinessDate('2026-11-19')).toBe('19 Nov 2026');
    expect(formatBusinessDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatBusinessDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('formats long dates with the weekday', () => {
    expect(formatBusinessDateLong('2026-11-24')).toMatch(/Tue.*24 Nov/);
    expect(formatBusinessDateLong('2026-11-27')).toMatch(/Fri.*27 Nov/);
  });

  it('shows a dash for missing and throws on malformed dates', () => {
    expect(formatBusinessDate(null)).toBe('—');
    expect(formatBusinessDateLong(undefined)).toBe('—');
    expect(() => formatBusinessDate('19/11/2026')).toThrow();
    expect(() => formatBusinessDateLong('2026-1-1')).toThrow();
  });

  it('counts whole days across the DST changeovers (first Sundays of Oct and Apr)', () => {
    expect(daysBetweenBusinessDates('2026-10-03', '2026-10-05')).toBe(2);
    expect(daysBetweenBusinessDates('2026-04-04', '2026-04-06')).toBe(2);
    expect(daysBetweenBusinessDates('2026-11-26', '2026-11-24')).toBe(-2);
    expect(daysBetweenBusinessDates('2026-11-24', '2026-11-24')).toBe(0);
    expect(daysBetweenBusinessDates('2026-11-19', '2027-02-17')).toBe(90);
  });

  it('validates the string shape', () => {
    expect(isBusinessDateString('2026-11-19')).toBe(true);
    for (const bad of [
      '2026-1-1',
      '',
      'tomorrow',
      20261119,
      null,
      undefined,
      '2026-11-19T00:00:00Z',
    ])
      expect(isBusinessDateString(bad)).toBe(false);
  });
});

describe('Sydney vs UTC day boundary', () => {
  it('todayInSydney is already tomorrow after 13:00 UTC in AEDT (UTC+11)', () => {
    expect(todayInSydney(new Date('2026-11-23T12:59:59Z'))).toBe('2026-11-23');
    expect(todayInSydney(new Date('2026-11-23T13:00:00Z'))).toBe('2026-11-24');
  });

  it('todayInSydney uses UTC+10 in winter (AEST)', () => {
    expect(todayInSydney(new Date('2026-06-09T13:59:59Z'))).toBe('2026-06-09');
    expect(todayInSydney(new Date('2026-06-09T14:00:00Z'))).toBe('2026-06-10');
  });

  it('switches offset at the changeovers: first Sunday in October and April', () => {
    // 2026-10-04 02:00 AEST becomes 03:00 AEDT, so 15:59Z on the 3rd is 01:59 AEST on the 4th.
    expect(todayInSydney(new Date('2026-10-03T15:59:59Z'))).toBe('2026-10-04');
    expect(todayInSydney(new Date('2026-10-03T13:59:59Z'))).toBe('2026-10-03');
    expect(todayInSydney(new Date('2026-10-03T14:00:00Z'))).toBe('2026-10-04');
    // 2026-04-05 03:00 AEDT becomes 02:00 AEST.
    expect(todayInSydney(new Date('2026-04-04T13:00:00Z'))).toBe('2026-04-05');
    expect(todayInSydney(new Date('2026-04-04T12:59:59Z'))).toBe('2026-04-04');
  });

  it('formats timestamps in Sydney time', () => {
    expect(formatTimestamp('2026-11-30T12:30:00.000Z')).toMatch(/30 Nov 2026.*11:30 pm/i);
    expect(formatTimestamp('2026-11-30T13:30:00.000Z')).toMatch(/1 Dec 2026.*12:30 am/i);
  });
});

describe('formatClockTime', () => {
  it.each([
    ['12:00', '12:00 pm'],
    ['09:30', '9:30 am'],
    ['00:15', '12:15 am'],
    ['23:59', '11:59 pm'],
  ])('%s -> %s', (t, out) => expect(formatClockTime(t)).toBe(out));
});
