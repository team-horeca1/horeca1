/**
 * Extended auth E2E: OTP login, vendor/brand/admin team flows, proxy redirects.
 * Run: npx tsx scripts/auth-audit-extended.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ts = Date.now();

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

async function passwordLogin(email: string, password: string, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const jar: Jar = new Map();
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
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
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
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
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
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

  const jar: Jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
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
  const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: jarHeader(jar) } });
  const session = await sessionRes.json();
  if (session?.user?.id) pass('OTP_LOGIN', { role: session.user.role });
  else fail('OTP_LOGIN', { status: loginRes.status, session });
}

async function findTemplateRole(scope: 'admin' | 'vendor' | 'brand', name: string) {
  return prisma.accountRole.findFirst({
    where: { scope, name, isTemplate: true, businessAccountId: null },
    select: { id: true, name: true },
  });
}

async function testVendorTeam() {
  const jar = await passwordLogin('owner@spicetrail.in', 'vendor123');
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
  const jar = await passwordLogin('brand@kitchensmith.com', 'brand123');
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
  const jar = await passwordLogin('admin@horeca1.com', 'admin123');
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

async function main() {
  console.log(`\n=== Extended Auth Audit @ ${BASE} ===\n`);
  const pause = () => new Promise((r) => setTimeout(r, 3000));

  await testProxyRedirects();
  await pause();
  await testOtpLogin();
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
  .finally(() => prisma.$disconnect());
