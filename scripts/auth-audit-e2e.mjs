/**
 * Comprehensive auth E2E audit — admin, vendor, brand, customer.
 * Expects auth-e2e-seed.ts users (e2e-auth-*@horeca.test). Env overrides allowed.
 * Run: node scripts/auth-audit-e2e.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const CREDS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'admin@horeca1.com',
    password: process.env.E2E_ADMIN_PASSWORD || 'admin123',
  },
  vendor: {
    email: process.env.E2E_VENDOR_EMAIL || 'e2e-auth-vendor@horeca.test',
    password: process.env.E2E_VENDOR_PASSWORD || 'e2eVendor123!',
  },
  customer: {
    email: process.env.E2E_CUSTOMER_EMAIL || 'e2e-auth-customer@horeca.test',
    password: process.env.E2E_CUSTOMER_PASSWORD || 'e2eCustomer123!',
  },
  brand: {
    email: process.env.E2E_BRAND_EMAIL || 'e2e-auth-brand@horeca.test',
    password: process.env.E2E_BRAND_PASSWORD || 'e2eBrand123!',
  },
};

const results = [];

function pass(step, detail = {}) {
  results.push({ step, ok: true, ...detail });
  console.log(`✓ ${step}`, detail.status ?? '', JSON.stringify(detail).slice(0, 120));
}

function fail(step, detail = {}) {
  results.push({ step, ok: false, ...detail });
  console.error(`✗ ${step}`, JSON.stringify(detail));
}

function mergeCookies(jar, setCookie) {
  if (!setCookie) return jar;
  const parts = setCookie.split(/,(?=\s*[^;,]+=)/);
  for (const p of parts) {
    const [kv] = p.split(';');
    const eq = kv.indexOf('=');
    if (eq < 1) continue;
    const name = kv.slice(0, eq).trim();
    const val = kv.slice(eq + 1).trim();
    if (!val) jar.delete(name);
    else jar.set(name, val);
  }
  return jar;
}

function jarHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function loginAs({ email, password }, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const jar = new Map();
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    if (csrfRes.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    mergeCookies(jar, csrfRes.headers.get('set-cookie'));
    const { csrfToken } = await csrfRes.json();

    const loginRes = await fetch(`${BASE}/api/auth/callback/credentials?`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: jarHeader(jar),
      },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE, json: 'true' }),
      redirect: 'manual',
    });
    mergeCookies(jar, loginRes.headers.get('set-cookie'));

    const hasSession = [...jar.keys()].some((k) => k.includes('authjs.session-token'));
    if (hasSession) {
      const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: jarHeader(jar) } });
      const session = await sessionRes.json();
      return { jar, session, loginStatus: loginRes.status };
    }
    if (loginRes.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`Login failed for ${email}: HTTP ${loginRes.status}`);
  }
  throw new Error(`Login failed for ${email}: exhausted retries`);
}

async function api(jar, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Cookie: jarHeader(jar), ...(init.headers || {}) },
    redirect: 'manual',
  });
  mergeCookies(jar, res.headers.get('set-cookie'));
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

/** Mirror useSession().update() — POST /api/auth/session with csrf + data. */
async function updateSession(jar, data) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { Cookie: jarHeader(jar) } });
  mergeCookies(jar, csrfRes.headers.get('set-cookie'));
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: jarHeader(jar),
    },
    body: JSON.stringify({ csrfToken, data }),
  });
  mergeCookies(jar, res.headers.get('set-cookie'));
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function logout(jar) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { Cookie: jarHeader(jar) } });
  mergeCookies(jar, csrfRes.headers.get('set-cookie'));
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${BASE}/api/auth/signout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jarHeader(jar) },
    body: new URLSearchParams({ csrfToken, callbackUrl: BASE }),
    redirect: 'manual',
  });
  mergeCookies(jar, res.headers.get('set-cookie'));
  return res.status;
}

