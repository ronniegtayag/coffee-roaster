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
