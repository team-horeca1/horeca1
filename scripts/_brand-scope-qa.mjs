/**
 * Local API smoke: admin impersonation brand scoping.
 * Proves DaVinci / Prabhat / President profiles resolve to distinct brands.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

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
    throw new Error(`login failed status=${res.status} body=${await res.text()}`);
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

async function getProfile(cookies) {
  const res = await fetch(`${BASE}/api/v1/brand/profile`, {
    headers: { Cookie: cookies.join('; ') },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function patchProfile(cookies, patch) {
  const res = await fetch(`${BASE}/api/v1/brand/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies.join('; '),
    },
    body: JSON.stringify(patch),
  });
  const json = await res.json();
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
    select: { id: true, name: true, slug: true, tagline: true, logoUrl: true },
  });
  const byName = Object.fromEntries(brands.map((b) => [b.name, b]));
  if (!byName['DaVinci Gourmet'] || !byName.President || !byName['Prabhat Dairy']) {
    throw new Error(`missing brands: ${JSON.stringify(Object.keys(byName))}`);
  }

  console.log('Logging in as admin…');
  let cookies = await loginAdmin();
  pass('admin login', 'credentials accepted');

  for (const name of ['DaVinci Gourmet', 'President', 'Prabhat Dairy']) {
    const brand = byName[name];
    cookies = await impersonateBrand(cookies, brand.id, brand.name);
    const { status, json } = await getProfile(cookies);
    if (status !== 200 || !json.success) {
      fail(`${name} GET profile`, `status=${status} body=${JSON.stringify(json)}`);
      continue;
    }
    if (json.data.id !== brand.id || json.data.name !== brand.name) {
      fail(
        `${name} GET profile scoped`,
        `expected id=${brand.id} name=${brand.name}; got id=${json.data.id} name=${json.data.name}`,
      );
    } else {
      pass(`${name} GET profile scoped`, `id=${json.data.id}`);
    }
  }

  // Cross-write test: while impersonating DaVinci, PATCH tagline, then switch to President and confirm President unchanged.
  const marker = `davinci-qa-${Date.now()}`;
  cookies = await impersonateBrand(cookies, byName['DaVinci Gourmet'].id, 'DaVinci Gourmet');
  const patch = await patchProfile(cookies, { tagline: marker });
  if (!patch.json.success) {
    fail('DaVinci PATCH tagline', JSON.stringify(patch.json));
  } else if (patch.json.data?.name !== 'DaVinci Gourmet') {
    fail('DaVinci PATCH returned wrong brand', `name=${patch.json.data?.name}`);
  } else {
    pass('DaVinci PATCH tagline', marker);
  }

  cookies = await impersonateBrand(cookies, byName.President.id, 'President');
  const president = await getProfile(cookies);
  if (president.json.data?.tagline === marker) {
    fail('President isolation after DaVinci write', `President tagline leaked: ${president.json.data.tagline}`);
  } else if (president.json.data?.name !== 'President') {
    fail('President GET after switch', `got ${president.json.data?.name}`);
  } else {
    pass('President isolation after DaVinci write', `tagline=${president.json.data?.tagline ?? '(null)'}`);
  }

  // Cleanup DaVinci tagline
  cookies = await impersonateBrand(cookies, byName['DaVinci Gourmet'].id, 'DaVinci Gourmet');
  await patchProfile(cookies, { tagline: byName['DaVinci Gourmet'].tagline ?? '' });
} catch (e) {
  fail('suite', e instanceof Error ? e.message : String(e));
} finally {
  await prisma.$disconnect();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
