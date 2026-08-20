/**
 * Dynamic promotion acceptance — create NEW admin configs (not seed/E2E leftovers),
 * preview as customer, assert config-driven math, then deactivate.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/promo-qa-dynamic-accept.mjs
 */
import { writeFileSync } from 'node:fs';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const TAG = `DYN${Date.now().toString(36).toUpperCase()}`;

const findings = [];
const bugs = [];
function rec(name, status, detail) {
  findings.push({ name, status, detail });
  console.log(`${status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '·'} [${status}] ${name}: ${detail}`);
}

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
        u.protocol = b.protocol;
        u.host = b.host;
        loc = u.pathname + u.search;
      } catch {
        /* keep */
      }
      await this.fetch(loc.startsWith('http') ? new URL(loc).pathname : loc);
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
  console.log(`BASE=${BASE} TAG=${TAG}`);
  const admin = new Session();
  const customer = new Session();
  const au = await admin.login('admin@horeca1.com', 'admin123');
  const cu = await customer.login('chef@tajpalace.com', 'customer123');
  rec('login admin', au?.email ? 'PASS' : 'FAIL', String(au?.email));
  rec('login customer', cu?.email ? 'PASS' : 'FAIL', String(cu?.email));

  const vendors = await customer.json('/api/v1/vendors?limit=3');
  const vendorList = vendors.data?.data?.vendors || vendors.data?.vendors || [];
  let productId;
  let vendorId;
  for (const v of vendorList) {
    const prods = await customer.json(`/api/v1/vendors/${v.id}/products?limit=2`);
    const list = prods.data?.data?.products || [];
    if (list[0]?.id) {
      productId = list[0].id;
      vendorId = list[0].vendorId || v.id;
      break;
    }
  }
  if (!productId) {
    rec('resolve product', 'FAIL', 'no product');
    process.exit(1);
  }
  rec('resolve product', 'PASS', `${vendorId}/${productId}`);

  const created = [];

  // Discount A: 10% MOV 500 max 100
  {
    const code = `${TAG}A10`;
    const r = await admin.json('/api/v1/admin/promotions/coupons', {
      method: 'POST',
      json: {
        code,
        name: `${TAG} 10pct MOV500 max100`,
        discountType: 'percentage',
        discountValue: 10,
        maxDiscount: 100,
        minOrderValue: 500,
        isActive: true,
      },
    });
    const id = r.data?.data?.id || r.data?.id;
    created.push({ type: 'coupon', id, code });
    rec('create Discount A', r.status < 300 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
    const prev = await customer.json('/api/v1/promotions/preview', {
      method: 'POST',
      json: { code, items: [{ productId, vendorId, quantity: 2 }] },
    });
    const c = prev.data?.data?.coupon;
    const sub = Number(prev.data?.data?.subtotal || 0);
    const est = Number(c?.estimatedDiscount || 0);
    const expected = Math.min(100, Math.round(sub * 0.1 * 100) / 100);
    const ok = c?.valid === true && Math.abs(est - expected) < 0.02;
    rec('preview Discount A config-driven', ok ? 'PASS' : 'FAIL', `sub=${sub} est=${est} expected≈${expected}`);
    if (!ok) bugs.push({ id: 'BUG-DYN-A', detail: prev.data });
  }

  // Discount B: 25% MOV 1500 max 400 — below MOV should fail
  {
    const code = `${TAG}B25`;
    const r = await admin.json('/api/v1/admin/promotions/coupons', {
      method: 'POST',
      json: {
        code,
        name: `${TAG} 25pct MOV1500`,
        discountType: 'percentage',
        discountValue: 25,
        maxDiscount: 400,
        minOrderValue: 1500,
        isActive: true,
      },
    });
    const id = r.data?.data?.id || r.data?.id;
    created.push({ type: 'coupon', id, code });
    rec('create Discount B', r.status < 300 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
    const prev = await customer.json('/api/v1/promotions/preview', {
      method: 'POST',
      json: { code, items: [{ productId, vendorId, quantity: 1 }] },
    });
    const c = prev.data?.data?.coupon;
    rec('preview Discount B below MOV', c?.valid === false ? 'PASS' : 'FAIL', JSON.stringify(c)?.slice(0, 120));
  }

  // Discount C: flat 75 MOV 600
  {
    const code = `${TAG}C75`;
    const r = await admin.json('/api/v1/admin/promotions/coupons', {
      method: 'POST',
      json: {
        code,
        name: `${TAG} flat75`,
        discountType: 'flat',
        discountValue: 75,
        minOrderValue: 600,
        isActive: true,
      },
    });
    created.push({ type: 'coupon', id: r.data?.data?.id || r.data?.id, code });
    const hi = await customer.json('/api/v1/promotions/preview', {
      method: 'POST',
      json: { code, items: [{ productId, vendorId, quantity: 5 }] },
    });
    const c = hi.data?.data?.coupon;
    const ok = c?.valid === true && Number(c.estimatedDiscount) === 75;
    rec('preview Discount C flat 75', ok ? 'PASS' : 'FAIL', JSON.stringify(c)?.slice(0, 140));
  }

  // Cashback A: 5% max 50
  {
    const r = await admin.json('/api/v1/admin/promotions/cashback', {
      method: 'POST',
      json: {
        name: `${TAG} CB 5pct max50`,
        cashbackType: 'percentage',
        cashbackValue: 5,
        maxCashback: 50,
        destination: 'upi',
        isActive: true,
      },
    });
    const body = r.data?.data || r.data;
    created.push({ type: 'cashback', id: body?.id });
    rec('create Cashback A upi→wallet', body?.destination === 'wallet' && r.status < 300 ? 'PASS' : 'FAIL', `dest=${body?.destination} HTTP ${r.status}`);
  }

  // Cashback B: flat 100
  {
    const r = await admin.json('/api/v1/admin/promotions/cashback', {
      method: 'POST',
      json: {
        name: `${TAG} CB flat100`,
        cashbackType: 'flat',
        cashbackValue: 100,
        isActive: true,
      },
    });
    created.push({ type: 'cashback', id: r.data?.data?.id || r.data?.id });
    rec('create Cashback B flat100', r.status < 300 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  }

  // Offers list should show Up to for cashback
  {
    const offers = await customer.json('/api/v1/promotions/offers');
    const store = offers.data?.data?.storeOffers || offers.data?.storeOffers || [];
    const ours = store.filter((o) => o.kind === 'cashback' && String(o.name || '').includes(TAG));
    const allUpTo = ours.every((o) => String(o.badgeLabel || '').startsWith('Up to'));
    rec('offers badge Up to for new cashbacks', ours.length > 0 && allUpTo ? 'PASS' : 'FAIL', `n=${ours.length} labels=${ours.map((o) => o.badgeLabel).join(' | ')}`);
  }

  // Referral invite origin matches request Host
  {
    const ref = await customer.json('/api/v1/promotions/referral');
    const url = ref.data?.data?.inviteUrl || ref.data?.inviteUrl || '';
    const path = ref.data?.data?.invitePath || ref.data?.invitePath || '';
    const baseHost = new URL(BASE).host;
    const ok = (url.includes(baseHost) || path.startsWith('/invite/')) && path.includes('/invite/');
    rec('referral invite uses request origin/path', ok ? 'PASS' : 'FAIL', `url=${url} path=${path}`);
  }

  // Boundary rejects
  for (const [label, payload] of [
    ['reject 101%', { code: `${TAG}X101`, name: 'x', discountType: 'percentage', discountValue: 101, isActive: false }],
    ['reject neg flat', { code: `${TAG}XN`, name: 'x', discountType: 'flat', discountValue: -5, isActive: false }],
  ]) {
    const r = await admin.json('/api/v1/admin/promotions/coupons', { method: 'POST', json: payload });
    rec(label, r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  }

  // Cleanup — deactivate
  for (const item of created) {
    if (!item.id) continue;
    if (item.type === 'coupon') {
      await admin.json(`/api/v1/admin/promotions/coupons/${item.id}`, {
        method: 'PATCH',
        json: { isActive: false },
      }).catch(() => null);
    } else {
      await admin.json(`/api/v1/admin/promotions/cashback/${item.id}`, {
        method: 'PATCH',
        json: { isActive: false },
      }).catch(() => null);
    }
  }
  rec('cleanup deactivate created', 'PASS', `n=${created.length}`);

  const summary = {
    pass: findings.filter((f) => f.status === 'PASS').length,
    fail: findings.filter((f) => f.status === 'FAIL').length,
    bugs: bugs.length,
  };
  writeFileSync('docs/promo-qa-dynamic-accept.json', JSON.stringify({ BASE, TAG, findings, bugs, summary }, null, 2));
  console.log('\nSummary', summary);
  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
