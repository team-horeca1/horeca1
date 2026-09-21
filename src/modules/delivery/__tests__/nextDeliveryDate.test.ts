import { describe, expect, it } from 'vitest';
import { computeNextDeliveryDate, type DeliveryPlanSchedule } from '../nextDeliveryDate';

const mwf: DeliveryPlanSchedule = {
  deliversMon: true,
  deliversTue: false,
  deliversWed: true,
  deliversThu: false,
  deliversFri: true,
  deliversSat: false,
  deliversSun: false,
  cutoffTime: '16:00',
};

/** Wednesday 2026-09-16 15:00 local */
function wedBeforeCutoff(): Date {
  return new Date(2026, 8, 16, 15, 0, 0);
}

/** Wednesday 2026-09-16 17:00 local */
function wedAfterCutoff(): Date {
  return new Date(2026, 8, 16, 17, 0, 0);
}

describe('computeNextDeliveryDate', () => {
  it('uses order calendar day when order is at or before cutoff', () => {
    // Wed before cutoff → Wed is ticked → same day
    const result = computeNextDeliveryDate({
      plan: mwf,
      orderAt: wedBeforeCutoff(),
      deliverThroughPublicHolidays: false,
      holidayDates: [],
    });
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(8);
    expect(result!.getDate()).toBe(16);
  });

  it('starts from next calendar day when order is after cutoff', () => {
    // Wed after cutoff → start Thu → next ticked is Fri 18 Sep
    const result = computeNextDeliveryDate({
      plan: mwf,
      orderAt: wedAfterCutoff(),
      deliverThroughPublicHolidays: false,
      holidayDates: [],
    });
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(18);
    expect(result!.getDay()).toBe(5); // Friday
  });

  it('handles a pincode with only one ticked day', () => {
    const mondayOnly: DeliveryPlanSchedule = {
      ...mwf,
      deliversMon: true,
      deliversWed: false,
      deliversFri: false,
    };
    // Order Wed after cutoff → next Mon 21 Sep
    const result = computeNextDeliveryDate({
      plan: mondayOnly,
      orderAt: wedAfterCutoff(),
      deliverThroughPublicHolidays: false,
      holidayDates: [],
    });
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(21);
    expect(result!.getDay()).toBe(1);
  });

  it('skips holiday when deliverThroughPublicHolidays is false', () => {
    // Fri 18 Sep is a holiday; after Wed cutoff → would be Fri, skip to Mon 21
    const result = computeNextDeliveryDate({
      plan: mwf,
      orderAt: wedAfterCutoff(),
      deliverThroughPublicHolidays: false,
      holidayDates: ['2026-09-18'],
    });
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(21);
  });

  it('accepts holiday date when deliverThroughPublicHolidays is true', () => {
    const result = computeNextDeliveryDate({
      plan: mwf,
      orderAt: wedAfterCutoff(),
      deliverThroughPublicHolidays: true,
      holidayDates: ['2026-09-18'],
    });
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(18);
  });

  it('returns null when no Delivery Plan row exists', () => {
    const result = computeNextDeliveryDate({
      plan: null,
      orderAt: wedBeforeCutoff(),
      deliverThroughPublicHolidays: false,
      holidayDates: [],
    });
    expect(result).toBeNull();
  });

  it('returns null within 14-day cap when all days are false (no infinite loop)', () => {
    const none: DeliveryPlanSchedule = {
      deliversMon: false,
      deliversTue: false,
      deliversWed: false,
      deliversThu: false,
      deliversFri: false,
      deliversSat: false,
      deliversSun: false,
      cutoffTime: '16:00',
    };
    const result = computeNextDeliveryDate({
      plan: none,
      orderAt: wedBeforeCutoff(),
      deliverThroughPublicHolidays: false,
      holidayDates: [],
    });
    expect(result).toBeNull();
  });
});
