/**
 * Extended auth E2E: OTP login, vendor/brand/admin team flows, proxy redirects.
 * Run: npx tsx scripts/auth-audit-extended.ts
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ts = Date.now();

async function flushAuthRateLimits() {
  try {
    const keys = await redis.keys('rl:auth:*');
    if (keys.length) await redis.del(...keys);
  } catch {
    /* ignore — passwordLogin already backs off on 429 */
  }
}

const CREDS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@horeca1.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
  },
  vendor: {
    email: process.env.E2E_VENDOR_EMAIL ?? 'e2e-auth-vendor@horeca.test',
    password: process.env.E2E_VENDOR_PASSWORD ?? 'e2eVendor123!',
  },
  brand: {
    email: process.env.E2E_BRAND_EMAIL ?? 'e2e-auth-brand@horeca.test',
    password: process.env.E2E_BRAND_PASSWORD ?? 'e2eBrand123!',
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
  console.log(`✓ ${step}`, detail ? JSON.stringify(detail).slice(0, 100) : '');
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

async function passwordLogin(email: string, password: string, retries = 6) {
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
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`Login failed for ${email}: ${loginRes.status}`);
  }
  throw new Error(`Login failed for ${email}: exhausted retries`);
}

async function api(jar: Jar, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Cookie: jarHeader(jar), ...(init.headers as Record<string, string> ?? {}) },
    redirect: 'manual',
  });
  mergeCookies(jar, res.headers.get('set-cookie'));
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

/** Mirror useSession().update() — POST /api/auth/session with csrf + data. */
async function updateSession(jar: Jar, data: Record<string, unknown>) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { Cookie: jarHeader(jar) } });
  mergeCookies(jar, csrfRes.headers.get('set-cookie'));
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jarHeader(jar) },
    body: JSON.stringify({ csrfToken, data }),
  });
  mergeCookies(jar, res.headers.get('set-cookie'));
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function testProxyRedirects() {
  const checks = [
    { path: '/checkout', expect: 307 },
    { path: '/profile', expect: 307 },
  ];
  for (const c of checks) {
    const res = await fetch(`${BASE}${c.path}`, { redirect: 'manual' });
    if (res.status === c.expect) pass(`PROXY_${c.path}`, { status: res.status, location: res.headers.get('location') });
    else fail(`PROXY_${c.path}`, { status: res.status, expected: c.expect });
  }
}

