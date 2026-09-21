/**
 * Shared Delivery Plan helpers (message preview, day keys).
 */

export const DELIVERY_DAY_KEYS = [
  'deliversMon',
  'deliversTue',
  'deliversWed',
  'deliversThu',
  'deliversFri',
  'deliversSat',
  'deliversSun',
] as const;

export type DeliveryDayKey = (typeof DELIVERY_DAY_KEYS)[number];

export const DELIVERY_DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const DELIVERY_DAY_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type DeliveryPlanDays = Record<DeliveryDayKey, boolean>;

/** Platform seed defaults — used for subtle "Default" provenance in UI. */
export const PLATFORM_DEFAULT_DAYS: DeliveryPlanDays = {
  deliversMon: true,
  deliversTue: false,
  deliversWed: true,
  deliversThu: false,
  deliversFri: true,
  deliversSat: false,
  deliversSun: false,
};

export const PLATFORM_DEFAULT_CUTOFF = '16:00';

/** Format HH:MM for customer-facing copy (e.g. "4:00 PM"). */
export function formatCutoffDisplay(cutoffTime: string): string {
  const match = cutoffTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return cutoffTime;
  const h = parseInt(match[1], 10);
  return `${h % 12 || 12}:${match[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function selectedDayLabels(days: DeliveryPlanDays): string[] {
  return DELIVERY_DAY_KEYS.filter((k) => days[k]).map(
    (k) => DELIVERY_DAY_SHORT[DELIVERY_DAY_KEYS.indexOf(k)],
  );
}

export function daysMatchDefaults(days: DeliveryPlanDays, defaults: DeliveryPlanDays = PLATFORM_DEFAULT_DAYS): boolean {
  return DELIVERY_DAY_KEYS.every((k) => days[k] === defaults[k]);
}

export function formatDaysCompact(days: DeliveryPlanDays): string {
  const names = selectedDayLabels(days);
  if (names.length === 0) return 'No days set';
  return names.join(' · ');
}

export type DeliveryPreviewKind = 'third_party' | 'none' | 'schedule';

export type DeliveryPreview = {
  kind: DeliveryPreviewKind;
  title: string;
  subtitle: string | null;
  /** Full customer-facing sentence (legacy string helper). */
  message: string;
};

export function buildDeliveryPreview(opts: {
  thirdPartyDeliveryAvailable: boolean;
  days: DeliveryPlanDays;
  cutoffTime: string;
}): DeliveryPreview {
  if (opts.thirdPartyDeliveryAvailable) {
    return {
      kind: 'third_party',
      title: '3rd-party delivery available',
      subtitle: 'Customers can choose partner dispatch at checkout',
      message:
        "3rd-party delivery available in your pincode — order now and we'll dispatch via Porter, Rapido, or a partner of your choice.",
    };
  }
  const names = selectedDayLabels(opts.days);
  if (names.length === 0) {
    return {
      kind: 'none',
      title: 'No delivery days set',
      subtitle: 'Customers won’t see supplier delivery for this pincode',
      message: 'No delivery days set for this pincode yet.',
    };
  }
  const cutoff = formatCutoffDisplay(opts.cutoffTime);
  return {
    kind: 'schedule',
    title: `Next delivery: ${names.join(', ')}`,
    subtitle: `Orders by ${cutoff}`,
    message: `Next delivery: ${names.join(', ')} (order by ${cutoff})`,
  };
}

export function buildDeliveryMessagePreview(opts: {
  thirdPartyDeliveryAvailable: boolean;
  days: DeliveryPlanDays;
  cutoffTime: string;
}): string {
  return buildDeliveryPreview(opts).message;
}
