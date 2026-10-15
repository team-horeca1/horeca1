/**
 * Live demo smoke: login + Plan B import commit on demo.horeca1.com
 * Run: node scripts/_demo-planb-import-smoke.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE = process.env.DEMO_BASE_URL || 'https://demo.horeca1.com';
const EMAIL = process.env.DEMO_VENDOR_EMAIL || 'demo.vendor@horeca1.com';
const PASSWORD = process.env.DEMO_VENDOR_PASSWORD || 'DemoVendor123!';
const FALLBACK = [
  { email: 'fresh@dailyfreshfoods.com', password: 'vendor123' },
  { email: 'demo.vendor@horeca1.com', password: 'DemoVendor123!' },
];

const jar = new Map();

function storeCookies(res) {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const list = raw.length ? raw : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  for (const c of list) {
    if (!c) continue;
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const ck = cookieHeader();
  if (ck) headers.cookie = ck;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, redirect: 'manual' });
  storeCookies(res);
  return res;
}

async function login(email, password) {
  jar.clear();
  await req('/login');
  const csrfRes = await req('/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();
  if (!csrfToken) throw new Error('no csrf');
  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: `${BASE}/`,
    json: 'true',
    email,
    password,
  });
  const res = await req('/api/auth/callback/credentials?', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const loc = res.headers.get('location') || '';
  if (/CredentialsSignin/i.test(loc) || res.status >= 400) {
    throw new Error(`login failed ${res.status} ${loc}`);
  }
  const session = await (await req('/api/auth/session')).json();
  if (!session?.user?.email) throw new Error('no session after login');
  return session.user;
}

async function tryLogin() {
  const attempts = [{ email: EMAIL, password: PASSWORD }, ...FALLBACK];
  let last;
  for (const a of attempts) {
    try {
      const u = await login(a.email, a.password);
      console.log('LOGGED IN', u.email, u.role);
      return a;
    } catch (e) {
      last = e;
      console.log('login miss', a.email, e.message);
    }
  }
  throw last;
}

async function main() {
  await tryLogin();

  const filePath = resolve(process.cwd(), 'error/PlanB_import_template.xlsx');
  const buf = readFileSync(filePath);

  // Preview
  const previewFd = new FormData();
  previewFd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'PlanB_import_template.xlsx');
  previewFd.append('mode', 'preview');
  const previewRes = await req('/api/v1/vendor/products/import', { method: 'POST', body: previewFd });
  const previewJson = await previewRes.json();
  console.log('PREVIEW', {
    status: previewRes.status,
    success: previewJson.success,
    totalRows: previewJson.data?.totalRows,
    creates: previewJson.data?.creates,
    updates: previewJson.data?.updates,
    errors: previewJson.data?.errors?.length ?? 0,
    errMsg: previewJson.error?.message,
  });
  if (!previewJson.success) throw new Error(`preview failed: ${previewJson.error?.message}`);
  if ((previewJson.data?.totalRows ?? 0) < 11) throw new Error(`expected >=11 rows, got ${previewJson.data?.totalRows}`);

  // Commit
  const commitFd = new FormData();
  commitFd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'PlanB_import_template.xlsx');
  commitFd.append('mode', 'commit');
  const commitRes = await req('/api/v1/vendor/products/import', { method: 'POST', body: commitFd });
  const commitJson = await commitRes.json();
  const d = commitJson.data || {};
  console.log('COMMIT', {
    status: commitRes.status,
    success: commitJson.success,
    blocked: d.blocked,
    created: d.created,
    updated: d.updated,
    imported: d.imported,
    errors: d.errors?.length ?? 0,
    sampleErrors: (d.errors || []).slice(0, 3),
  });

  if (!commitJson.success) throw new Error(`commit failed: ${commitJson.error?.message}`);
  if (d.blocked) throw new Error(`commit blocked: ${JSON.stringify(d.errors?.slice(0, 3))}`);
  const errText = JSON.stringify(d.errors || []);
  if (/took too long|Delete took|rolled back/i.test(errText)) {
    throw new Error(`timeout/rollback still present: ${errText.slice(0, 400)}`);
  }
  if ((d.imported ?? 0) < 1 && (d.created ?? 0) + (d.updated ?? 0) < 1) {
    throw new Error('nothing imported');
  }

  // List vendor products — Plan B should appear
  const listRes = await req('/api/v1/vendor/products?limit=500');
  const listJson = await listRes.json();
  const products = Array.isArray(listJson.data)
    ? listJson.data
    : listJson.data?.products ?? [];
  const planB = products.filter((p) => /Plan B Vegan/i.test(p.name || ''));
  console.log('VENDOR LIST Plan B count', planB.length, 'sample', planB.slice(0, 3).map((p) => ({ name: p.name, approval: p.approvalStatus, sku: p.sku })));

  if (planB.length < 1) {
    throw new Error('Plan B products not visible in vendor product list after import');
  }

  console.log('OK — demo Plan B import smoke passed');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exitCode = 1;
});
