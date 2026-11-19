export type ScheduleReason =
  'CUTOFF_PASSED' | 'NOT_A_ROAST_DAY' | 'NOT_A_DELIVERY_DAY' | 'DELIVERY_TOO_SOON';

export interface Cutoff {
  /** Sydney local date "YYYY-MM-DD". */
  date: string;
  /** Sydney local time "HH:mm". */
  time: string;
}

export interface ScheduleSuggestion {
  roastDate: string;
  deliveryDate: string;
  cutoff: Cutoff;
  onSchedule: boolean;
  reasons: ScheduleReason[];
}

export interface CalendarSettingsData {
  roastDays: number[];
  deliveryDays: number[];
  businessDays: number[];
  cutoffTime: string;
  cutoffLeadBusinessDays: number;
  deliveryLagBusinessDays: number;
  updatedAt: Date;
}
