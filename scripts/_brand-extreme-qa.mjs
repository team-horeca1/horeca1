/**
 * Extreme brand QA: APIs + storefront + portal scoping via cookies.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || 'postgresql://horeca1:horeca1_dev@127.0.0.1:5432/horeca1',
});
const prisma = new PrismaClient({ adapter });

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(';')[0]).filter(Boolean);
}

async function loginAdmin() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = parseSetCookie(csrfRes);
  const body = new URLSearchParams({
    csrfToken,
    email: 'admin@horeca1.com',
    password: 'admin123',
    callbackUrl: `${BASE}/admin`,
    json: 'true',
  });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies.join('; '),
    },
    body,
    redirect: 'manual',
  });
  cookies.push(...parseSetCookie(res));
  if (res.status !== 200 && res.status !== 302) {
    throw new Error(`login failed status=${res.status}`);
  }
  return cookies;
}

async function impersonateBrand(cookies, brandId, brandName) {
  const res = await fetch(`${BASE}/api/v1/admin/impersonate/brand`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies.join('; '),
    },
    body: JSON.stringify({ brandId, brandName }),
  });
  cookies.push(...parseSetCookie(res));
  const json = await res.json();
  if (!json.success) throw new Error(`impersonate failed: ${JSON.stringify(json)}`);
  return cookies;
}

async function getJson(cookies, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookies.join('; ') },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function patchJson(cookies, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies.join('; '),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function postJson(cookies, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies.join('; '),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const results = [];
function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name} — ${detail}`);
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.log(`FAIL  ${name} — ${detail}`);
}

try {
  const brands = await prisma.brand.findMany({
    where: { name: { in: ['DaVinci Gourmet', 'President', 'Prabhat Dairy'] } },
    select: { id: true, name: true, slug: true },
  });
  const byName = Object.fromEntries(brands.map((b) => [b.name, b]));

  // 1) Public storefronts
  for (const name of ['DaVinci Gourmet', 'President', 'Prabhat Dairy']) {
    const slug = byName[name].slug;
    const res = await fetch(`${BASE}/api/v1/brands/${slug}`);
    const json = await res.json();
    if (res.status === 200 && json.success && json.data?.name === name) {
      pass(`storefront API ${name}`, `slug=${slug} products=${json.data.products?.length ?? 0}`);
    } else {
      fail(`storefront API ${name}`, `status=${res.status} name=${json.data?.name} err=${JSON.stringify(json.error)}`);
    }
    const page = await fetch(`${BASE}/brand/${slug}`);
    if (page.status === 200) pass(`storefront page ${name}`, `HTTP 200`);
    else fail(`storefront page ${name}`, `HTTP ${page.status}`);
  }

  // wrong slug should 404 API
  {
    const res = await fetch(`${BASE}/api/v1/brands/davinci-gourmet-7bddc08c`);
    const json = await res.json();
    if (res.status === 404 || !json.success) pass('wrong slug 404', `status=${res.status}`);
    else fail('wrong slug 404', `unexpected success`);
  }

  let cookies = await loginAdmin();
  pass('admin login', 'ok');

  // 2) Portal APIs per brand
  for (const name of ['DaVinci Gourmet', 'President', 'Prabhat Dairy']) {
    const brand = byName[name];
    cookies = await impersonateBrand(cookies, brand.id, brand.name);

    const profile = await getJson(cookies, '/api/v1/brand/profile');
    if (profile.status === 200 && profile.json.data?.id === brand.id) {
      pass(`${name} profile`, `id match`);
    } else {
      fail(`${name} profile`, JSON.stringify(profile));
    }

    const products = await getJson(cookies, '/api/v1/brand/products');
    const prodList = products.json.data?.products ?? products.json.data ?? [];
    if (products.status === 200 && products.json.success) {
      pass(`${name} products`, `count=${Array.isArray(prodList) ? prodList.length : '?'}`);
    } else {
      fail(`${name} products`, `status=${products.status} ${JSON.stringify(products.json).slice(0, 200)}`);
    }

    const coverage = await getJson(cookies, '/api/v1/brand/coverage');
    if (coverage.status === 200 && coverage.json.success) {
      pass(`${name} coverage`, `ok`);
    } else {
      fail(`${name} coverage`, `status=${coverage.status}`);
    }

    const analytics = await getJson(cookies, '/api/v1/brand/analytics');
    if (analytics.status === 200 && analytics.json.success) {
      pass(`${name} analytics`, `ok`);
    } else {
      fail(`${name} analytics`, `status=${analytics.status} ${JSON.stringify(analytics.json).slice(0, 120)}`);
    }

    const dists = await getJson(cookies, '/api/v1/brand/authorized-distributors');
    if (dists.status === 200 && dists.json.success) {
      const list = dists.json.data?.distributors ?? [];
      pass(`${name} distributors`, `count=${list.length}`);
    } else {
      fail(`${name} distributors`, `status=${dists.status}`);
    }
  }

  // 3) Cross-brand write isolation with logo URL
  const davinci = byName['DaVinci Gourmet'];
  const president = byName.President;
  cookies = await impersonateBrand(cookies, davinci.id, davinci.name);
  const marker = `qa-logo-${Date.now()}.png`;
  const patch = await patchJson(cookies, '/api/v1/brand/profile', {
    tagline: `DaVinci QA ${Date.now()}`,
    logoUrl: `https://ik.imagekit.io/nasjugiz2/horeca/brands/${marker}`,
  });
  if (patch.status === 200 && patch.json.success) {
    pass('DaVinci logo patch', marker);
  } else {
    fail('DaVinci logo patch', JSON.stringify(patch.json).slice(0, 200));
  }

  cookies = await impersonateBrand(cookies, president.id, president.name);
  const pres = await getJson(cookies, '/api/v1/brand/profile');
  if (pres.json.data?.logoUrl?.includes(marker)) {
    fail('President isolation', 'got DaVinci logo marker');
  } else {
    pass('President isolation', `logo=${pres.json.data?.logoUrl ?? 'null'}`);
  }

  // 4) Upload endpoint auth
  {
    const pngPath = resolve('tmp-local-db/qa-logo.png');
    let buf;
    try {
      buf = readFileSync(pngPath);
    } catch {
      buf = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
    }
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/png' }), 'qa-logo.png');
    form.append('folder', 'brands');
    cookies = await impersonateBrand(cookies, davinci.id, davinci.name);
    const up = await fetch(`${BASE}/api/v1/upload`, {
      method: 'POST',
      headers: { Cookie: cookies.join('; ') },
      body: form,
    });
    const upJson = await up.json().catch(() => ({}));
    if (up.status === 200 && (upJson.url || upJson.data?.url || upJson.success)) {
      pass('image upload', `status=200 url=${upJson.url || upJson.data?.url || 'ok'}`);
    } else {
      fail('image upload', `status=${up.status} ${JSON.stringify(upJson).slice(0, 250)}`);
    }
  }

  // 5) Mappings list if endpoint exists
  {
    cookies = await impersonateBrand(cookies, davinci.id, davinci.name);
    for (const path of [
      '/api/v1/brand/mappings',
      '/api/v1/brand/product-mappings',
      '/api/v1/brand/authorized-distributors',
    ]) {
      const r = await getJson(cookies, path);
      if (r.status === 200) pass(`GET ${path}`, '200');
      else if (r.status === 404) pass(`GET ${path}`, '404 (absent)');
      else fail(`GET ${path}`, `status=${r.status}`);
    }
  }

  // 6) Portal HTML pages under impersonation (redirect check)
  {
    cookies = await impersonateBrand(cookies, davinci.id, davinci.name);
    for (const path of [
      '/brand/portal',
      '/brand/portal/settings',
      '/brand/portal/products',
      '/brand/portal/distributors',
      '/brand/portal/analytics',
      '/brand/portal/mappings',
    ]) {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Cookie: cookies.join('; ') },
        redirect: 'manual',
      });
      const loc = res.headers.get('location') || '';
      if (res.status === 200) pass(`page ${path}`, '200');
      else if (path.endsWith('/mappings') && (res.status === 404 || res.status === 308 || res.status === 307)) {
        pass(`page ${path}`, `expected dead route status=${res.status}`);
      } else if (res.status >= 300 && res.status < 400) {
        fail(`page ${path}`, `redirect ${res.status} → ${loc}`);
      } else {
        fail(`page ${path}`, `status=${res.status}`);
      }
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${ok}/${results.length} passed (${bad} failed)`);
  if (bad) process.exitCode = 1;
} catch (e) {
  console.error('FATAL', e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
