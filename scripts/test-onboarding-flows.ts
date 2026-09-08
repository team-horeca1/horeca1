/**
 * E2E smoke test for the three onboarding paths:
 * 1. Public brand register  → POST /api/v1/brand/onboarding/submit
 * 2. Public vendor register → POST /api/v1/vendor/onboarding/submit
 * 3. Admin brand create     → POST /api/v1/admin/brands
 *
 * Run: npm run dev (separate terminal), then:
 *   npx tsx scripts/test-onboarding-flows.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

function suffix(): string {
  return Date.now().toString().slice(-7);
}

/** Indian mobile: 10 digits starting 6–9 */
function testPhone(prefix: '6' | '7' | '8' | '9'): string {
  const tail = suffix().padStart(9, '0').slice(-9);
  return `${prefix}${tail}`;
}

async function jsonFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

async function verifyPhone(phone: string): Promise<string> {
  const send = await jsonFetch('/api/v1/auth/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, mode: 'register' }),
  });
  if (!send.json.success) throw new Error(`OTP send failed: ${JSON.stringify(send.json)}`);

  const otpRow = await prisma.otpCode.findFirst({
    where: { phone },
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });
  if (!otpRow?.code) throw new Error(`No OTP in DB for ${phone}`);

  const verify = await jsonFetch('/api/v1/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: otpRow.code }),
  });
  if (!verify.json.success) throw new Error(`OTP verify failed: ${JSON.stringify(verify.json)}`);
  const token = verify.json.verificationToken as string | undefined;
  if (!token) throw new Error('OTP verify did not return verificationToken');
  return token;
}

