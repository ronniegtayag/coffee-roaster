/**
 * Business dates are plain Australia/Sydney dates ("YYYY-MM-DD"). Never parse them with
 * `new Date(str)`; arithmetic here uses UTC-midnight Dates so DST can't shift a day.
 */

export interface SydneyNow {
  /** "YYYY-MM-DD" in the business timezone. */
  date: string;
  /** "HH:mm:ss" in the business timezone. */
  time: string;
  /** "YYYY-MM-DDTHH:mm:ss", comparable as a string. */
  dateTime: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function toBusinessNow(instant: Date, timeZone: string): SydneyNow {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) parts[p.type] = p.value;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}:${parts.second}`;
  return { date, time, dateTime: `${date}T${time}` };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isPlainDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUtc(date: string): Date {
  const m = DATE_RE.exec(date)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

const fromUtc = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const dow = toUtc(date).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Prisma `@db.Date` value (UTC midnight) to "YYYY-MM-DD". */
export function dateToString(d: Date): string {
  return fromUtc(d);
}

/** "YYYY-MM-DD" to a Date for a `@db.Date` column (UTC midnight, no timezone shift). */
export function stringToDate(date: string): Date {
  return toUtc(date);
}

export const compareDates = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