async function testRoleLogin(role) {
  const cred = CREDS[role];
  try {
    const { jar, session, loginStatus } = await loginAs(cred);
    const user = session?.user ?? {};
    if (loginStatus !== 200 && loginStatus !== 302) {
      fail(`${role.toUpperCase()}_LOGIN`, { loginStatus });
      return null;
    }
    if (!user.email) {
      fail(`${role.toUpperCase()}_LOGIN`, { reason: 'no session user' });
      return null;
    }
    pass(`${role.toUpperCase()}_LOGIN`, { status: loginStatus, role: user.role, email: user.email });
    return { jar, session };
  } catch (e) {
    fail(`${role.toUpperCase()}_LOGIN`, { error: String(e), email: cred.email });
    return null;
  }
}

async function testProtectedRoutes(role, jar) {
  const checks = [
    { path: '/admin/dashboard', expect: role === 'admin' ? [200, 307, 308] : [307, 308, 403] },
    { path: '/api/v1/admin/dashboard', expect: role === 'admin' ? [200] : [401, 403] },
    { path: '/vendor/dashboard', expect: ['admin', 'vendor'].includes(role) ? [200, 307, 308] : [307, 308] },
    { path: '/api/v1/vendor/orders', expect: ['admin', 'vendor'].includes(role) ? [200, 403] : [401, 403] },
    { path: '/brand/portal', expect: ['admin', 'brand'].includes(role) ? [200, 307, 308] : [307, 308] },
    { path: '/api/v1/brand/profile', expect: ['admin', 'brand'].includes(role) ? [200, 403] : [401, 403] },
    { path: '/profile', expect: [200, 307, 308] },
    { path: '/api/v1/auth/me', expect: [200] },
    { path: '/api/v1/account', expect: [200] },
  ];

  for (const c of checks) {
    const res = await fetch(`${BASE}${c.path}`, { headers: { Cookie: jarHeader(jar) }, redirect: 'manual' });
    const ok = c.expect.includes(res.status);
    const step = `${role.toUpperCase()}_${c.path}`;
    if (ok) pass(step, { status: res.status });
    else fail(step, { status: res.status, expected: c.expect });
  }
}

async function testImpersonationMutex(adminJar) {
  const vendors = await api(adminJar, '/api/v1/admin/vendors?limit=1');
  const customers = await api(adminJar, '/api/v1/admin/users?role=customer&limit=1');
  const brands = await api(adminJar, '/api/v1/admin/brands?limit=1');
  const vendorId = vendors.json?.data?.vendors?.[0]?.id ?? vendors.json?.data?.[0]?.id;
  const customerId = customers.json?.data?.users?.[0]?.id;
  const brandId = brands.json?.data?.brands?.[0]?.id ?? brands.json?.data?.[0]?.id;

  // Prefer vendor→customer mutex; fall back to vendor→brand when DB has no customers.
  if (vendorId && customerId) {
    const vImp = await api(adminJar, '/api/v1/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId }),
    });
    mergeCookies(adminJar, vImp.headers.get('set-cookie'));

    const cImp = await api(adminJar, '/api/v1/admin/impersonate/customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: customerId }),
    });
    mergeCookies(adminJar, cImp.headers.get('set-cookie'));

    const cookie = jarHeader(adminJar);
    const hasVendor = /admin_impersonate_vendor_id=/.test(cookie);
    const hasCustomer = /admin_impersonate_customer_user_id=/.test(cookie);
    if (!hasVendor && hasCustomer) pass('IMPERSONATE_MUTEX', { vendor: hasVendor, customer: hasCustomer });
    else fail('IMPERSONATE_MUTEX', { vendor: hasVendor, customer: hasCustomer });

    await api(adminJar, '/api/v1/admin/impersonate', { method: 'DELETE' });
    await api(adminJar, '/api/v1/admin/impersonate/customer', { method: 'DELETE' });
    return;
  }

  if (vendorId && brandId) {
    const vImp = await api(adminJar, '/api/v1/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId }),
    });
    mergeCookies(adminJar, vImp.headers.get('set-cookie'));

    const bImp = await api(adminJar, '/api/v1/admin/impersonate/brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId }),
    });
    mergeCookies(adminJar, bImp.headers.get('set-cookie'));

    const cookie = jarHeader(adminJar);
    const hasVendor = /admin_impersonate_vendor_id=/.test(cookie);
    const hasBrand = /admin_impersonate_brand_id=/.test(cookie);
    if (!hasVendor && hasBrand) pass('IMPERSONATE_MUTEX', { vendor: hasVendor, brand: hasBrand });
    else fail('IMPERSONATE_MUTEX', { vendor: hasVendor, brand: hasBrand });

    await api(adminJar, '/api/v1/admin/impersonate', { method: 'DELETE' });
    await api(adminJar, '/api/v1/admin/impersonate/brand', { method: 'DELETE' });
    return;
  }

  pass('IMPERSONATE_MUTEX_SKIPPED', { reason: 'no vendor+customer/brand pair in DB', vendorId, customerId, brandId });
}

