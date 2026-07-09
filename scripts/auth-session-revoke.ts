/**
 * Verify force-logout when admin deactivates / hard-deletes / removes team members.
 * Expects seeded e2e-auth-* users (run test:auth:seed first) and localhost:3000.
 *
 * Run: npx tsx scripts/auth-session-revoke.ts
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ts = Date.now();

const CREDS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@horeca1.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
  },
  vendor: {
    email: process.env.E2E_VENDOR_EMAIL ?? 'e2e-auth-vendor@horeca.test',
    password: process.env.E2E_VENDOR_PASSWORD ?? 'e2eVendor123!',
  },
  customer: {
    email: process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-auth-customer@horeca.test',
    password: process.env.E2E_CUSTOMER_PASSWORD ?? 'e2eCustomer123!',
  },
};

type Jar = Map<string, string>;
const results: { step: string; ok: boolean; detail?: unknown }[] = [];

function pass(step: string, detail?: unknown) {
  results.push({ step, ok: true, detail });
  console.log(`✓ ${step}`, detail ? JSON.stringify(detail).slice(0, 120) : '');
}
function fail(step: string, detail?: unknown) {
  results.push({ step, ok: false, detail });
  console.error(`✗ ${step}`, JSON.stringify(detail));
}

function mergeCookies(jar: Jar, setCookie: string | null) {
  if (!setCookie) return;
  for (const p of setCookie.split(/,(?=\s*[^;,]+=)/)) {
    const [kv] = p.split(';');
    const eq = kv.indexOf('=');
    if (eq < 1) continue;
    const name = kv.slice(0, eq).trim();
    const val = kv.slice(eq + 1).trim();
    if (!val) jar.delete(name);
    else jar.set(name, val);
  }
}

function jarHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function flushAuthRateLimits() {
  const url = process.env.REDIS_URL;
  if (!url) return;
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    await Promise.race([
      (async () => {
        await client.connect();
        const keys = await client.keys('rl:auth:*');
        if (keys.length) await client.del(...keys);
        await client.quit();
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('redis timeout')), 2500)),
    ]);
  } catch {
    /* ignore — passwordLogin backs off on 429 */
  }
}

async function passwordLogin(email: string, password: string, retries = 6): Promise<Jar> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const jar: Jar = new Map();
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    if (csrfRes.status === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    mergeCookies(jar, csrfRes.headers.get('set-cookie'));
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const loginRes = await fetch(`${BASE}/api/auth/callback/credentials?`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jarHeader(jar) },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE, json: 'true' }),
      redirect: 'manual',
    });
    mergeCookies(jar, loginRes.headers.get('set-cookie'));
    if ([...jar.keys()].some((k) => k.includes('authjs.session-token'))) return jar;
    if (loginRes.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`Login failed for ${email}: ${loginRes.status}`);
  }
  throw new Error(`Login failed for ${email}`);
}

