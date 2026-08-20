/**
 * Deactivate leftover E2E/QA promo pollution (codes/names matching known prefixes).
 * Does not delete rows — only isActive=false for safety.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/promo-qa-deactivate-e2e-leftovers.mjs
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const CODE_RE = /^(E2E|VPLAT|QAPREV|QAPOK|RACE|BND|DYN|VAUD|VA\d)/i;
const NAME_RE = /^(E2E |QA |DYN)/i;

class Session {
  constructor() {
    this.cookies = new Map();
  }
  absorb(res) {
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      const nv = line.split(';')[0];
      const i = nv.indexOf('=');
      if (i > 0) this.cookies.set(nv.slice(0, i), nv.slice(i + 1));
    }
  }
  hdr() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async fetch(path, opts = {}) {
    const headers = new Headers(opts.headers || {});
    const ch = this.hdr();
    if (ch) headers.set('Cookie', ch);
    if (opts.json !== undefined) headers.set('Content-Type', 'application/json');
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
      redirect: 'manual',
    });
    this.absorb(res);
    return res;
  }
  async login(email, password) {
    const csrfRes = await this.fetch('/api/auth/csrf');
    this.absorb(csrfRes);
    const csrf = await csrfRes.json();
    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken,
      callbackUrl: '/',
      json: 'true',
      email,
      password,
    });
    const res = await this.fetch('/api/auth/callback/credentials?', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    this.absorb(res);
    let loc = res.headers.get('location');
    if (loc) {
      try {
        const u = new URL(loc, BASE);
        const b = new URL(BASE);
        u.host = b.host;
        u.protocol = b.protocol;
        loc = u.pathname + u.search;
      } catch {
        /* */
      }
      await this.fetch(loc.startsWith('http') ? new URL(loc).pathname : loc);
    }
  }
  async json(path, opts = {}) {
    const res = await this.fetch(path, opts);
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
  }
}

async function main() {
  const admin = new Session();
  await admin.login('admin@horeca1.com', 'admin123');
  let couponOff = 0;
  let cashOff = 0;

  const coupons = await admin.json('/api/v1/admin/promotions/coupons');
  const list = coupons.data?.data || coupons.data?.items || coupons.data || [];
  const arr = Array.isArray(list) ? list : [];
  for (const c of arr) {
    if (!c?.isActive) continue;
    if (!CODE_RE.test(c.code || '') && !NAME_RE.test(c.name || '')) continue;
    const r = await admin.json(`/api/v1/admin/promotions/coupons/${c.id}`, {
      method: 'PATCH',
      json: { isActive: false },
    });
    if (r.status < 300) {
      couponOff++;
      console.log(`coupon off ${c.code}`);
    }
  }

  const cash = await admin.json('/api/v1/admin/promotions/cashback');
  const clist = cash.data?.data || cash.data?.items || cash.data || [];
  const carr = Array.isArray(clist) ? clist : [];
  for (const c of carr) {
    if (!c?.isActive) continue;
    if (!NAME_RE.test(c.name || '')) continue;
    const r = await admin.json(`/api/v1/admin/promotions/cashback/${c.id}`, {
      method: 'PATCH',
      json: { isActive: false },
    });
    if (r.status < 300) {
      cashOff++;
      console.log(`cashback off ${c.name}`);
    }
  }

  console.log(`Done. coupons=${couponOff} cashback=${cashOff}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
