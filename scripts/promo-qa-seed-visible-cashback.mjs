/**
 * Temporary active cashback for headed UI verify of "Up to" badges.
 * Usage: node scripts/promo-qa-seed-visible-cashback.mjs
 * Cleanup: node scripts/promo-qa-seed-visible-cashback.mjs --deactivate
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const NAME = 'QA VISIBLE UpTo Cashback';

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
    const loc = res.headers.get('location');
    if (loc) {
      const u = new URL(loc, BASE);
      await this.fetch(u.pathname + u.search);
    }
    return (await (await this.fetch('/api/auth/session')).json())?.user ?? null;
  }
  async json(path, opts = {}) {
    const res = await this.fetch(path, opts);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { _raw: text.slice(0, 200) };
    }
    return { status: res.status, data };
  }
}

async function main() {
  const admin = new Session();
  await admin.login('admin@horeca1.com', 'admin123');
  const list = await admin.json('/api/v1/admin/promotions/cashback');
  const rows = list.data?.data || list.data || [];
  const existing = (Array.isArray(rows) ? rows : []).filter((c) => String(c.name || '').includes('QA VISIBLE'));
  if (process.argv.includes('--deactivate')) {
    for (const c of existing) {
      await admin.json(`/api/v1/admin/promotions/cashback/${c.id}`, {
        method: 'PATCH',
        json: { isActive: false },
      });
      console.log('deactivated', c.id, c.name);
    }
    return;
  }
  if (existing.some((c) => c.isActive)) {
    console.log('already active', existing.find((c) => c.isActive).id);
    return;
  }
  const created = await admin.json('/api/v1/admin/promotions/cashback', {
    method: 'POST',
    json: {
      name: NAME,
      cashbackType: 'flat',
      cashbackValue: 250,
      destination: 'upi',
      isActive: true,
    },
  });
  console.log(JSON.stringify(created, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
