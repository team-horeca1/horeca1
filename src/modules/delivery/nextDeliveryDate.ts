/**
 * Pure next-delivery-date walker for Delivery Plan.
 * No DB writes — safe to call from checkout without side effects.
 */

export type DeliveryPlanSchedule = {
  deliversMon: boolean;
  deliversTue: boolean;
  deliversWed: boolean;
  deliversThu: boolean;
  deliversFri: boolean;
  deliversSat: boolean;
  deliversSun: boolean;
  cutoffTime: string; // HH:MM
};

export type ComputeNextDeliveryDateInput = {
  plan: DeliveryPlanSchedule | null;
  /** Order timestamp (local or absolute — weekday/time are taken from this Date). */
  orderAt: Date;
  deliverThroughPublicHolidays: boolean;
  /** ISO date strings YYYY-MM-DD (UTC calendar date of the holiday). */
  holidayDates: ReadonlySet<string> | readonly string[];
  /** Max calendar days to walk (inclusive of start). Default 14. */
  maxDays?: number;
};

const DAY_FLAGS: Array<keyof Pick<
  DeliveryPlanSchedule,
  | 'deliversMon'
  | 'deliversTue'
  | 'deliversWed'
  | 'deliversThu'
  | 'deliversFri'
  | 'deliversSat'
  | 'deliversSun'
>> = [
  'deliversSun', // JS getDay() 0
  'deliversMon',
  'deliversTue',
  'deliversWed',
  'deliversThu',
  'deliversFri',
  'deliversSat',
];

/** Calendar YYYY-MM-DD in local timezone of `d`. */
export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseCutoffMinutes(cutoffTime: string): number {
  const match = cutoffTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 16 * 60;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function asHolidaySet(
  holidayDates: ReadonlySet<string> | readonly string[],
): ReadonlySet<string> {
  return holidayDates instanceof Set ? holidayDates : new Set(holidayDates);
}

/**
 * Given a Delivery Plan row + order timestamp, return the next valid delivery
 * calendar date (local midnight Date), or null if none within the search cap.
 */
export function computeNextDeliveryDate(
  input: ComputeNextDeliveryDateInput,
): Date | null {
  const { plan, orderAt, deliverThroughPublicHolidays } = input;
  if (!plan) return null;

  const maxDays = input.maxDays ?? 14;
  const holidays = asHolidaySet(input.holidayDates);

  const anyDay =
    plan.deliversMon ||
    plan.deliversTue ||
    plan.deliversWed ||
    plan.deliversThu ||
    plan.deliversFri ||
    plan.deliversSat ||
    plan.deliversSun;
  if (!anyDay) return null;

  const orderMinutes = orderAt.getHours() * 60 + orderAt.getMinutes();
  const cutoffMinutes = parseCutoffMinutes(plan.cutoffTime);
  let cursor = startOfLocalDay(orderAt);
  if (orderMinutes > cutoffMinutes) {
    cursor = addDays(cursor, 1);
  }

  for (let i = 0; i < maxDays; i++) {
    const candidate = addDays(cursor, i);
    const flag = DAY_FLAGS[candidate.getDay()];
    if (!plan[flag]) continue;

    const ymd = toLocalYmd(candidate);
    if (!deliverThroughPublicHolidays && holidays.has(ymd)) continue;

    return candidate;
  }

  return null;
}
