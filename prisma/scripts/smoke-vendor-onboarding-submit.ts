/**
 * Smoke-test vendor onboarding submit against the local DB.
 * Creates a used OTP, POSTs the submit handler, asserts primary-outlet
 * service areas, then cleans up.
 *
 * Run: npx tsx prisma/scripts/smoke-vendor-onboarding-submit.ts
 */
import 'dotenv/config';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { friendlyErrorMessage } from '../../src/middleware/errorHandler';
import { POST } from '../../src/app/api/v1/vendor/onboarding/submit/route';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const TS = Date.now().toString().slice(-8);
const PHONE = `9${TS.padStart(9, '0').slice(0, 9)}`;
const EMAIL = `smoke.vendor.${TS}@example.com`;
const PIN = '560001';

async function cleanup(vendorId: string | null, userId: string | null) {
  if (vendorId) {
    await prisma.serviceArea.deleteMany({ where: { vendorId } });
    await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => undefined);
  }
  if (userId) {
    const member = await prisma.businessAccountMember.findFirst({
      where: { userId },
      select: { businessAccountId: true },
    });
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.businessAccountMember.deleteMany({ where: { userId } });
    if (member?.businessAccountId) {
      const accountId = member.businessAccountId;
      await prisma.businessAccount.update({
        where: { id: accountId },
        data: { primaryOutletId: null },
      }).catch(() => undefined);
      await prisma.outlet.deleteMany({ where: { businessAccountId: accountId } });
      await prisma.businessAccount.delete({ where: { id: accountId } }).catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  await prisma.otpCode.deleteMany({
    where: { OR: [{ phone: PHONE }, { email: EMAIL }] },
  });
}

async function main() {
  console.log('\n=== Vendor Onboarding Submit Smoke Test ===\n');

  // A. P2003 messaging
  const saveMsg = friendlyErrorMessage({
    code: 'P2003',
    meta: { field_name: 'role_id' },
    message: 'Foreign key constraint failed on the field: `role_id`',
  });
  check(
    'P2003 create/save uses save-oriented message',
    saveMsg.includes('Could not save') && saveMsg.includes('role_id') && !saveMsg.includes('Cannot delete'),
    saveMsg,
  );

  const deleteMsg = friendlyErrorMessage({
    code: 'P2003',
    meta: { field_name: 'vendor_id' },
    message: 'Foreign key constraint failed on delete: Restrict',
  });
  check(
    'P2003 delete keeps delete-oriented message',
    deleteMsg.includes('Cannot delete') && deleteMsg.includes('vendor_id'),
    deleteMsg,
  );

  // B. Role template
  const vendorAdminTemplate = await prisma.accountRole.findFirst({
    where: { businessAccountId: null, isTemplate: true, name: 'Vendor Admin', scope: 'vendor' },
    select: { id: true },
  });
  check('Vendor Admin role template exists', !!vendorAdminTemplate, vendorAdminTemplate?.id);
  if (!vendorAdminTemplate) {
    console.log('\nCannot continue without Vendor Admin template. Run seed / resync-role-templates.\n');
    process.exit(1);
  }

  let vendorId: string | null = null;
  let userId: string | null = null;

  try {
    await prisma.otpCode.create({
      data: {
        phone: PHONE,
        email: EMAIL,
        code: '123456',
        used: true,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    check('Created used OTP for smoke phone/email', true, PHONE);

    const body = {
      phone: PHONE,
      verifiedEmail: EMAIL,
      email: EMAIL,
      password: 'SmokeTest1!',
      fullName: 'Smoke Vendor Owner',
      businessName: `Smoke Vendor Biz ${TS}`,
      tradeName: `Smoke Trade ${TS}`,
      authorizedPersonName: 'Smoke Auth Person',
      authorizedPersonPhone: PHONE,
      authorizedPersonEmail: EMAIL,
      vendorTypeSelections: [{ type: 'Distributor', slug: 'distributor', subTypes: ['HoReCa Distributor'] }],
      bankAccountName: 'Smoke Vendor',
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
      bankName: 'HDFC Bank',
      bankAccountType: 'current',
      billingAddress: {
        addressLine: '12 MG Road Smoke Test',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: PIN,
      },
      pickupAddress: {
        addressLine: '12 MG Road Warehouse',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: PIN,
      },
      serviceablePincodes: [PIN, '560002'],
      deliveryCapability: 'own_fleet',
    };

    const req = new NextRequest('http://localhost:3000/api/v1/vendor/onboarding/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { vendorId?: string; hcidDisplay?: string };
      error?: { message?: string; code?: string };
    };

    check('Submit returns 201', res.status === 201, `status=${res.status}`);
    if (res.status !== 201) {
      console.log('  Response:', JSON.stringify(json, null, 2));
    }

    vendorId = json.data?.vendorId ?? null;
    check('Response includes vendorId', !!vendorId, vendorId ?? json.error?.message);

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          id: true,
          userId: true,
          businessAccountId: true,
          businessAccount: { select: { primaryOutletId: true } },
        },
      });
      userId = vendor?.userId ?? null;
      const primaryOutletId = vendor?.businessAccount.primaryOutletId ?? null;
      check('Primary outlet set on business account', !!primaryOutletId, primaryOutletId ?? undefined);

      const areas = await prisma.serviceArea.findMany({
        where: { vendorId },
        select: { pincode: true, outletId: true },
      });
      check('Service areas created', areas.length === 2, `${areas.length} row(s)`);
      check(
        'All service areas bound to primary outlet',
        areas.length > 0 && areas.every((a) => a.outletId === primaryOutletId),
        areas.map((a) => `${a.pincode}:${a.outletId}`).join(', '),
      );
      check(
        'No legacy null-outlet service areas',
        areas.every((a) => a.outletId != null),
      );
    }
  } finally {
    await cleanup(vendorId, userId);
    check('Cleanup completed', true);
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
