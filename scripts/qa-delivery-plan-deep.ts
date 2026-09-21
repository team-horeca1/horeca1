/**
 * Delivery Plan deep QA — multi-vendor / holiday / cutoff / modes.
 * Run: npx tsx scripts/qa-delivery-plan-deep.ts
 */
import { prisma } from '../src/lib/prisma';
import { computeNextDeliveryDate } from '../src/modules/delivery/nextDeliveryDate';
import { lookupPincode } from '../src/lib/pincodeLookup';
import { buildDeliveryMessagePreview } from '../src/lib/deliveryPlanMessage';

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];
function assert(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('\n=== Delivery Plan deep QA ===\n');

  // 1. Lookup
  assert('lookup known pincode 400705', lookupPincode('400705')?.city === 'Navi Mumbai');
  assert('lookup unknown pincode returns null', lookupPincode('999999') === null);

  // 2. Message preview
  assert(
    'message: no days',
    buildDeliveryMessagePreview({
      thirdPartyDeliveryAvailable: false,
      days: {
        deliversMon: false,
        deliversTue: false,
        deliversWed: false,
        deliversThu: false,
        deliversFri: false,
        deliversSat: false,
        deliversSun: false,
      },
      cutoffTime: '16:00',
    }).includes('No delivery days'),
  );
  assert(
    'message: 3rd party wins over days',
    buildDeliveryMessagePreview({
      thirdPartyDeliveryAvailable: true,
      days: {
        deliversMon: true,
        deliversTue: false,
        deliversWed: false,
        deliversThu: false,
        deliversFri: false,
        deliversSat: false,
        deliversSun: false,
      },
      cutoffTime: '16:00',
    }).includes('3rd-party'),
  );

  // 3. Cutoff + holiday pure logic (already unit-tested; reconfirm holiday skip)
  const mwf = {
    deliversMon: true,
    deliversTue: false,
    deliversWed: true,
    deliversThu: false,
    deliversFri: true,
    deliversSat: false,
    deliversSun: false,
    cutoffTime: '16:00',
  };
  const afterCutoff = new Date(2026, 8, 16, 17, 0); // Wed 17:00 → Fri 18
  const skipHoliday = computeNextDeliveryDate({
    plan: mwf,
    orderAt: afterCutoff,
    deliverThroughPublicHolidays: false,
    holidayDates: ['2026-09-18'],
  });
  assert('holiday skip → Mon 21', skipHoliday?.getDate() === 21);
  const keepHoliday = computeNextDeliveryDate({
    plan: mwf,
    orderAt: afterCutoff,
    deliverThroughPublicHolidays: true,
    holidayDates: ['2026-09-18'],
  });
  assert('holiday override ON → Fri 18', keepHoliday?.getDate() === 18);

  // 4. DB: find two vendors with service areas; ensure schedule fields exist
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true, serviceAreas: { some: { isActive: true } } },
    take: 3,
    select: {
      id: true,
      businessName: true,
      selfPickupOffered: true,
      deliverThroughPublicHolidays: true,
      serviceAreas: {
        where: { isActive: true },
        take: 5,
        select: {
          id: true,
          pincode: true,
          cityLabel: true,
          deliversMon: true,
          deliversWed: true,
          deliversFri: true,
          cutoffTime: true,
          thirdPartyDeliveryAvailable: true,
        },
      },
    },
  });
  assert('at least 2 vendors with service areas', vendors.length >= 2, `found ${vendors.length}`);

  // 5. Simulate multi-vendor mode availability independence
  const modeSnapshots: Array<{ vendor: string; pincode: string; modes: string[] }> = [];
  for (const v of vendors) {
    for (const a of v.serviceAreas.slice(0, 2)) {
      const modes: string[] = [];
      const hasDays = a.deliversMon || a.deliversWed || a.deliversFri;
      if (hasDays) modes.push('supplier_delivery');
      if (a.thirdPartyDeliveryAvailable) modes.push('third_party');
      if (v.selfPickupOffered) modes.push('self_pickup');
      modeSnapshots.push({ vendor: v.businessName, pincode: a.pincode, modes });
    }
  }
  assert('multi-vendor mode snapshots collected', modeSnapshots.length >= 2, JSON.stringify(modeSnapshots.slice(0, 4)));

  // 6. Ensure Order model accepts deliveryMode enum values (schema-level)
  const sample = await prisma.order.findFirst({
    select: { id: true, deliveryMode: true, deliveryDate: true, deliverySlotId: true },
  });
  assert('orders table readable with deliveryMode column', sample !== undefined || sample === null, 'column query ok');

  // 7. Platform defaults exist
  const settings = await prisma.platformSetting.findFirst({
    select: {
      defaultDeliversMon: true,
      defaultDeliversWed: true,
      defaultDeliversFri: true,
      defaultCutoffTime: true,
    },
  });
  assert(
    'platform defaults Mon/Wed/Fri @ 16:00',
    !!settings &&
      settings.defaultDeliversMon &&
      settings.defaultDeliversWed &&
      settings.defaultDeliversFri &&
      settings.defaultCutoffTime === '16:00',
  );

  // 8. Holiday table CRUD sanity
  const holidayDate = new Date('2026-10-02T00:00:00.000Z');
  await prisma.platformHoliday.deleteMany({ where: { holidayDate, scope: 'all_india' } });
  const created = await prisma.platformHoliday.create({
    data: { holidayDate, label: 'Deep QA holiday', scope: 'all_india' },
  });
  const found = await prisma.platformHoliday.findUnique({ where: { id: created.id } });
  await prisma.platformHoliday.delete({ where: { id: created.id } });
  const gone = await prisma.platformHoliday.findUnique({ where: { id: created.id } });
  assert('holiday create+delete removes row', !!found && gone === null);

  // 9. Service area fields backfilled with defaults on existing rows
  const blankCutoff = await prisma.serviceArea.count({ where: { cutoffTime: '' } });
  assert('no empty cutoffTime on service areas', blankCutoff === 0, `empty=${blankCutoff}`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== ${checks.length - failed.length}/${checks.length} passed ===\n`);
  if (failed.length) {
    console.error('FAILED:', failed.map((f) => f.name).join(', '));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
