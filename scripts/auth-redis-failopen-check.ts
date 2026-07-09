/**
 * Assert deactivate still kills API access when Redis revoke is unavailable.
 * Soft-delete sets isActive=false in Postgres — getAuthContext must 401 even
 * if session:revoked:* was never written.
 *
 * Run: npx tsx scripts/auth-redis-failopen-check.ts
 * (expects seeded e2e-auth-customer + admin; localhost:3000)
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const CREDS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@horeca1.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
  },
  customer: {
    email: process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-auth-customer@horeca.test',
    password: process.env.E2E_CUSTOMER_PASSWORD ?? 'e2eCustomer123!',
  },
};

type Jar = Map<string, string>;

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

async function passwordLogin(email: string, password: string): Promise<Jar> {
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
  if (![...jar.keys()].some((k) => k.includes('authjs.session-token'))) {
    throw new Error(`Login failed for ${email}`);
  }
  return jar;
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

async function main() {
  console.log(`\n=== Redis-failopen / DB-gate check @ ${BASE} ===\n`);

  const customerJar = await passwordLogin(CREDS.customer.email, CREDS.customer.password);
  const me = await api(customerJar, '/api/auth/session');
  const customerId = (me.json as { user?: { id?: string } } | null)?.user?.id;
  if (!customerId) throw new Error('No customer session');

  // Clear Redis revoke key if present — simulate Redis never having the flag
  // (or Redis down after deactivate). Soft-delete still sets isActive=false.
  try {
    const { default: Redis } = await import('ioredis');
    const url = process.env.REDIS_URL;
    if (url) {
      const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 1500 });
      await redis.connect();
      await redis.del(`session:revoked:${customerId}`, `session:stale:${customerId}`);
      await redis.quit();
      console.log('✓ Cleared Redis revoke/stale keys for customer (simulate Redis miss)');
    }
  } catch {
    console.log('~ Redis unavailable — relying on DB isActive only (also valid)');
  }

  const adminJar = await passwordLogin(CREDS.admin.email, CREDS.admin.password);
  const deact = await api(adminJar, `/api/v1/admin/users/${customerId}`, { method: 'DELETE' });
  if (!deact.json?.success) throw new Error(`Deactivate failed: ${JSON.stringify(deact.json)}`);
  console.log('✓ Soft-deactivated customer (isActive=false)');

  // Clear revoke again AFTER deactivate — proves DB gate alone is enough
  try {
    const { default: Redis } = await import('ioredis');
    const url = process.env.REDIS_URL;
    if (url) {
      const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 1500 });
      await redis.connect();
      await redis.del(`session:revoked:${customerId}`, `session:stale:${customerId}`);
      await redis.quit();
      console.log('✓ Cleared Redis keys again after deactivate');
    }
  } catch { /* ignore */ }

  const after = await api(customerJar, '/api/v1/account');
  if (after.status !== 401) {
    console.error(`✗ Expected 401 after deactivate without Redis flag, got ${after.status}`);
    process.exitCode = 1;
  } else {
    console.log('✓ API 401 with isActive=false and no Redis revoke flag');
  }

  const react = await api(adminJar, `/api/v1/admin/users/${customerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive: true }),
  });
  if (!react.json?.success) {
    console.error('✗ Failed to reactivate customer', react.json);
    process.exitCode = 1;
  } else {
    console.log('✓ Reactivated customer');
  }

  console.log(process.exitCode ? '\n=== FAIL ===' : '\n=== PASS ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