async function adminSessionCookie(): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json() as { csrfToken: string };
  const csrfCookie = csrfRes.headers.get('set-cookie') ?? '';

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials?`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrfCookie,
    },
    body: new URLSearchParams({
      csrfToken,
      email: 'admin@horeca1.com',
      password: 'admin123',
      callbackUrl: `${BASE}/admin`,
      json: 'true',
    }),
    redirect: 'manual',
  });

  const cookies = [csrfCookie, loginRes.headers.get('set-cookie') ?? '']
    .join('; ')
    .split(/,\s*(?=[^;]+?=)/)
    .map(c => c.split(';')[0])
    .filter(Boolean)
    .join('; ');

  if (!cookies.includes('authjs.session-token') && !cookies.includes('__Secure-authjs.session-token')) {
    throw new Error(`Admin login failed — no session cookie. Status ${loginRes.status}`);
  }
  return cookies;
}

async function testBrandPublicRegister(): Promise<void> {
  const s = suffix();
  const phone = testPhone('9');
  const email = `brand-test-${s}@example.com`;

  const verificationToken = await verifyPhone(phone);

  const payload = {
    phone,
    email,
    password: 'test1234',
    legalName: `Test Brand Legal ${s}`,
    displayName: `TestBrand ${s}`,
    brandType: 'FMCG',
    subType: 'Snacks',
    productCategories: ['Snacks'],
    firstName: 'Raj',
    lastName: 'Kumar',
    businessSize: 'Medium',
    distributionPresence: 'Regional',
    targetSegments: ['QSR + Retail'],
    horecaFocused: true,
    retailFocused: false,
    gstin: '',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    billingAddressLine: '123 Test Street, Bandra',
    website: 'https://example.com',
    tagline: 'Test tagline',
    description: 'Test brand description',
    verificationToken,
  };

  const { status, json } = await jsonFetch('/api/v1/brand/onboarding/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!json.success) throw new Error(`Brand public register failed (${status}): ${JSON.stringify(json)}`);
  console.log('✓ Brand public register OK — HCID:', json.data?.hcidDisplay);

  // Cleanup test user
  const user = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
  if (user) {
    await prisma.brand.deleteMany({ where: { userId: user.id } });
    await prisma.businessAccountMember.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

async function testVendorPublicRegister(): Promise<void> {
  const s = suffix();
  const phone = testPhone('8');
  const email = `vendor-test-${s}@example.com`;

  const verificationToken = await verifyPhone(phone);

  const addr = {
    addressLine: '456 Warehouse Road, Andheri',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400053',
  };

  const payload = {
    phone,
    vendorBusinessType: 'Distributor',
    subType: 'FMCG Distributor',
    categoriesHandled: ['Snacks'],
    businessSize: 'Medium',
    coverage: 'Metro Cities',
    warehouseCount: 2,
    deliveryFleet: true,
    monthlySupplyBand: '10-50 Lakh',
    fullName: 'Amit Sharma',
    businessName: `Test Vendor Legal ${s}`,
    tradeName: `TestVendor ${s}`,
    email,
    password: 'test1234',
    salutation: 'Mr.',
    firstName: 'Amit',
    lastName: 'Sharma',
    designation: 'Owner',
    authorizedPersonName: 'Amit Sharma',
    authorizedPersonPhone: phone,
    authorizedPersonEmail: email,
    gstNumber: '',
    panNumber: '',
    bankAccountName: 'Amit Sharma',
    bankAccountNumber: '123456789012',
    bankIfsc: 'HDFC0001234',
    bankName: 'HDFC Bank',
    bankAccountType: 'current',
    billingAddress: addr,
    pickupAddress: addr,
    serviceablePincodes: ['400053', '400001'],
    deliveryCapability: 'own_fleet',
    fssaiNumber: '',
    udyamNumber: '',
    cinNumber: '',
    verificationToken,
  };

  const { status, json } = await jsonFetch('/api/v1/vendor/onboarding/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!json.success) throw new Error(`Vendor public register failed (${status}): ${JSON.stringify(json)}`);
  console.log('✓ Vendor public register OK — HCID:', json.data?.hcidDisplay);

  const user = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
  if (user) {
    await prisma.vendor.deleteMany({ where: { userId: user.id } });
    await prisma.businessAccountMember.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

async function testAdminBrandCreate(): Promise<void> {
  const s = suffix();
  const email = `admin-brand-${s}@example.com`;
  const cookie = await adminSessionCookie();

  const payload = {
    email,
    password: 'test1234',
    fullName: 'Priya Mehta',
    legalName: `Admin Brand Legal ${s}`,
    displayName: `AdminBrand ${s}`,
    brandType: 'D2C',
    subType: 'Food Brand',
    productCategories: ['National Brand'],
    firstName: 'Priya',
    lastName: 'Mehta',
    phone: testPhone('7'),
    businessSize: 'Small',
    distributionPresence: 'Local',
    targetSegments: ['Premium Restaurants'],
    horecaFocused: true,
    retailFocused: false,
    brandTier: 'Premium',
    marketplaceVisibility: 'Public',
    leadStatus: 'Active',
    creditSupport: true,
    remarks: 'Created via onboarding smoke test',
  };

  const { status, json } = await jsonFetch('/api/v1/admin/brands', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(payload),
  });

  if (!json.success) throw new Error(`Admin brand create failed (${status}): ${JSON.stringify(json)}`);
  console.log('✓ Admin brand create OK — slug:', json.data?.slug);

  if (json.data?.id) {
    const brand = await prisma.brand.findUnique({
      where: { id: json.data.id },
      select: { userId: true, businessAccountId: true },
    });
    if (brand) {
      await prisma.brand.delete({ where: { id: json.data.id } }).catch(() => {});
      await prisma.businessAccountMember.deleteMany({ where: { businessAccountId: brand.businessAccountId } });
      await prisma.userRole.deleteMany({ where: { businessAccountId: brand.businessAccountId } });
      await prisma.businessAccount.delete({ where: { id: brand.businessAccountId } }).catch(() => {});
      await prisma.user.delete({ where: { id: brand.userId } }).catch(() => {});
    }
  }
}

async function main() {
  console.log(`Testing onboarding flows against ${BASE}\n`);

  const health = await fetch(`${BASE}/api/v1/health`).catch(() => null);
  if (!health?.ok) {
    const home = await fetch(BASE).catch(() => null);
    if (!home?.ok) throw new Error(`Server not reachable at ${BASE} — run npm run dev first`);
  }

  const results: Array<{ name: string; ok: boolean; error?: string }> = [];

  for (const [name, fn] of [
    ['Brand public register', testBrandPublicRegister],
    ['Vendor public register', testVendorPublicRegister],
    ['Admin brand create', testAdminBrandCreate],
  ] as const) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`✗ ${name}: ${msg}`);
      results.push({ name, ok: false, error: msg });
    }
  }

  console.log('\n--- Summary ---');
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
  }

  await prisma.$disconnect();
  if (results.some(r => !r.ok)) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