async function api(jar: Jar, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Cookie: jarHeader(jar), ...(init.headers as Record<string, string> ?? {}) },
    redirect: 'manual',
  });
  mergeCookies(jar, res.headers.get('set-cookie'));
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function testSoftDeactivate() {
  await flushAuthRateLimits();
  const customerJar = await passwordLogin(CREDS.customer.email, CREDS.customer.password);
  const before = await api(customerJar, '/api/v1/account');
  if (before.status !== 200) {
    fail('REVOKE_SOFT_PRECHECK', before);
    return;
  }
  pass('REVOKE_SOFT_PRECHECK', { status: 200 });

  const me = await api(customerJar, '/api/auth/session');
  const customerId = (me.json as { user?: { id?: string } } | null)?.user?.id;
  if (!customerId) {
    fail('REVOKE_SOFT_USER', { session: me.json });
    return;
  }

  const adminJar = await passwordLogin(CREDS.admin.email, CREDS.admin.password);
  const deact = await api(adminJar, `/api/v1/admin/users/${customerId}`, {
    method: 'DELETE',
  });
  if (!deact.json?.success) {
    fail('REVOKE_SOFT_DEACTIVATE', deact);
    return;
  }
  pass('REVOKE_SOFT_DEACTIVATE', { id: customerId });

  const afterApi = await api(customerJar, '/api/v1/account');
  if (afterApi.status === 401) pass('REVOKE_SOFT_API_401', { status: 401 });
  else fail('REVOKE_SOFT_API_401', afterApi);

  const afterSession = await api(customerJar, '/api/auth/session');
  const hasUser = !!(afterSession.json as { user?: { id?: string } } | null)?.user?.id;
  if (!hasUser) pass('REVOKE_SOFT_SESSION_EMPTY', {});
  else fail('REVOKE_SOFT_SESSION_EMPTY', afterSession.json);

  const probe = await api(customerJar, '/api/v1/auth/session-stale');
  if (probe.status === 401 || probe.json?.data?.valid === false) {
    pass('REVOKE_SOFT_PROBE_INVALID', { status: probe.status });
  } else {
    fail('REVOKE_SOFT_PROBE_INVALID', probe);
  }

  // Reactivate so later suites / cleanup can use the seeded customer.
  const react = await api(adminJar, `/api/v1/admin/users/${customerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive: true }),
  });
  if (react.json?.success) pass('REVOKE_SOFT_REACTIVATE', {});
  else fail('REVOKE_SOFT_REACTIVATE', react);
}

async function testVendorTeamRemove() {
  await flushAuthRateLimits();
  const vendorJar = await passwordLogin(CREDS.vendor.email, CREDS.vendor.password);
  const rolesRes = await api(vendorJar, '/api/v1/vendor/roles');
  const roles = (rolesRes.json?.data ?? rolesRes.json?.roles ?? []) as Array<{ id: string; name?: string }>;
  const role = roles.find((r) => r.name === 'Sales Rep') ?? roles[0];
  if (!role?.id) {
    fail('REVOKE_TEAM_ROLE', { status: rolesRes.status, json: rolesRes.json });
    return;
  }
  pass('REVOKE_TEAM_ROLE', { roleId: role.id, name: role.name });

  const email = `revoke-agent-${ts}@example.com`;
  const invite = await api(vendorJar, '/api/v1/vendor/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: email,
      fullName: 'Revoke Test Agent',
      password: 'agent12345',
      roleId: role.id,
    }),
  });
  if (invite.status !== 201 && invite.json?.success !== true) {
    fail('REVOKE_TEAM_INVITE', invite);
    return;
  }
  const memberId = invite.json?.data?.id as string;
  pass('REVOKE_TEAM_INVITE', { memberId, email });

  const agentJar = await passwordLogin(email, 'agent12345');
  const dashOk = await api(agentJar, '/api/v1/vendor/dashboard');
  if (dashOk.status === 200) pass('REVOKE_TEAM_AGENT_OK', { status: 200 });
  else fail('REVOKE_TEAM_AGENT_OK', dashOk);

  const del = await api(vendorJar, `/api/v1/vendor/team/${memberId}`, { method: 'DELETE' });
  if (del.json?.success) pass('REVOKE_TEAM_DELETE', { memberId });
  else fail('REVOKE_TEAM_DELETE', del);

  const dashAfter = await api(agentJar, '/api/v1/vendor/dashboard');
  if (dashAfter.status === 401 || dashAfter.status === 403) {
    pass('REVOKE_TEAM_AGENT_BLOCKED', { status: dashAfter.status });
  } else {
    fail('REVOKE_TEAM_AGENT_BLOCKED', dashAfter);
  }

  // Force JWT callback to observe revoke/delete (GET session re-runs jwt).
  const sessionAfter = await api(agentJar, '/api/auth/session');
  const hasUser = !!(sessionAfter.json as { user?: { id?: string } } | null)?.user?.id;
  const stillVendor =
    (sessionAfter.json as { user?: { activeVendorId?: string; permissions?: unknown[] } } | null)
      ?.user?.activeVendorId;
  // Invite-only agents should be hard-deleted → empty session. At minimum no vendor context.
  if (!hasUser) pass('REVOKE_TEAM_SESSION', { hasUser: false });
  else if (!stillVendor && dashAfter.status !== 200) pass('REVOKE_TEAM_SESSION', { hasUser: true, vendorCleared: true });
  else fail('REVOKE_TEAM_SESSION', { hasUser, stillVendor, session: sessionAfter.json });
}

async function testHardDelete() {
  await flushAuthRateLimits();
  const email = `revoke-hard-${ts}@horeca.test`;
  const password = 'e2eHardDel123!';
  const phone = `999${String(ts).slice(-7)}`;

  const adminJar = await passwordLogin(CREDS.admin.email, CREDS.admin.password);
  const created = await api(adminJar, '/api/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      fullName: 'E2E Hard Delete Target',
      role: 'customer',
      phone,
      businessName: 'E2E-AUTH Hard Delete Co',
    }),
  });
  const userId = created.json?.data?.id as string | undefined;
  if (!created.json?.success || !userId) {
    fail('REVOKE_HARD_CREATE', created);
    return;
  }
  pass('REVOKE_HARD_CREATE', { id: userId });

  try {
    const jar = await passwordLogin(email, password);
    const pre = await api(jar, '/api/v1/auth/me');
    if (pre.status !== 200) {
      fail('REVOKE_HARD_PRECHECK', pre);
      return;
    }
    pass('REVOKE_HARD_PRECHECK', { status: 200 });

    const hard = await api(adminJar, `/api/v1/admin/users/${userId}?force=true`, {
      method: 'DELETE',
    });
    if (!hard.json?.success) {
      fail('REVOKE_HARD_DELETE', hard);
      return;
    }
    pass('REVOKE_HARD_DELETE', { id: userId });

    const after = await api(jar, '/api/v1/account');
    if (after.status === 401) pass('REVOKE_HARD_API_401', { status: 401 });
    else fail('REVOKE_HARD_API_401', after);

    const session = await api(jar, '/api/auth/session');
    const hasUser = !!(session.json as { user?: { id?: string } } | null)?.user?.id;
    if (!hasUser) pass('REVOKE_HARD_SESSION_EMPTY', {});
    else fail('REVOKE_HARD_SESSION_EMPTY', session.json);
  } finally {
    // Best-effort cleanup if hard delete failed mid-test
    await api(adminJar, `/api/v1/admin/users/${userId}?force=true`, { method: 'DELETE' }).catch(() => undefined);
  }
}

async function main() {
  console.log(`\n=== Auth Session Revoke Audit @ ${BASE} ===\n`);
  await flushAuthRateLimits();
  await testSoftDeactivate();
  await flushAuthRateLimits();
  await new Promise((r) => setTimeout(r, 2000));
  await testVendorTeamRemove();
  await flushAuthRateLimits();
  await new Promise((r) => setTimeout(r, 2000));
  await testHardDelete();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  - ${f.step}:`, JSON.stringify(f.detail));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