async function testOtpLogin() {
  const phone = `9${String(ts).slice(-9)}`;
  const send = await fetch(`${BASE}/api/v1/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, mode: 'login' }),
  });
  const sendJson = await send.json();
  if (!sendJson?.success) {
    fail('OTP_SEND', sendJson);
    return;
  }
  pass('OTP_SEND', { phone });

  const otpRow = await prisma.otpCode.findFirst({
    where: { phone: { contains: phone.slice(-10) } },
    orderBy: { createdAt: 'desc' },
    select: { code: true, phone: true },
  });
  if (!otpRow?.code) {
    fail('OTP_DB_LOOKUP', { phone });
    return;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const jar: Jar = new Map();
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    if (csrfRes.status === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    mergeCookies(jar, csrfRes.headers.get('set-cookie'));
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const loginRes = await fetch(`${BASE}/api/auth/callback/otp?`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jarHeader(jar) },
      body: new URLSearchParams({
        csrfToken,
        phone: otpRow.phone,
        code: otpRow.code,
        isRegister: 'false',
        callbackUrl: BASE,
        json: 'true',
      }),
      redirect: 'manual',
    });
    mergeCookies(jar, loginRes.headers.get('set-cookie'));
    if (loginRes.status === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: jarHeader(jar) } });
    const session = await sessionRes.json();
    if (session?.user?.id) {
      pass('OTP_LOGIN', { role: session.user.role });
      return;
    }
    fail('OTP_LOGIN', { status: loginRes.status, session });
    return;
  }
  fail('OTP_LOGIN', { reason: 'rate-limited after retries' });
}

async function findTemplateRole(scope: 'admin' | 'vendor' | 'brand', name: string) {
  return prisma.accountRole.findFirst({
    where: { scope, name, isTemplate: true, businessAccountId: null },
    select: { id: true, name: true },
  });
}

async function testVendorTeam() {
  const jar = await passwordLogin(CREDS.vendor.email, CREDS.vendor.password);
  const role = await findTemplateRole('vendor', 'Sales Rep');
  if (!role) { fail('VENDOR_TEAM_ROLE', {}); return; }

  const email = `vendor-agent-${ts}@example.com`;
  const invite = await api(jar, '/api/v1/vendor/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: email,
      fullName: 'Vendor Test Agent',
      password: 'agent12345',
      roleId: role.id,
    }),
  });
  if (invite.status !== 201 && invite.json?.success !== true) {
    fail('VENDOR_TEAM_INVITE', { status: invite.status, json: invite.json });
    return;
  }
  const memberId = invite.json?.data?.id;
  const userId = invite.json?.data?.user?.id ?? invite.json?.data?.userId;
  pass('VENDOR_TEAM_INVITE', { memberId, userId, email });

  const agentJar = await passwordLogin(email, 'agent12345');
  const dash = await api(agentJar, '/api/v1/vendor/dashboard');
  if (dash.status === 200) pass('VENDOR_AGENT_DASHBOARD', { status: 200 });
  else fail('VENDOR_AGENT_DASHBOARD', { status: dash.status });

  const del = await api(jar, `/api/v1/vendor/team/${memberId}`, { method: 'DELETE' });
  if (del.json?.success) pass('VENDOR_TEAM_DELETE', { userId });
  else fail('VENDOR_TEAM_DELETE', del);
}

async function testBrandTeam() {
  const jar = await passwordLogin(CREDS.brand.email, CREDS.brand.password);
  const role = await findTemplateRole('brand', 'Marketing Executive');
  if (!role) { fail('BRAND_TEAM_ROLE', {}); return; }

  const email = `brand-agent-${ts}@example.com`;
  const invite = await api(jar, '/api/v1/brand/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: email,
      fullName: 'Brand Test Agent',
      password: 'agent12345',
      roleId: role.id,
    }),
  });
  if (invite.status !== 201 && invite.json?.success !== true) {
    fail('BRAND_TEAM_INVITE', { status: invite.status, json: invite.json });
    return;
  }
  const memberId = invite.json?.data?.id;
  const userId = invite.json?.data?.user?.id ?? invite.json?.data?.userId;
  pass('BRAND_TEAM_INVITE', { memberId, userId, email });

  const agentJar = await passwordLogin(email, 'agent12345');
  const profile = await api(agentJar, '/api/v1/brand/products');
  if (profile.status === 200) pass('BRAND_AGENT_PRODUCTS', { status: 200 });
  else fail('BRAND_AGENT_PRODUCTS', { status: profile.status });

  const account = await api(agentJar, '/api/v1/account');
  if (account.status === 200) pass('BRAND_AGENT_ACCOUNT_LIST', { count: account.json?.data?.length });
  else fail('BRAND_AGENT_ACCOUNT_LIST', { status: account.status, json: account.json });

  const del = await api(jar, `/api/v1/brand/team/${memberId}`, { method: 'DELETE' });
  if (del.json?.success) pass('BRAND_TEAM_DELETE', { userId });
  else fail('BRAND_TEAM_DELETE', del);
}

async function testAdminTeam() {
  const jar = await passwordLogin(CREDS.admin.email, CREDS.admin.password);
  const role = await findTemplateRole('admin', 'Support Agent');
  if (!role) { fail('ADMIN_TEAM_ROLE', {}); return; }

  const email = `admin-agent-${ts}@example.com`;
  const invite = await api(jar, '/api/v1/admin/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: email,
      fullName: 'Admin Test Agent',
      password: 'agent12345',
      roleId: role.id,
    }),
  });
  if (invite.status !== 201 && invite.json?.success !== true) {
    fail('ADMIN_TEAM_INVITE', { status: invite.status, json: invite.json });
    return;
  }
  const userId = invite.json?.data?.user?.id ?? invite.json?.data?.userId;
  pass('ADMIN_TEAM_INVITE', { userId });

  const agentJar = await passwordLogin(email, 'agent12345');
  const vendors = await api(agentJar, '/api/v1/admin/vendors?limit=1');
  if (vendors.status === 403) pass('ADMIN_AGENT_VENDORS_BLOCKED', { status: 403 });
  else fail('ADMIN_AGENT_VENDORS_BLOCKED', { status: vendors.status });

  const del = await api(jar, `/api/v1/admin/team/${userId}`, { method: 'DELETE' });
  if (del.json?.success) pass('ADMIN_TEAM_DELETE', { userId });
  else fail('ADMIN_TEAM_DELETE', del);
}

/** HCID multi-account: customer with ≥2 BAs switches; session + account reflect new active BA. */
async function testHcidMultiAccount() {
  const jar = await passwordLogin(CREDS.customer.email, CREDS.customer.password);
  const accounts = await api(jar, '/api/v1/account');
  const list = (accounts.json?.data ?? []) as Array<{ id: string; primaryOutletId?: string | null }>;
  if (list.length < 2) {
    fail('HCID_MULTI_ACCOUNT_LIST', { count: list.length });
    return;
  }
  pass('HCID_MULTI_ACCOUNT_LIST', { count: list.length });

  const sessionBefore = await api(jar, '/api/auth/session');
  const activeBefore = sessionBefore.json?.user?.activeBusinessAccountId as string | undefined;
  const target = list.find((a) => a.id !== activeBefore) ?? list[1];

  const sw = await api(jar, '/api/v1/auth/switch-business-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ businessAccountId: target.id, outletId: target.primaryOutletId ?? null }),
  });
  if (!sw.json?.success) {
    fail('HCID_SWITCH_BA', { status: sw.status, json: sw.json });
    return;
  }
  pass('HCID_SWITCH_BA', { to: target.id });

  const updated = await updateSession(jar, {
    activeBusinessAccountId: target.id,
    activeOutletId: target.primaryOutletId ?? undefined,
  });
  const me = await api(jar, '/api/v1/auth/me');
  const activeAfter = (updated.json as { user?: { activeBusinessAccountId?: string; permissions?: Record<string, unknown> } } | null)
    ?.user?.activeBusinessAccountId;
  const perms =
    (updated.json as { user?: { permissions?: Record<string, unknown> } } | null)?.user?.permissions
    ?? (me.json as { data?: { permissions?: Record<string, unknown> } } | null)?.data?.permissions;
  if (activeAfter === target.id) pass('HCID_SESSION_RELOAD', { activeBusinessAccountId: activeAfter });
  else fail('HCID_SESSION_RELOAD', { expected: target.id, got: activeAfter, updateStatus: updated.status });

  if (perms && typeof perms === 'object') pass('HCID_PERMISSIONS_PRESENT', { keys: Object.keys(perms).length });
  else fail('HCID_PERMISSIONS_PRESENT', { perms });
}

async function main() {
  console.log(`\n=== Extended Auth Audit @ ${BASE} ===\n`);
  const pause = async (ms = 3000) => {
    await flushAuthRateLimits();
    await new Promise((r) => setTimeout(r, ms));
  };

  await flushAuthRateLimits();
  await testProxyRedirects();
  await pause();
  await testOtpLogin();
  await pause();
  await testHcidMultiAccount();
  await pause();
  await testVendorTeam();
  await pause();
  await testBrandTeam();
  await pause();
  await testAdminTeam();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  - ${f.step}:`, JSON.stringify(f.detail));
    process.exit(1);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => {
    await prisma.$disconnect();
    try { await redis.quit(); } catch { /* ignore */ }
  });
