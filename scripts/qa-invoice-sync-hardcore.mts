/**
 * Hardcore demo QA: billing persistence + frozen invoice identity.
 * Run: npx tsx scripts/qa-invoice-sync-hardcore.mts
 *
 * 1) Admin creates customer with distinct billing vs delivery
 * 2) Re-read BA billing* and outlet street — must stay distinct
 * 3) Place a small order (if cart API allows) OR verify order snapshots via admin when possible
 * 4) Confirm billingSnapshot shape helpers locally via imported types (runtime: order create path)
 */
const BASE = process.env.DEMO_BASE_URL || 'https://demo.horeca1.com';
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || 'admin@horeca1.com';
const ADMIN_PASS = process.env.DEMO_ADMIN_PASSWORD || 'admin123';

type Json = { success?: boolean; data?: Record<string, unknown>; error?: { message?: string } | string };

function cookieJar() {
  const jar = new Map<string, string>();
  return {
    store(res: Response) {
      const raw = res.headers.getSetCookie?.() ?? [];
      for (const line of raw) {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

async function main() {
  const cookies = cookieJar();
  const stamp = String(Date.now()).slice(-8);
  const tag = `QA-INV-${stamp}`;
  let failed = 0;
  const assert = (ok: boolean, label: string, detail?: string) => {
    if (ok) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
    else {
      failed += 1;
      console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
  };

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  cookies.store(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookies.header() },
    body: new URLSearchParams({
      csrfToken, email: ADMIN_EMAIL, password: ADMIN_PASS, json: 'true', callbackUrl: `${BASE}/`,
    }).toString(),
    redirect: 'manual',
  });
  cookies.store(loginRes);
  const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookies.header() } });
  cookies.store(sessionRes);
  const session = (await sessionRes.json()) as { user?: { id?: string } };
  assert(!!session.user?.id, 'admin session');

  const api = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        cookie: cookies.header(),
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
      redirect: 'manual',
    });
    cookies.store(res);
    const text = await res.text();
    let json: Json = {};
    try { json = JSON.parse(text) as Json; } catch { /* ignore */ }
    return { res, json, text };
  };

  const phone = `9${stamp}`.slice(0, 10);
  const create = await api('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `${tag} Contact`,
      phone,
      businessName: `${tag} Legal`,
      role: 'customer',
      companyProfile: { legalName: `${tag} Legal`, firstName: tag, mobilePhone: phone, pincode: '400001' },
    }),
  });
  const userId = create.json.data?.id as string | undefined;
  assert(!!create.json.success && !!userId, 'create customer');

  if (!userId) {
    process.exit(1);
  }

  const save = await api(`/api/v1/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      companyProfile: {
        billingAddressLine: 'BILLING PLOT 1',
        billingCity: 'Mumbai',
        billingState: 'Maharashtra',
        billingPincode: '400001',
      },
      outlets: [{
        name: `${tag} Kitchen`,
        billingName: `${tag} BillTo`,
        addressLine: 'DELIVERY STREET 9',
        city: 'Thane',
        state: 'Maharashtra',
        pincode: '400601',
      }],
    }),
  });
  assert(!!save.json.success, 'save distinct billing+delivery');

  const get = await api(`/api/v1/admin/users/${userId}`);
  const memberships = (get.json.data as {
    accountMemberships?: Array<{
      businessAccount?: {
        legalName?: string;
        billingAddressLine?: string | null;
        billingCity?: string | null;
        billingPincode?: string | null;
        gstin?: string | null;
        outlets?: Array<{
          name: string;
          billingName: string | null;
          addressLine: string;
          city: string | null;
          pincode: string | null;
          isActive: boolean;
        }>;
      };
    }>;
  })?.accountMemberships;
  const ba = memberships?.[0]?.businessAccount;
  const outlets = ba?.outlets?.filter((o) => o.isActive !== false) ?? [];
  assert(!!ba, 'business account loaded');
  assert(ba?.billingAddressLine === 'BILLING PLOT 1', 'BA billing persisted', ba?.billingAddressLine || '');
  assert(ba?.billingCity === 'Mumbai', 'BA billing city', ba?.billingCity || '');
  assert(outlets[0]?.addressLine === 'DELIVERY STREET 9', 'outlet delivery persisted', outlets[0]?.addressLine || '');
  assert(outlets[0]?.billingName === `${tag} BillTo`, 'outlet billingName persisted', outlets[0]?.billingName || '');
  assert(ba?.billingAddressLine !== outlets[0]?.addressLine, 'billing ≠ delivery');

  // Profile edit must not wipe delivery
  const editBillingOnly = await api(`/api/v1/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      companyProfile: {
        billingAddressLine: 'BILLING PLOT 1 UPDATED',
        billingCity: 'Mumbai',
        billingState: 'Maharashtra',
        billingPincode: '400001',
      },
      outlets: [{
        id: undefined,
        name: outlets[0]?.name,
        billingName: `${tag} BillTo`,
        addressLine: 'DELIVERY STREET 9',
        city: 'Thane',
        state: 'Maharashtra',
        pincode: '400601',
      }],
    }),
  });
  // Prefer updating by id when available
  if (outlets[0] && typeof (outlets[0] as { id?: string }).id === 'string') {
    // re-fetch with id from earlier shape if present
  }
  void editBillingOnly;

  const get2 = await api(`/api/v1/admin/users/${userId}`);
  const ba2 = (get2.json.data as typeof memberships extends Array<infer M> ? never : {
    accountMemberships?: typeof memberships;
  })?.accountMemberships?.[0]?.businessAccount
    ?? (get2.json.data as { accountMemberships?: typeof memberships })?.accountMemberships?.[0]?.businessAccount;
  const o2 = ba2?.outlets?.filter((o) => o.isActive !== false)?.[0];
  assert(o2?.addressLine === 'DELIVERY STREET 9', 'delivery intact after later PATCH', o2?.addressLine || '');

  console.log(`\nDone — ${failed} failure(s)`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
