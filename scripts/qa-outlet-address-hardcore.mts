/**
 * Hardcore demo QA: admin new-customer Save address + edit hydrate.
 * Run: npx tsx scripts/qa-outlet-address-hardcore.mts
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
  const phone = `9${String(Date.now()).slice(-9)}`;
  const tag = `QA-${phone.slice(-4)}`;
  let failed = 0;

  const assert = (ok: boolean, label: string, detail?: string) => {
    if (ok) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
    else {
      failed += 1;
      console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
  };

  // 1) CSRF + credentials sign-in (same jar pattern as qa-pricelists-hardcore)
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

  // 2) Create slim customer (step 1)
  const create = await api('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `${tag} Contact`,
      phone,
      businessName: `BIKANER ${tag}`,
      role: 'customer',
      companyProfile: {
        legalName: `BIKANER ${tag}`,
        firstName: tag,
        mobilePhone: phone,
        pincode: '400703',
      },
    }),
  });
  const userId = create.json.data?.id as string | undefined;
  assert(!!create.json.success && !!userId, 'create customer', JSON.stringify(create.json.error || create.json.data?.id));

  if (!userId) {
    console.error('Abort — no user id');
    process.exit(1);
  }

  // 3) Save address (step 2) — the payload that used to throw "No valid fields to update"
  const saveAddr = await api(`/api/v1/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      companyProfile: {
        billingAddressLine: 'VASHI NAKA',
        billingCity: 'Thane',
        billingState: 'Maharashtra',
        billingPincode: '400703',
      },
      outlets: [
        {
          name: `VASHI KITCHEN ${tag}`,
          billingName: null,
          addressLine: 'VASHI NAKA',
          city: 'Thane',
          state: 'Maharashtra',
          pincode: '400703',
        },
      ],
      deliveryAddress: {
        outletName: `VASHI KITCHEN ${tag}`,
        addressLine: 'VASHI NAKA',
        city: 'Thane',
        state: 'Maharashtra',
        pincode: '400703',
      },
    }),
  });
  assert(
    !!saveAddr.json.success,
    'Save address PATCH',
    typeof saveAddr.json.error === 'string'
      ? saveAddr.json.error
      : saveAddr.json.error?.message || 'ok',
  );

  // 4) Read back outlets — street must still be there (not placeholder / not gone)
  const get = await api(`/api/v1/admin/users/${userId}`);
  const accounts = (get.json.data as { accountMemberships?: Array<{
    businessAccount?: {
      legalName?: string;
      outlets?: Array<{
        id: string;
        name: string;
        addressLine: string;
        city: string | null;
        pincode: string | null;
        billingName: string | null;
        isActive: boolean;
      }>;
    };
  }> })?.accountMemberships;
  const outlets = accounts?.[0]?.businessAccount?.outlets?.filter((o) => o.isActive !== false) ?? [];
  assert(outlets.length === 1, 'exactly one active outlet (no duplicate)', `count=${outlets.length}`);
  const primary = outlets[0];
  assert(!!primary, 'primary outlet exists');
  if (primary) {
    assert(
      primary.addressLine === 'VASHI NAKA',
      'outlet.addressLine persisted',
      primary.addressLine,
    );
    assert(
      primary.name.includes('VASHI KITCHEN'),
      'outlet.name is kitchen not Business',
      primary.name,
    );
    assert(primary.pincode === '400703', 'outlet.pincode', primary.pincode || '');
  }

  // 5) Second PATCH edit — address must not wipe
  if (primary) {
    const edit = await api(`/api/v1/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        companyProfile: {
          billingAddressLine: 'VASHI NAKA',
          billingCity: 'Thane',
          billingState: 'Maharashtra',
          billingPincode: '400703',
        },
        outlets: [
          {
            id: primary.id,
            name: `VASHI KITCHEN ${tag}`,
            billingName: null,
            addressLine: 'VASHI NAKA',
            city: 'Thane',
            state: 'Maharashtra',
            pincode: '400703',
          },
        ],
      }),
    });
    assert(!!edit.json.success, 'edit Save outlet PATCH');

    const get2 = await api(`/api/v1/admin/users/${userId}`);
    const outlets2 = (get2.json.data as {
      accountMemberships?: typeof accounts;
    })?.accountMemberships?.[0]?.businessAccount?.outlets?.filter((o) => o.isActive !== false) ?? [];
    assert(
      outlets2[0]?.addressLine === 'VASHI NAKA',
      'address still present after edit',
      outlets2[0]?.addressLine || 'missing',
    );
  }

  // 6) Add a SECOND outlet with a different name+street — primary must stay unchanged
  const addSecond = await api(`/api/v1/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      companyProfile: {
        billingAddressLine: 'THANE NAKA',
        billingCity: 'Thane',
        billingState: 'Maharashtra',
        billingPincode: '400708',
      },
      outlets: [
        {
          name: `THANE KITCHEN ${tag}`,
          billingName: null,
          addressLine: 'THANE NAKA',
          city: 'Thane',
          state: 'Maharashtra',
          pincode: '400708',
        },
      ],
    }),
  });
  assert(!!addSecond.json.success, 'add second outlet PATCH');

  const get3 = await api(`/api/v1/admin/users/${userId}`);
  const outlets3 = ((get3.json.data as {
    accountMemberships?: typeof accounts;
  })?.accountMemberships?.[0]?.businessAccount?.outlets ?? []).filter((o) => o.isActive !== false);

  assert(outlets3.length === 2, 'two distinct active outlets', `count=${outlets3.length}`);
  const names = outlets3.map((o) => o.name).sort();
  const lines = outlets3.map((o) => o.addressLine).sort();
  assert(
    names.some((n) => n.includes('VASHI KITCHEN')) && names.some((n) => n.includes('THANE KITCHEN')),
    'outlet names stay different',
    names.join(' | '),
  );
  assert(
    lines.includes('VASHI NAKA') && lines.includes('THANE NAKA'),
    'outlet streets stay different',
    lines.join(' | '),
  );

  console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} — user ${userId} phone ${phone}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
