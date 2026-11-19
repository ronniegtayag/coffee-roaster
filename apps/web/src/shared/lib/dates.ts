import { APP_TIMEZONE } from '../config/env';

/**
 * Business dates (issue, due, delivery) arrive as "YYYY-MM-DD" strings meaning a Sydney calendar day.
 * Never pass them to `new Date()`: that reads them as UTC midnight, which can show the wrong day.
 */
const BUSINESS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const businessDateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const timestampFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: APP_TIMEZONE,
});

// en-CA formats dates as YYYY-MM-DD.
const isoDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE });

/** "2026-11-19" → "19 Nov 2026". Missing values show as an em dash. */
export function formatBusinessDate(date: string | null | undefined): string {
  if (!date) return '—';
  const match = BUSINESS_DATE.exec(date);
  if (!match) throw new Error(`Not a YYYY-MM-DD business date: "${date}"`);
  const [, y, m, d] = match;
  // Build the day in UTC and format it in UTC, so the browser's own timezone can't shift it.
  return businessDateFormatter.format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))));
}

/** An ISO timestamp (UTC) shown in Sydney time: "19 Nov 2026, 2:05 pm". */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Not an ISO timestamp: "${iso}"`);
  return timestampFormatter.format(date);
}

/** Today's date in Sydney as "YYYY-MM-DD", e.g. for a default due-date field. */
export function todayInSydney(now: Date = new Date()): string {
  return isoDayFormatter.format(now);
}

const longBusinessDateFormatter = new Intl.DateTimeFormat('en-AU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function parseBusinessDate(date: string): [number, number, number] {
  const match = BUSINESS_DATE.exec(date);
  if (!match) throw new Error(`Not a YYYY-MM-DD business date: "${date}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** "2026-11-24" → "Tue 24 Nov". */
export function formatBusinessDateLong(date: string | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = parseBusinessDate(date);
  return longBusinessDateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

/** "12:00" → "12:00 pm", "09:30" → "9:30 am". */
export function formatClockTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? 'pm' : 'am';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${suffix}`;
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"); negative if `to` is earlier. */
export function daysBetweenBusinessDates(from: string, to: string): number {
  const [fy, fm, fd] = parseBusinessDate(from);
  const [ty, tm, td] = parseBusinessDate(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** True for a well-formed "YYYY-MM-DD" (not checked against the calendar). */
export function isBusinessDateString(value: unknown): value is string {
  return typeof value === 'string' && BUSINESS_DATE.test(value);
}
