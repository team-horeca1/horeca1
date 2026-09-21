/**
 * Multi-vendor + holiday + cutoff delivery-plan API simulation.
 * Run: DATABASE_URL=... npx tsx scripts/qa-delivery-plan-multivendor.ts
 */
import { prisma } from '../src/lib/prisma';
import { computeNextDeliveryDate, toLocalYmd } from '../src/modules/delivery/nextDeliveryDate';

async function modesFor(vendorId: string, pincode: string, orderAt: Date) {
  const [vendor, area, holidays] = await Promise.all([
    prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessName: true, selfPickupOffered: true, deliverThroughPublicHolidays: true },
    }),
    prisma.serviceArea.findFirst({
      where: { vendorId, pincode, isActive: true },
      select: {
        deliversMon: true, deliversTue: true, deliversWed: true, deliversThu: true,
        deliversFri: true, deliversSat: true, deliversSun: true,
        cutoffTime: true, thirdPartyDeliveryAvailable: true,
      },
    }),
    prisma.platformHoliday.findMany({ select: { holidayDate: true } }),
  ]);
  if (!vendor || !area) return { vendor: vendor?.businessName, pincode, modes: [] as string[], date: null as string | null };

  const holidayDates = holidays.map((h) => h.holidayDate.toISOString().slice(0, 10));
  const hasDays =
    area.deliversMon || area.deliversTue || area.deliversWed || area.deliversThu ||
    area.deliversFri || area.deliversSat || area.deliversSun;

  const modes: string[] = [];
  let date: string | null = null;
  if (hasDays) {
    const next = computeNextDeliveryDate({
      plan: area,
      orderAt,
      deliverThroughPublicHolidays: vendor.deliverThroughPublicHolidays,
      holidayDates,
    });
    if (next) {
      modes.push('supplier_delivery');
      date = toLocalYmd(next);
    }
  }
  if (area.thirdPartyDeliveryAvailable) modes.push('third_party');
  if (vendor.selfPickupOffered) modes.push('self_pickup');
  return { vendor: vendor.businessName, pincode, modes, date, cutoff: area.cutoffTime };
}

async function main() {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true, serviceAreas: { some: { isActive: true } } },
    take: 3,
    select: {
      id: true,
      businessName: true,
      deliverThroughPublicHolidays: true,
      serviceAreas: { where: { isActive: true }, take: 1, select: { pincode: true, id: true } },
    },
  });

  console.log('\n=== Multi-vendor mode independence ===\n');
  const orderAt = new Date();
  for (const v of vendors) {
    const pin = v.serviceAreas[0]?.pincode;
    if (!pin) continue;
    const snap = await modesFor(v.id, pin, orderAt);
    console.log(JSON.stringify(snap));
  }

  // Holiday + override on first vendor's first pincode: force Mon-only, holiday on next Mon
  const v0 = vendors[0];
  const area = v0.serviceAreas[0];
  if (!area) throw new Error('no area');

  const before = {
    deliversMon: true, deliversTue: false, deliversWed: false, deliversThu: false,
    deliversFri: false, deliversSat: false, deliversSun: false, cutoffTime: '16:00',
  };
  // Pick a Monday in the future relative to a fixed Wed after cutoff
  const wedAfter = new Date(2026, 8, 16, 17, 0); // → would be Mon 21
  const holidayMon = '2026-09-21';

  const skip = computeNextDeliveryDate({
    plan: before,
    orderAt: wedAfter,
    deliverThroughPublicHolidays: false,
    holidayDates: [holidayMon],
  });
  const keep = computeNextDeliveryDate({
    plan: before,
    orderAt: wedAfter,
    deliverThroughPublicHolidays: true,
    holidayDates: [holidayMon],
  });
  console.log('\n=== Holiday override ===');
  console.log('skip (flag off):', skip && toLocalYmd(skip), 'expected 2026-09-28 (next Mon)');
  console.log('keep (flag on):', keep && toLocalYmd(keep), 'expected 2026-09-21');

  // Cutoff before/after same day
  const mwf = {
    deliversMon: true, deliversTue: false, deliversWed: true, deliversThu: false,
    deliversFri: true, deliversSat: false, deliversSun: false, cutoffTime: '16:00',
  };
  const beforeCut = computeNextDeliveryDate({
    plan: mwf, orderAt: new Date(2026, 8, 16, 15, 0), deliverThroughPublicHolidays: true, holidayDates: [],
  });
  const afterCut = computeNextDeliveryDate({
    plan: mwf, orderAt: new Date(2026, 8, 16, 17, 0), deliverThroughPublicHolidays: true, holidayDates: [],
  });
  console.log('\n=== Cutoff roll ===');
  console.log('before 16:00 Wed:', beforeCut && toLocalYmd(beforeCut), 'expected 2026-09-16');
  console.log('after 16:00 Wed:', afterCut && toLocalYmd(afterCut), 'expected 2026-09-18');

  const ok =
    skip && toLocalYmd(skip) === '2026-09-28' &&
    keep && toLocalYmd(keep) === '2026-09-21' &&
    beforeCut && toLocalYmd(beforeCut) === '2026-09-16' &&
    afterCut && toLocalYmd(afterCut) === '2026-09-18' &&
    vendors.length >= 2;

  console.log(ok ? '\nALL MULTI-VENDOR CHECKS PASSED\n' : '\nSOME CHECKS FAILED\n');
  process.exitCode = ok ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
