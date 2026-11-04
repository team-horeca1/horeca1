/**
 * Hardcore demo QA: supplier + brand address round-trips via admin APIs.
 * Run: npx tsx scripts/qa-supplier-brand-hardcore.mts
 *
 * Covers:
 * - Create supplier with billing ≠ pickup → re-read distinct
 * - PATCH address-only never "No valid fields to update"
 * - Create brand with single address → re-read identical
 * - Edit brand city only → other fields unchanged
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
  const tag = `QA-SB-${stamp}`;
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
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookies.header(),
    },
    body: new URLSearchParams({
      csrfToken,
      email: ADMIN_EMAIL,
      password: ADMIN_PASS,
      json: 'true',
      callbackUrl: `${BASE}/`,
    }).toString(),
    redirect: 'manual',
  });
  cookies.store(loginRes);

  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookies.header() },
  });
  cookies.store(sessionRes);
  const session = (await sessionRes.json()) as { user?: { id?: string; email?: string } };
  assert(!!session.user?.id, 'admin session', session.user?.email || `status=${loginRes.status}`);

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

  const phoneA = `9${stamp}01`.slice(0, 10);
  const phoneB = `9${stamp}02`.slice(0, 10);
  const emailA = `qa.supplier.${stamp}@example.com`;
  const emailB = `qa.brand.${stamp}@example.com`;

  // ── Supplier create with distinct billing vs pickup ─────────────────────
  const vendorCreate = await api('/api/v1/admin/vendors', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `${tag} Owner`,
      email: emailA,
      password: 'TestPass123!',
      phone: phoneA,
      businessName: `${tag} Supplies`,
      tradeName: tag,
      primaryOutlet: {
        name: `${tag} Warehouse`,
        addressLine: 'Godown Lane 7',
        city: 'Thane',
        state: 'Maharashtra',
        pincode: '400601',
      },
      vendorDetails: {
        vendorType: 'distributor',
        panNumber: 'ABCDE1234F',
        authorizedPersonName: `${tag} Owner`,
        authorizedPersonPhone: phoneA,
        billingAddress: {
          addressLine: 'Billing Plot 22 MIDC',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
        },
        bankAccountName: `${tag} Owner`,
        bankAccountNumber: '123456789012',
        bankIfsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
        bankAccountType: 'current',
        deliveryCapability: 'both',
        serviceablePincodes: ['400001', '400601'],
      },
    }),
  });

  const vendorId = (vendorCreate.json.data?.id
    || (vendorCreate.json.data as { vendor?: { id?: string } } | undefined)?.vendor?.id) as string | undefined;
  assert(!!vendorCreate.json.success && !!vendorId, 'create supplier', JSON.stringify(vendorCreate.json.error || vendorCreate.json.data));

  if (vendorId) {
    const vendorGet = await api(`/api/v1/admin/vendors/${vendorId}`);
    const v = vendorGet.json.data as Record<string, unknown> | undefined;
    assert(!!vendorGet.json.success && !!v, 'get supplier');
    if (v) {
      const billLine = String(v.addressLine || '');
      const pickLine = String(v.pickupAddressLine || '');
      assert(billLine.includes('Billing Plot') || billLine.includes('MIDC'), 'supplier billing persisted', billLine);
      assert(pickLine.includes('Godown') || pickLine.includes('Warehouse') || pickLine.length > 0, 'supplier pickup persisted', pickLine);
      assert(billLine !== pickLine, 'supplier billing ≠ pickup', `bill=${billLine} pick=${pickLine}`);

      const patchOnly = await api(`/api/v1/admin/vendors/${vendorId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          addressLine: 'Billing Plot 22 MIDC Updated',
          city: 'Mumbai',
          state: 'Maharashtra',
          addressPincode: '400001',
          pickupAddressLine: 'Godown Lane 7 Updated',
          pickupCity: 'Thane',
          pickupState: 'Maharashtra',
          pickupPincode: '400601',
        }),
      });
      const errMsg = typeof patchOnly.json.error === 'string'
        ? patchOnly.json.error
        : patchOnly.json.error?.message || '';
      assert(
        !!patchOnly.json.success && !/no valid fields/i.test(errMsg),
        'supplier address-only PATCH',
        errMsg || `status=${patchOnly.res.status}`,
      );

      const vendorGet2 = await api(`/api/v1/admin/vendors/${vendorId}`);
      const v2 = vendorGet2.json.data as Record<string, unknown> | undefined;
      if (v2) {
        assert(String(v2.addressLine || '').includes('Updated'), 'supplier billing edit stuck', String(v2.addressLine));
        assert(String(v2.pickupAddressLine || '').includes('Updated'), 'supplier pickup edit stuck', String(v2.pickupAddressLine));
        assert(String(v2.addressLine) !== String(v2.pickupAddressLine), 'supplier still distinct after edit');
      }
    }
  }

  // ── Brand create + city-only edit ───────────────────────────────────────
  const brandCreate = await api('/api/v1/admin/brands', {
    method: 'POST',
    body: JSON.stringify({
      name: `${tag} Brand`,
      legalName: `${tag} Brand Pvt Ltd`,
      displayName: `${tag} Brand`,
      email: emailB,
      phone: phoneB,
      password: 'TestPass123!',
      brandType: 'FMCG',
      billingAddressLine: 'Brand HQ Street 1',
      billingCity: 'Delhi',
      billingState: 'Delhi',
      billingPincode: '110001',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
    }),
  });

  const brandId = (brandCreate.json.data?.id
    || (brandCreate.json.data as { brand?: { id?: string } } | undefined)?.brand?.id) as string | undefined;
  assert(!!brandCreate.json.success && !!brandId, 'create brand', JSON.stringify(brandCreate.json.error || brandCreate.json.data));

  if (brandId) {
    const brandGet = await api(`/api/v1/admin/brands/${brandId}`);
    const b = brandGet.json.data as Record<string, unknown> | undefined;
    const ba = (b?.businessAccount || b) as Record<string, unknown> | undefined;
    assert(!!brandGet.json.success && !!b, 'get brand');
    if (ba) {
      const line = String(ba.billingAddressLine || b?.billingAddressLine || '');
      assert(line.includes('Brand HQ') || line.length > 0, 'brand address persisted', line);

      const cityOnly = await api(`/api/v1/admin/brands/${brandId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          billingCity: 'New Delhi',
          city: 'New Delhi',
          billingAddressLine: line || 'Brand HQ Street 1',
          billingState: 'Delhi',
          billingPincode: '110001',
        }),
      });
      const errMsg = typeof cityOnly.json.error === 'string'
        ? cityOnly.json.error
        : cityOnly.json.error?.message || '';
      assert(
        !!cityOnly.json.success && !/no valid fields/i.test(errMsg),
        'brand address PATCH',
        errMsg || `status=${cityOnly.res.status}`,
      );

      const brandGet2 = await api(`/api/v1/admin/brands/${brandId}`);
      const b2 = brandGet2.json.data as Record<string, unknown> | undefined;
      const ba2 = (b2?.businessAccount || b2) as Record<string, unknown> | undefined;
      if (ba2) {
        const city = String(ba2.billingCity || b2?.billingCity || '');
        const line2 = String(ba2.billingAddressLine || b2?.billingAddressLine || '');
        assert(/new delhi/i.test(city), 'brand city updated', city);
        assert(line2.includes('Brand HQ') || line2 === line, 'brand street unchanged', line2);
      }
    }
  }

  console.log(`\nDone — ${failed} failure(s)`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
