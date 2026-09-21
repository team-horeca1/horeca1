/**
 * Thin loader around computeNextDeliveryDate — fetches plan + holidays from DB.
 * Still performs no writes.
 */

import { prisma } from '@/lib/prisma';
import {
  computeNextDeliveryDate,
  toLocalYmd,
  type DeliveryPlanSchedule,
} from './nextDeliveryDate';

export async function loadNextDeliveryDate(opts: {
  vendorId: string;
  pincode: string;
  orderAt?: Date;
}): Promise<Date | null> {
  const orderAt = opts.orderAt ?? new Date();

  const [area, vendor, holidays] = await Promise.all([
    prisma.serviceArea.findFirst({
      where: {
        vendorId: opts.vendorId,
        pincode: opts.pincode,
        isActive: true,
      },
      select: {
        deliversMon: true,
        deliversTue: true,
        deliversWed: true,
        deliversThu: true,
        deliversFri: true,
        deliversSat: true,
        deliversSun: true,
        cutoffTime: true,
      },
    }),
    prisma.vendor.findUnique({
      where: { id: opts.vendorId },
      select: { deliverThroughPublicHolidays: true },
    }),
    prisma.platformHoliday.findMany({
      where: {
        holidayDate: {
          gte: new Date(toLocalYmd(orderAt) + 'T00:00:00.000Z'),
        },
      },
      select: { holidayDate: true },
      take: 60,
    }),
  ]);

  if (!area) {
    return null;
  }

  const plan: DeliveryPlanSchedule = {
    deliversMon: area.deliversMon,
    deliversTue: area.deliversTue,
    deliversWed: area.deliversWed,
    deliversThu: area.deliversThu,
    deliversFri: area.deliversFri,
    deliversSat: area.deliversSat,
    deliversSun: area.deliversSun,
    cutoffTime: area.cutoffTime,
  };

  const result = computeNextDeliveryDate({
    plan,
    orderAt,
    deliverThroughPublicHolidays: vendor?.deliverThroughPublicHolidays ?? false,
    holidayDates: holidays.map((h) => h.holidayDate.toISOString().slice(0, 10)),
  });

  if (!result) {
    console.warn(
      `[delivery] No next delivery date within 14 days for vendor=${opts.vendorId} pincode=${opts.pincode}`,
    );
  }

  return result;
}