async function testLogout(jar, role) {
  const before = await api(jar, '/api/auth/session');
  const status = await logout(jar);
  const after = await fetch(`${BASE}/api/auth/session`);
  const afterJson = await after.json();
  const loggedOut = !afterJson?.user?.email;
  if (loggedOut) pass(`${role.toUpperCase()}_LOGOUT`, { signoutStatus: status });
  else fail(`${role.toUpperCase()}_LOGOUT`, { before: !!before.json?.user, after: !!afterJson?.user });
}

async function testInvalidLogin() {
  try {
    await loginAs({ email: 'admin@horeca1.com', password: 'wrongpassword' });
    fail('INVALID_LOGIN_REJECTED', { reason: 'login succeeded with bad password' });
  } catch {
    pass('INVALID_LOGIN_REJECTED');
  }
}

async function testSessionStale(adminJar) {
  const probe = await api(adminJar, '/api/v1/auth/session-stale');
  if (probe.json?.success && probe.json?.data?.stale === false) {
    pass('SESSION_STALE_PROBE', { stale: false });
  } else {
    fail('SESSION_STALE_PROBE', probe.json);
  }
}

async function testAccountSwitch(customerJar) {
  const accounts = await api(customerJar, '/api/v1/account');
  const list = accounts.json?.data ?? [];
  if (list.length < 2) {
    fail('ACCOUNT_LIST', { count: list.length, expectedMin: 2 });
    return;
  }
  pass('ACCOUNT_LIST', { count: list.length });

  const sessionBefore = await api(customerJar, '/api/auth/session');
  const activeBefore = sessionBefore.json?.user?.activeBusinessAccountId;
  const target = list.find((a) => a.id !== activeBefore) ?? list[1];
  const sw = await api(customerJar, '/api/v1/auth/switch-business-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ businessAccountId: target.id, outletId: target.primaryOutletId ?? null }),
  });
  if (!sw.json?.success) {
    fail('ACCOUNT_SWITCH', { status: sw.status, json: sw.json });
    return;
  }
  pass('ACCOUNT_SWITCH', { accountId: target.id });

  // JWT only rotates via Auth.js session.update (same as the browser switcher).
  const updated = await updateSession(customerJar, {
    activeBusinessAccountId: target.id,
    activeOutletId: target.primaryOutletId ?? undefined,
  });
  const activeAfter = updated.json?.user?.activeBusinessAccountId;
  if (activeAfter === target.id) {
    pass('HCID_SESSION_ACTIVE_BA', { activeBusinessAccountId: activeAfter });
  } else {
    fail('HCID_SESSION_ACTIVE_BA', {
      expected: target.id,
      session: activeAfter,
      updateStatus: updated.status,
    });
  }
}

async function main() {
  console.log(`\n=== Auth E2E Audit @ ${BASE} ===\n`);

  await testInvalidLogin();

  for (const role of ['admin', 'vendor', 'customer', 'brand']) {
    const ctx = await testRoleLogin(role);
    if (!ctx) continue;
    await testProtectedRoutes(role, ctx.jar);
    if (role === 'customer') await testAccountSwitch(ctx.jar);
    if (role === 'admin') {
      await testSessionStale(ctx.jar);
      await testImpersonationMutex(ctx.jar);
    }
    await testLogout(ctx.jar, role);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - ${f.step}: ${JSON.stringify(f)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
