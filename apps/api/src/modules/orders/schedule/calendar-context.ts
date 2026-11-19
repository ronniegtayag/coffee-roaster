import { addDays, isoWeekday } from '../../../common/business-date';
import type {
  CalendarSettingsData,
  Cutoff,
  ScheduleReason,
  ScheduleSuggestion,
} from './schedule.types';

const SEARCH_LIMIT_DAYS = 366;

/**
 * Pure calendar maths over a settings snapshot and the closure dates. All dates are plain
 * Sydney dates ("YYYY-MM-DD"); "now" is a Sydney wall-clock string "YYYY-MM-DDTHH:mm:ss".
 */
export class CalendarContext {
  constructor(
    readonly settings: CalendarSettingsData,
    private readonly closures: ReadonlySet<string>,
  ) {}

  isBusinessDay(d: string): boolean {
    return this.settings.businessDays.includes(isoWeekday(d)) && !this.closures.has(d);
  }

  isRoastDay(d: string): boolean {
    return this.settings.roastDays.includes(isoWeekday(d)) && !this.closures.has(d);
  }

  isDeliveryDay(d: string): boolean {
    return this.settings.deliveryDays.includes(isoWeekday(d)) && !this.closures.has(d);
  }

  /** Steps forward over business days; n = 0 returns d unchanged. */
  addBusinessDays(d: string, n: number): string {
    let current = d;
    let remaining = n;
    for (let i = 0; remaining > 0 && i < SEARCH_LIMIT_DAYS * 2; i++) {
      current = addDays(current, 1);
      if (this.isBusinessDay(current)) remaining--;
    }
    return current;
  }

  subBusinessDays(d: string, n: number): string {
    let current = d;
    let remaining = n;
    for (let i = 0; remaining > 0 && i < SEARCH_LIMIT_DAYS * 2; i++) {
      current = addDays(current, -1);
      if (this.isBusinessDay(current)) remaining--;
    }
    return current;
  }

  cutoffOf(roastDate: string): Cutoff {
    return {
      date: this.subBusinessDays(roastDate, this.settings.cutoffLeadBusinessDays),
      time: this.settings.cutoffTime,
    };
  }

  /** At exactly the cut-off time the cut-off has passed. */
  isPastCutoff(roastDate: string, nowDateTime: string): boolean {
    const cutoff = this.cutoffOf(roastDate);
    return `${cutoff.date}T${cutoff.time}:00` <= nowDateTime;
  }

  evaluate(
    roastDate: string,
    deliveryDate: string,
    nowDateTime: string,
  ): { onSchedule: boolean; reasons: ScheduleReason[] } {
    const reasons: ScheduleReason[] = [];
    if (this.isPastCutoff(roastDate, nowDateTime)) reasons.push('CUTOFF_PASSED');
    if (!this.isRoastDay(roastDate)) reasons.push('NOT_A_ROAST_DAY');
    if (!this.isDeliveryDay(deliveryDate)) reasons.push('NOT_A_DELIVERY_DAY');
    if (this.addBusinessDays(roastDate, this.settings.deliveryLagBusinessDays) > deliveryDate) {
      reasons.push('DELIVERY_TOO_SOON');
    }
    return { onSchedule: reasons.length === 0, reasons };
  }

  /** First delivery day on or after the earliest delivery for a roast date; null if none within a year. */
  deliveryFor(roastDate: string): string | null {
    const earliest = this.addBusinessDays(roastDate, this.settings.deliveryLagBusinessDays);
    for (let i = 0; i < SEARCH_LIMIT_DAYS; i++) {
      const d = addDays(earliest, i);
      if (this.isDeliveryDay(d)) return d;
    }
    return null;
  }

  /** From now: the first roast day whose cut-off has not passed, and the delivery that follows. */
  suggestFromNow(today: string, nowDateTime: string): ScheduleSuggestion | null {
    for (let i = 0; i < SEARCH_LIMIT_DAYS; i++) {
      const roastDate = addDays(today, i);
      if (!this.isRoastDay(roastDate) || this.isPastCutoff(roastDate, nowDateTime)) continue;
      const deliveryDate = this.deliveryFor(roastDate);
      if (!deliveryDate) return null;
      return this.describe(roastDate, deliveryDate, nowDateTime);
    }
    return null;
  }

  /**
   * From a delivery date: the latest roast day that can still make it. A roast date before
   * `today` is clamped to today, so a same-day rush shows up as off schedule, not as an error.
   */
  suggestFromDelivery(
    deliveryDate: string,
    nowDateTime: string,
    today: string,
  ): ScheduleSuggestion | null {
    for (let i = 0; i < SEARCH_LIMIT_DAYS; i++) {
      const roastDate = addDays(deliveryDate, -i);
      if (!this.isRoastDay(roastDate)) continue;
      if (this.addBusinessDays(roastDate, this.settings.deliveryLagBusinessDays) > deliveryDate) {
        continue;
      }
      const clamped = roastDate < today ? today : roastDate;
      return this.describe(clamped, deliveryDate, nowDateTime);
    }
    return null;
  }

  describe(roastDate: string, deliveryDate: string, nowDateTime: string): ScheduleSuggestion {
    const { onSchedule, reasons } = this.evaluate(roastDate, deliveryDate, nowDateTime);
    return { roastDate, deliveryDate, cutoff: this.cutoffOf(roastDate), onSchedule, reasons };
  }
}
