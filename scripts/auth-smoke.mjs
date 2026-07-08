/**
 * Security-first auth smoke — unauthenticated route protection check.
 * Run: node scripts/auth-smoke.mjs [BASE_URL...]
 * Default: localhost:3000 and https://freshville.store (prod).
 */
const BASES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['http://localhost:3000', 'https://freshville.store'];

const ROUTES = [
  { path: '/checkout', expect: [307, 308], label: 'customer protected' },
  { path: '/profile', expect: [307, 308], label: 'customer protected' },
  { path: '/admin', expect: [307, 308], label: 'admin gate' },
  { path: '/admin/dashboard', expect: [307, 308], label: 'admin gate' },
  { path: '/vendor/dashboard', expect: [307, 308], label: 'vendor portal' },
  { path: '/brand/portal', expect: [307, 308], label: 'brand portal' },
  { path: '/login', expect: [200, 307, 308], label: 'public login' },
  { path: '/', expect: [200], label: 'public home' },
];

const API_ROUTES = [
  { path: '/api/v1/admin/dashboard', expect: [401, 403], label: 'admin API' },
  { path: '/api/v1/vendor/orders', expect: [401, 403], label: 'vendor API' },
  { path: '/api/v1/brand/profile', expect: [401, 403], label: 'brand API' },
  { path: '/api/v1/account', expect: [401, 403], label: 'account API' },
];

let passed = 0;
let failed = 0;

async function probe(base, { path, expect, label }) {
  try {
    const res = await fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const loc = res.headers.get('location') ?? '';
    // nginx http→https: accept 301/308 if final hop after one redirect is protected
    if ([301, 308].includes(res.status) && loc) {
      const next = loc.startsWith('http') ? loc : new URL(loc, base).href;
      const res2 = await fetch(next, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      const ok = expect.includes(res2.status);
      if (ok) {
        passed++;
        console.log(`✓ ${base}${path} → ${res.status} → ${res2.status}`);
      } else {
        failed++;
        console.error(`✗ ${base}${path} → ${res.status} → ${res2.status} (expected ${expect.join('|')}) [${label}]`);
      }
      return { base, path, status: res2.status, ok };
    }
    const ok = expect.includes(res.status);
    const row = { base, path, status: res.status, expect, location: loc, label, ok };
    if (ok) {
      passed++;
      console.log(`✓ ${base}${path} → ${res.status}${loc ? ` → ${loc}` : ''}`);
    } else {
      failed++;
      console.error(`✗ ${base}${path} → ${res.status} (expected ${expect.join('|')}) [${label}]`);
    }
    return row;
  } catch (err) {
    failed++;
    console.error(`✗ ${base}${path} → ERROR: ${err.message}`);
    return { base, path, error: err.message, ok: false };
  }
}

console.log('\n=== Auth Security Smoke ===\n');

for (const base of BASES) {
  console.log(`--- ${base} ---`);
  for (const r of [...ROUTES, ...API_ROUTES]) {
    await probe(base, r);
  }
  console.log('');
}

console.log(`=== SUMMARY: ${passed}/${passed + failed} passed ===`);
if (failed > 0) process.exit(1);
