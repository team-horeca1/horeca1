/**
 * Promotions exploratory API QA (no product mutations beyond safe create/cleanup).
 * Used when Playwright MCP is unavailable — does not replace headed browser QA.
 *
 * Usage: node --experimental-strip-types scripts/promo-qa-api-explore.mjs
 *   or:  npx tsx scripts/promo-qa-api-explore.mjs
 */
import { writeFileSync } from 'node:fs';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3020';

/** @typedef {{ name: string, status: 'PASS'|'FAIL'|'BLOCKED'|'N/A', detail: string }} Finding */

/** @type {Finding[]} */
const findings = [];
/** @type {object[]} */
const bugs = [];

function record(name, status, detail) {
  findings.push({ name, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '·';
  console.log(`${icon} [${status}] ${name}: ${detail}`);
}

function bug(partial) {
  bugs.push(partial);
  console.log(`BUG ${partial.id}: ${partial.title} (${partial.severity})`);
}

class Session {
  /** @param {string} label */
  constructor(label) {
    this.label = label;
    /** @type {Map<string, string>} */
    this.cookies = new Map();
  }

  /** @param {Response} res */
  absorbCookies(res) {
    const raw = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [];
    for (const line of raw) {
      const nv = line.split(';')[0];
      const i = nv.indexOf('=');
      if (i > 0) this.cookies.set(nv.slice(0, i), nv.slice(i + 1));
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /**
   * @param {string} path
   * @param {RequestInit & { json?: unknown }} [opts]
   */
  async fetch(path, opts = {}) {
    const headers = new Headers(opts.headers || {});
    const ch = this.cookieHeader();
    if (ch) headers.set('Cookie', ch);
    if (opts.json !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
      redirect: 'manual',
    });
    this.absorbCookies(res);
    return res;
  }

  async login(email, password) {
    const csrfRes = await this.fetch('/api/auth/csrf');
    this.absorbCookies(csrfRes);
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
    this.absorbCookies(res);
    // Follow Location but rewrite AUTH_URL host (often :3000) onto this BASE.
    let loc = res.headers.get('location');
    if (loc) {
      try {
        const u = new URL(loc, BASE);
        const base = new URL(BASE);
        u.protocol = base.protocol;
        u.host = base.host;
        loc = u.pathname + u.search;
      } catch {
        /* keep relative */
      }
      const r2 = await this.fetch(loc.startsWith('http') ? new URL(loc).pathname : loc);
      this.absorbCookies(r2);
    }
    const session = await (await this.fetch('/api/auth/session')).json();
    return session?.user ?? null;
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
    return { status: res.status, data, headers: res.headers };
  }
}

async function main() {
  console.log(`BASE=${BASE}`);

  // --- Route smoke (unauthenticated) ---
  for (const path of ['/', '/deals', '/rewards', '/wallet', '/login', '/admin/promotions', '/vendor/promotions']) {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    record(
      `GET ${path}`,
      res.status < 500 ? 'PASS' : 'FAIL',
      `HTTP ${res.status}`,
    );
  }

  const customer = new Session('customer');
  const admin = new Session('admin');
  const vendor = new Session('vendor');
  const vendorB = new Session('vendorB');
  const brand = new Session('brand');

  const cu = await customer.login('chef@tajpalace.com', 'customer123');
  record('Login customer', cu?.email ? 'PASS' : 'FAIL', JSON.stringify(cu?.email || cu));
  const au = await admin.login('admin@horeca1.com', 'admin123');
  record('Login admin', au?.email ? 'PASS' : 'FAIL', JSON.stringify(au?.email || au));
  const vu = await vendor.login('fresh@dailyfreshfoods.com', 'vendor123');
  record('Login vendor A', vu?.email ? 'PASS' : 'FAIL', JSON.stringify(vu?.email || vu));
  const vb = await vendorB.login('owner@spicetrail.in', 'vendor123');
  record('Login vendor B', vb?.email ? 'PASS' : 'FAIL', JSON.stringify(vb?.email || vb));
  const bu = await brand.login('brand@kitchensmith.com', 'brand123');
  record('Login brand', bu?.email ? 'PASS' : 'FAIL', JSON.stringify(bu?.email || bu));

  // --- RBAC: customer cannot mint admin coupons ---
  {
    const r = await customer.json('/api/v1/admin/promotions/coupons', {
      method: 'POST',
      json: {
        code: `QAEVIL${Date.now()}`,
        type: 'flat',
        value: 99999,
        isActive: true,
      },
    });
    const ok = r.status === 401 || r.status === 403;
    record('Customer mint admin coupon denied', ok ? 'PASS' : 'FAIL', `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 180)}`);
    if (!ok) {
      bug({
        id: 'BUG-001',
        severity: 'P0',
        area: 'RBAC',
        title: 'Customer can POST admin coupons',
        status: 'CONFIRMED',
        detail: r,
      });
    }
  }

  // --- RBAC: brand cannot access vendor promotions ---
  {
    const r = await brand.json('/api/v1/vendor/coupons');
    const ok = r.status === 401 || r.status === 403;
    record('Brand list vendor coupons denied', ok ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  }

  // --- RBAC: customer cannot access admin promotions page API ---
  {
    const r = await customer.json('/api/v1/admin/promotions/coupons');
    const ok = r.status === 401 || r.status === 403;
    record('Customer GET admin coupons denied', ok ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  }

  // --- Vendor cannot create platform-wide coupon ---
  {
    const r = await vendor.json('/api/v1/vendor/coupons', {
      method: 'POST',
      json: {
        code: `VPLAT${Date.now()}`,
        name: 'QA vendor platform attempt',
        discountType: 'percentage',
        discountValue: 10,
        isActive: true,
        vendorId: null,
      },
    });
    const body = r.data?.data || r.data;
    if (r.status >= 200 && r.status < 300) {
      record(
        'Vendor coupon create scoped',
        body?.vendorId ? 'PASS' : 'FAIL',
        `HTTP ${r.status} vendorId=${body?.vendorId}`,
      );
      if (!body?.vendorId) {
        bug({
          id: 'BUG-002',
          severity: 'P1',
          area: 'RBAC',
          title: 'Vendor created platform-scoped coupon',
          status: 'CONFIRMED',
          detail: body,
        });
      }
    } else {
      record('Vendor platform coupon rejected', 'PASS', `HTTP ${r.status}`);
    }
  }

  // --- Vendor audience strip ---
  {
    const code = `VAUD${Date.now()}`;
    const r = await vendor.json('/api/v1/vendor/coupons', {
      method: 'POST',
      json: {
        code,
        name: 'QA audience strip',
        discountType: 'flat',
        discountValue: 10,
        isActive: false,
        audienceUserIds: ['00000000-0000-0000-0000-000000000001'],
      },
    });
    const body = r.data?.data || r.data;
    const audience = body?.audienceUserIds;
    const leaked = Array.isArray(audience) && audience.length > 0;
    record(
      'Vendor audienceUserIds stripped',
      r.status >= 400 || !leaked ? 'PASS' : 'FAIL',
      `HTTP ${r.status} audience=${JSON.stringify(audience)?.slice(0, 80)}`,
    );
    if (leaked) {
      bug({
        id: 'BUG-003',
        severity: 'P1',
        area: 'RBAC',
        title: 'Vendor can persist audienceUserIds',
        status: 'CONFIRMED',
        detail: body,
      });
    }
  }

  // --- Admin list coupons / cashback ---
  {
    const coupons = await admin.json('/api/v1/admin/promotions/coupons');
    record('Admin list coupons', coupons.status === 200 ? 'PASS' : 'FAIL', `HTTP ${coupons.status}`);
    const cashback = await admin.json('/api/v1/admin/promotions/cashback');
    record('Admin list cashback', cashback.status === 200 ? 'PASS' : 'FAIL', `HTTP ${cashback.status}`);
  }

  // --- Vendor B cannot edit Vendor A coupon ---
  {
    const listA = await vendor.json('/api/v1/vendor/coupons');
    const items = listA.data?.data || listA.data?.items || listA.data || [];
    const arr = Array.isArray(items) ? items : [];
    if (arr.length === 0) {
      // create one for A
      const created = await vendor.json('/api/v1/vendor/coupons', {
        method: 'POST',
        json: {
          code: `VA${Date.now()}`,
          name: 'QA IDOR bait',
          discountType: 'flat',
          discountValue: 5,
          isActive: false,
        },
      });
      arr.push(created.data?.data || created.data);
    }
    const target = arr[0];
    const id = target?.id;
    if (!id) {
      record('Vendor A→B IDOR edit', 'BLOCKED', 'No vendor A coupon id');
    } else {
      const r = await vendorB.json(`/api/v1/vendor/coupons/${id}`, {
        method: 'PATCH',
        json: { value: 1 },
      });
      const denied = r.status === 401 || r.status === 403 || r.status === 404;
      record('Vendor A→B IDOR coupon PATCH', denied ? 'PASS' : 'FAIL', `id=${id} HTTP ${r.status}`);
      if (!denied) {
        bug({
          id: 'BUG-004',
          severity: 'P0',
          area: 'IDOR',
          title: 'Vendor B can PATCH Vendor A coupon',
          status: 'CONFIRMED',
          detail: { id, status: r.status, data: r.data },
        });
      }
    }
  }

  // --- Preview: invalid coupon ---
  {
    const r = await customer.json('/api/v1/promotions/preview', {
      method: 'POST',
      json: {
        code: 'THIS_COUPON_DOES_NOT_EXIST_XYZ',
        items: [],
      },
    });
    record(
      'Preview invalid coupon',
      r.status < 500 ? 'PASS' : 'FAIL',
      `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`,
    );
  }

  // --- Preview: client-injected discount amount must not be trusted ---
  {
    // Resolve a real product for a valid preview body
    const vendorsRes = await customer.json('/api/v1/vendors?limit=5');
    const vendors =
      vendorsRes.data?.data?.vendors ||
      vendorsRes.data?.vendors ||
      [];
    let productId;
    let vendorId;
    for (const v of vendors) {
      const prods = await customer.json(`/api/v1/vendors/${v.id}/products?limit=2`);
      const list =
        prods.data?.data?.products ||
        prods.data?.products ||
        (Array.isArray(prods.data?.data) ? prods.data.data : null) ||
        [];
      const arr = Array.isArray(list) ? list : [];
      if (arr[0]?.id) {
        productId = arr[0].id;
        vendorId = arr[0].vendorId || v.id;
        break;
      }
    }
    if (!productId || !vendorId) {
      record('Preview rejects client discountAmount', 'BLOCKED', `No catalog product`);
    } else {
      const r = await customer.json('/api/v1/promotions/preview', {
        method: 'POST',
        json: {
          code: 'ANY',
          discountAmount: 999999,
          items: [{ productId, vendorId, quantity: 1 }],
        },
      });
      const applied = r.data?.data?.coupon?.discount ?? r.data?.data?.totalPromoDiscount;
      const fail = typeof applied === 'number' && applied >= 999999;
      record(
        'Preview rejects client discountAmount',
        fail ? 'FAIL' : 'PASS',
        `HTTP ${r.status} applied=${applied} ${JSON.stringify(r.data)?.slice(0, 200)}`,
      );
      if (fail) {
        bug({
          id: 'BUG-005',
          severity: 'P0',
          area: 'Financial',
          title: 'Preview trusts client discountAmount',
          status: 'CONFIRMED',
          detail: r.data,
        });
      }

      // MOV / valid coupon path using admin-created coupon
      const code = `QAPREV${Date.now()}`;
      const created = await admin.json('/api/v1/admin/promotions/coupons', {
        method: 'POST',
        json: {
          code,
          name: 'QA preview MOV',
          discountType: 'flat',
          discountValue: 50,
          minOrderValue: 50000,
          isActive: true,
        },
      });
      record('Admin create MOV coupon', created.status === 201 || created.status === 200 ? 'PASS' : 'FAIL', `HTTP ${created.status}`);
      const below = await customer.json('/api/v1/promotions/preview', {
        method: 'POST',
        json: {
          code,
          items: [{ productId, vendorId, quantity: 1 }],
        },
      });
      const couponBelow = below.data?.data?.coupon;
      const belowRejected = couponBelow && couponBelow.valid === false;
      record(
        'Coupon MOV below threshold',
        belowRejected ? 'PASS' : 'FAIL',
        `HTTP ${below.status} coupon=${JSON.stringify(couponBelow)?.slice(0, 160)}`,
      );
      if (!belowRejected) {
        bug({
          id: 'BUG-012',
          severity: 'P1',
          area: 'Coupon',
          title: 'Coupon applies below minOrderValue',
          status: 'CONFIRMED',
          detail: { code, minOrderValue: 50000, below: below.data },
        });
      }

      // Recreate with low MOV for positive path
      if (created.data?.data?.id || created.data?.id) {
        await admin.json(`/api/v1/admin/promotions/coupons/${created.data?.data?.id || created.data?.id}`, {
          method: 'DELETE',
        }).catch(() => null);
      }
      const code2 = `QAPOK${Date.now()}`;
      const created2 = await admin.json('/api/v1/admin/promotions/coupons', {
        method: 'POST',
        json: {
          code: code2,
          name: 'QA preview MOV ok',
          discountType: 'flat',
          discountValue: 50,
          minOrderValue: 100,
          isActive: true,
        },
      });
      const above = await customer.json('/api/v1/promotions/preview', {
        method: 'POST',
        json: {
          code: code2,
          items: [{ productId, vendorId, quantity: 1 }],
        },
      });
      const couponAbove = above.data?.data?.coupon;
      const appliedAbove = couponAbove && couponAbove.valid === true && Number(couponAbove.estimatedDiscount || 0) > 0;
      record(
        'Coupon MOV above threshold preview',
        appliedAbove ? 'PASS' : 'FAIL',
        `HTTP ${above.status} coupon=${JSON.stringify(couponAbove)?.slice(0, 180)}`,
      );
      if (!appliedAbove) {
        bug({
          id: 'BUG-011',
          severity: 'P2',
          area: 'Coupon',
          title: 'Valid MOV-qualified coupon returns null in preview',
          status: 'CONFIRMED',
          detail: { code: code2, productId, vendorId, above: above.data, created: created2.data },
        });
      }

      const cid = created2.data?.data?.id || created2.data?.id;
      if (cid) await admin.json(`/api/v1/admin/promotions/coupons/${cid}`, { method: 'DELETE' });
    }
  }

  // --- Cashback UPI coerce on admin create ---
  {
    const r = await admin.json('/api/v1/admin/promotions/cashback', {
      method: 'POST',
      json: {
        name: `QA UPI coerce ${Date.now()}`,
        cashbackType: 'flat',
        cashbackValue: 11,
        destination: 'upi',
        isActive: false,
      },
    });
    const body = r.data?.data || r.data;
    const dest = body?.destination;
    if (r.status >= 200 && r.status < 300) {
      record(
        'Admin cashback upi→wallet coerce',
        dest === 'wallet' ? 'PASS' : 'FAIL',
        `HTTP ${r.status} destination=${dest}`,
      );
      if (dest === 'upi') {
        bug({
          id: 'BUG-006',
          severity: 'P1',
          area: 'Financial',
          title: 'Admin cashback accepts destination=upi',
          status: 'CONFIRMED',
          detail: body,
        });
      }
      const id = body?.id;
      if (id) await admin.json(`/api/v1/admin/promotions/cashback/${id}`, { method: 'DELETE' }).catch(() => null);
    } else {
      record('Admin cashback upi coerce', 'FAIL', `HTTP ${r.status} ${JSON.stringify(body)?.slice(0, 160)}`);
    }
  }

  // --- Payout invite CSRF ---
  {
    const created = await admin.json('/api/v1/admin/promotions/payout-invites', {
      method: 'POST',
      json: { amount: 50, notes: 'qa csrf', expiresInDays: 1 },
    });
    const token = created.data?.data?.token || created.data?.token;
    if (!token) {
      record('Payout CSRF origin reject', 'BLOCKED', `Could not create invite HTTP ${created.status}`);
    } else {
      const evil = await fetch(`${BASE}/api/v1/promotions/payout/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
          Cookie: admin.cookieHeader(),
        },
        body: JSON.stringify({ name: 'Eve', upiId: 'eve@upi', amount: 99999 }),
      });
      record('Payout CSRF origin reject', evil.status === 403 ? 'PASS' : 'FAIL', `HTTP ${evil.status}`);
      if (evil.status !== 403) {
        bug({
          id: 'BUG-010',
          severity: 'P0',
          area: 'Security',
          title: 'Payout claim allows evil Origin',
          status: 'CONFIRMED',
          detail: { status: evil.status, body: await evil.text() },
        });
      }
    }
  }

  // --- Vendor cashback list / create ---
  {
    const list = await vendor.json('/api/v1/vendor/cashback');
    record('Vendor list cashback', list.status === 200 ? 'PASS' : 'FAIL', `HTTP ${list.status}`);
    const r = await vendor.json('/api/v1/vendor/cashback', {
      method: 'POST',
      json: {
        name: `QA vendor CB ${Date.now()}`,
        cashbackType: 'percentage',
        cashbackValue: 5,
        maxCashback: 100,
        destination: 'upi',
        isActive: false,
      },
    });
    const body = r.data?.data || r.data;
    if (r.status >= 200 && r.status < 300) {
      record(
        'Vendor cashback upi→wallet',
        body?.destination === 'wallet' ? 'PASS' : 'FAIL',
        `destination=${body?.destination}`,
      );
      if (body?.id) await vendor.json(`/api/v1/vendor/cashback/${body.id}`, { method: 'DELETE' }).catch(() => null);
    } else {
      record('Vendor cashback create', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
    }
  }

  // --- Programs endpoints (admin) ---
  for (const prog of ['welcome', 'first-order', 'referral']) {
    const r = await admin.json(`/api/v1/admin/promotions/programs/${prog}`);
    record(`Admin program ${prog} GET`, r.status === 200 || r.status === 404 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  }

  // --- Customer cannot claim arbitrary reward id ---
  {
    const r = await customer.json('/api/v1/promotions/rewards/00000000-0000-0000-0000-000000000099/claim', {
      method: 'POST',
      json: {},
    });
    record(
      'Customer claim foreign/missing reward',
      r.status === 404 || r.status === 403 || r.status === 400 ? 'PASS' : 'FAIL',
      `HTTP ${r.status}`,
    );
  }

  // --- Offers list ---
  {
    const r = await customer.json('/api/v1/promotions/offers');
    record('Customer offers list', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  }

  // --- Rewards ---
  {
    const r = await customer.json('/api/v1/promotions/rewards');
    record('Customer rewards', r.status === 200 || r.status === 404 ? 'PASS' : 'FAIL', `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 120)}`);
  }

  // --- Double-submit coupon create race (admin) ---
  {
    const code = `RACE${Date.now()}`;
    const payload = {
      code,
      name: 'QA race',
      discountType: 'flat',
      discountValue: 1,
      isActive: false,
      usageLimit: 1,
    };
    const [a, b] = await Promise.all([
      admin.json('/api/v1/admin/promotions/coupons', { method: 'POST', json: payload }),
      admin.json('/api/v1/admin/promotions/coupons', { method: 'POST', json: payload }),
    ]);
    const bothOk = a.status < 300 && b.status < 300;
    record(
      'Duplicate coupon code race',
      bothOk ? 'FAIL' : 'PASS',
      `statuses=${a.status}/${b.status}`,
    );
    if (bothOk) {
      bug({
        id: 'BUG-007',
        severity: 'P2',
        area: 'Race',
        title: 'Duplicate coupon code accepted twice under race',
        status: 'CONFIRMED',
        detail: { a: a.data, b: b.data },
      });
    }
    for (const r of [a, b]) {
      const id = r.data?.data?.id || r.data?.id;
      if (id) await admin.json(`/api/v1/admin/promotions/coupons/${id}`, { method: 'DELETE' }).catch(() => null);
    }
  }

  // --- Negative / boundary coupon values ---
  for (const [label, discountType, discountValue] of [
    ['negative value', 'flat', -10],
    ['zero value', 'flat', 0],
    ['huge percent', 'percentage', 500],
  ]) {
    const r = await admin.json('/api/v1/admin/promotions/coupons', {
      method: 'POST',
      json: {
        code: `BND${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        name: `QA ${label}`,
        discountType,
        discountValue,
        isActive: false,
      },
    });
    const accepted = r.status >= 200 && r.status < 300;
    if (label === 'negative value' && accepted) {
      record(`Boundary coupon ${label}`, 'FAIL', `HTTP ${r.status}`);
      bug({
        id: 'BUG-008',
        severity: 'P1',
        area: 'Financial',
        title: 'Admin coupon accepts negative value',
        status: 'CONFIRMED',
        detail: r.data,
      });
    } else if (label === 'huge percent' && accepted) {
      record(`Boundary coupon ${label}`, 'FAIL', `HTTP ${r.status} — 500% accepted`);
      bug({
        id: 'BUG-009',
        severity: 'P2',
        area: 'Financial',
        title: 'Admin percent coupon accepts value > 100',
        status: 'CONFIRMED',
        detail: r.data,
      });
    } else {
      record(`Boundary coupon ${label}`, accepted ? 'FAIL' : 'PASS', `HTTP ${r.status}`);
    }
  }

  // N/A deferred
  record('Brand portal promo create', 'N/A', 'Deferred — no brand promo routes');
  record('Campaign UPI destination UI', 'N/A', 'Coerced to wallet by design');
  record('Partial-return line clawback', 'N/A', 'Full clawback on returned only');
  record('Headed Playwright MCP UI exploration', 'BLOCKED', 'MCP server not connected');

  const out = {
    base: BASE,
    at: new Date().toISOString(),
    findings,
    bugs,
    summary: {
      pass: findings.filter((f) => f.status === 'PASS').length,
      fail: findings.filter((f) => f.status === 'FAIL').length,
      blocked: findings.filter((f) => f.status === 'BLOCKED').length,
      na: findings.filter((f) => f.status === 'N/A').length,
      bugs: bugs.length,
    },
  };
  writeFileSync('docs/perf/promo-qa-api-explore.json', JSON.stringify(out, null, 2));
  console.log('\nSummary', out.summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
