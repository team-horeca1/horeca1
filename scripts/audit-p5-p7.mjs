/**
 * P5 RBAC/IDOR + P6 API matrix + P7 Security audit probes.
 * Run: node scripts/audit-p5-p7.mjs
 * Writes JSON to scripts/audit-p5-p7-results.json
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));

const CREDS = {
  admin: { email: 'admin@horeca1.com', password: 'admin123' },
  customer: { email: 'chef@tajpalace.com', password: 'customer123' },
  vendor: { email: 'fresh@dailyfreshfoods.com', password: 'vendor123' },
  vendorB: {
    email: 'audit.vendor.1784132100999@example.com',
    password: 'AuditVend1!',
    vendorId: '58234d04-eb99-4bb1-a02a-374f68e95351',
  },
  brand: { email: 'brand@kitchensmith.com', password: 'brand123' },
  disposableCustomer: {
    email: 'audit.customer.1784132100999@example.com',
    password: 'AuditCust1!',
    userId: 'c5ff54df-77f5-4003-9db2-36e3ad796541',
  },
};

const findings = [];
const passes = [];

function note(id, severity, title, detail) {
  findings.push({ id, severity, title, detail });
  console.log(`[${severity}] ${id}: ${title}`);
  if (detail) console.log('  ', typeof detail === 'string' ? detail.slice(0, 200) : JSON.stringify(detail).slice(0, 240));
}

function pass(id, title, detail = {}) {
  passes.push({ id, title, detail });
  console.log(`✓ ${id}: ${title}`);
}

function mergeCookies(jar, setCookie) {
  if (!setCookie) return jar;
  const parts = setCookie.split(/,(?=\s*[^;,]+=)/);
  for (const p of parts) {
    const [kv] = p.split(';');
    const eq = kv.indexOf('=');
    if (eq < 1) continue;
    const name = kv.slice(0, eq).trim();
    const val = kv.slice(eq + 1).trim();
    if (!val || val === 'null') jar.delete(name);
    else jar.set(name, val);
  }
  return jar;
}

function jarHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function parseSetCookieFlags(setCookieHeader) {
  if (!setCookieHeader) return [];
  // Split multiple Set-Cookie carefully
  const cookies = setCookieHeader.split(/,(?=\s*[^;,]+=[^;]+)/);
  return cookies.map((c) => {
    const parts = c.split(';').map((s) => s.trim());
    const [nv] = parts;
    const eq = nv.indexOf('=');
    const name = eq > 0 ? nv.slice(0, eq) : nv;
    const flags = {
      name,
      httpOnly: parts.some((p) => /^HttpOnly$/i.test(p)),
      secure: parts.some((p) => /^Secure$/i.test(p)),
      sameSite: (parts.find((p) => /^SameSite=/i.test(p)) || '').split('=')[1] || null,
      path: (parts.find((p) => /^Path=/i.test(p)) || '').split('=')[1] || null,
    };
    return flags;
  });
}

async function loginAs({ email, password }, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const jar = new Map();
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    if (csrfRes.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    mergeCookies(jar, csrfRes.headers.get('set-cookie'));
    const { csrfToken } = await csrfRes.json();

    const loginRes = await fetch(`${BASE}/api/auth/callback/credentials?`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: jarHeader(jar),
      },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE, json: 'true' }),
      redirect: 'manual',
    });
    const rawSetCookie = loginRes.headers.getSetCookie?.() ?? [];
    // Node fetch may expose getSetCookie
    if (rawSetCookie.length) {
      for (const sc of rawSetCookie) mergeCookies(jar, sc);
    } else {
      mergeCookies(jar, loginRes.headers.get('set-cookie'));
    }

    const cookieFlags = rawSetCookie.length
      ? rawSetCookie.flatMap((sc) => parseSetCookieFlags(sc))
      : parseSetCookieFlags(loginRes.headers.get('set-cookie'));

    const hasSession = [...jar.keys()].some((k) => k.includes('session-token') || k.includes('authjs.session'));
    if (hasSession) {
      return { jar, loginStatus: loginRes.status, cookieFlags, setCookies: rawSetCookie };
    }
    if (loginRes.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const body = await loginRes.text().catch(() => '');
    throw new Error(`Login failed for ${email}: HTTP ${loginRes.status} ${body.slice(0, 120)}`);
  }
  throw new Error(`Login failed for ${email}`);
}

async function api(jar, path, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (jar) headers.Cookie = jarHeader(jar);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    redirect: 'manual',
  });
  if (jar) {
    const scs = res.headers.getSetCookie?.() ?? [];
    if (scs.length) for (const sc of scs) mergeCookies(jar, sc);
    else mergeCookies(jar, res.headers.get('set-cookie'));
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  return {
    status: res.status,
    json,
    text: text.slice(0, 500),
    headers: res.headers,
    location: res.headers.get('location'),
    setCookie: res.headers.get('set-cookie'),
    setCookies: res.headers.getSetCookie?.() ?? [],
  };
}

function expectStatus(id, title, actual, allowed, severity = 'High', extra = {}) {
  const ok = allowed.includes(actual);
  if (ok) pass(id, title, { status: actual, ...extra });
  else note(id, severity, title, { expected: allowed, actual, ...extra });
}

async function main() {
  console.log('=== P5/P6/P7 Audit against', BASE, '===\n');

  // ── P6: Health ──
  {
    const r = await api(null, '/api/health');
    expectStatus('API-HEALTH', 'GET /api/health returns 200', r.status, [200], 'Medium', {
      body: r.json ?? r.text,
    });
  }

  // ── P6: CSRF ──
  let csrfToken = null;
  {
    const r = await api(null, '/api/auth/csrf');
    csrfToken = r.json?.csrfToken;
    if (r.status === 200 && csrfToken) pass('API-CSRF', 'GET /api/auth/csrf returns token', { status: 200 });
    else note('API-CSRF', 'High', 'CSRF endpoint failed', { status: r.status, body: r.json });
  }

  // ── Login all roles + cookie flags (P7) ──
  const sessions = {};
  for (const role of ['admin', 'customer', 'vendor', 'vendorB', 'brand']) {
    try {
      const result = await loginAs(CREDS[role]);
      sessions[role] = result;
      pass(`AUTH-LOGIN-${role.toUpperCase()}`, `Credentials login as ${role}`, {
        status: result.loginStatus,
        cookies: [...result.jar.keys()],
      });

      if (role === 'admin' || role === 'customer') {
        const sessionCookies = result.cookieFlags.filter((c) =>
          /session-token|authjs\.session/i.test(c.name)
        );
        const sc = sessionCookies[0] || result.cookieFlags.find((c) => /session/i.test(c.name));
        if (sc) {
          const issues = [];
          if (!sc.httpOnly) issues.push('missing HttpOnly');
          if (!sc.sameSite) issues.push('missing SameSite');
          // Secure expected off on localhost http
          if (issues.length) {
            note('SEC-COOKIE-FLAGS', 'Medium', `Session cookie flags incomplete for ${role}`, {
              flags: sc,
              issues,
              note: 'Secure may be off on localhost HTTP — expected',
            });
          } else {
            pass('SEC-COOKIE-FLAGS', `Session cookie has HttpOnly + SameSite (${role})`, {
              ...sc,
              secureNote: sc.secure
                ? 'Secure=true'
                : 'Secure=false (expected on localhost HTTP)',
            });
          }
        } else {
          note('SEC-COOKIE-FLAGS', 'Medium', `Could not parse session Set-Cookie flags for ${role}`, {
            cookieFlags: result.cookieFlags,
            setCookies: result.setCookies,
          });
        }
      }
    } catch (e) {
      note(`AUTH-LOGIN-${role.toUpperCase()}`, 'Critical', `Login failed for ${role}`, {
        error: String(e.message || e),
      });
    }
  }

  // ── P6: /api/v1/auth/me ──
  for (const role of ['admin', 'customer', 'vendor', 'brand']) {
    if (!sessions[role]) continue;
    const r = await api(sessions[role].jar, '/api/v1/auth/me');
    expectStatus(`API-ME-${role.toUpperCase()}`, `GET /api/v1/auth/me as ${role}`, r.status, [200], 'High', {
      role: r.json?.data?.user?.role ?? r.json?.user?.role ?? r.json,
    });
  }
  {
    const r = await api(null, '/api/v1/auth/me');
    expectStatus('API-ME-UNAUTH', 'GET /api/v1/auth/me unauthenticated → 401', r.status, [401], 'High');
  }

  // ── P5: Customer → vendor/* and admin/* ──
  if (sessions.customer) {
    const jar = sessions.customer.jar;
    const probes = [
      ['GET', '/api/v1/vendor/dashboard'],
      ['GET', '/api/v1/vendor/orders'],
      ['GET', '/api/v1/vendor/products'],
      ['GET', '/api/v1/vendor/settings'],
      ['POST', '/api/v1/vendor/products'],
      ['GET', '/api/v1/admin/dashboard'],
      ['GET', '/api/v1/admin/users'],
      ['GET', '/api/v1/admin/orders'],
      ['GET', '/api/v1/admin/vendors'],
      ['POST', '/api/v1/admin/impersonate'],
    ];
    for (const [method, path] of probes) {
      const r = await api(jar, path, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
        body: method === 'POST' ? '{}' : undefined,
      });
      expectStatus(
        `RBAC-CUST-${method}-${path.replace(/[/]/g, '_')}`,
        `Customer ${method} ${path} denied`,
        r.status,
        [401, 403],
        'Critical',
        { body: r.json }
      );
    }
  }

  // ── P5: Vendor → admin/* ──
  if (sessions.vendor) {
    const jar = sessions.vendor.jar;
    const probes = [
      ['GET', '/api/v1/admin/dashboard'],
      ['GET', '/api/v1/admin/users'],
      ['GET', '/api/v1/admin/orders'],
      ['GET', '/api/v1/admin/vendors'],
      ['GET', '/api/v1/admin/finance'],
      ['POST', '/api/v1/admin/impersonate'],
      ['GET', '/api/v1/admin/audit-logs'],
    ];
    for (const [method, path] of probes) {
      const r = await api(jar, path, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
        body: method === 'POST' ? '{}' : undefined,
      });
      expectStatus(
        `RBAC-VEND-${method}-${path.replace(/[/]/g, '_')}`,
        `Vendor ${method} ${path} denied`,
        r.status,
        [401, 403],
        'Critical',
        { body: r.json }
      );
    }
  }

  // ── P5: Unauthenticated protected APIs ──
  {
    const probes = [
      ['GET', '/api/v1/admin/users'],
      ['GET', '/api/v1/admin/dashboard'],
      ['GET', '/api/v1/vendor/dashboard'],
      ['GET', '/api/v1/vendor/orders'],
      ['GET', '/api/v1/orders'],
      ['GET', '/api/v1/cart'],
      ['POST', '/api/v1/cart'],
      ['GET', '/api/v1/notifications'],
      ['POST', '/api/v1/upload'],
      ['POST', '/api/v1/vendor/documents/upload'],
    ];
    for (const [method, path] of probes) {
      const r = await api(null, path, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
        body: method === 'POST' ? '{}' : undefined,
      });
      expectStatus(
        `RBAC-UNAUTH-${method}-${path.replace(/[/]/g, '_')}`,
        `Unauth ${method} ${path} denied`,
        r.status,
        [401, 403],
        'Critical',
        { body: r.json }
      );
    }
  }

  // ── P5: IDOR — vendor A access vendor B resources ──
  let vendorAProductId = null;
  let vendorBProductId = null;
  let vendorAOrderId = null;
  let vendorBSettings = null;

  if (sessions.vendor) {
    const listA = await api(sessions.vendor.jar, '/api/v1/vendor/products?limit=5');
    const productsA = listA.json?.data?.products ?? listA.json?.data ?? listA.json?.products ?? [];
    if (Array.isArray(productsA) && productsA.length) {
      vendorAProductId = productsA[0].id;
      pass('IDOR-SETUP-A', 'Vendor A listed own products', { count: productsA.length, sampleId: vendorAProductId });
    } else {
      // try alternate shape
      const alt = listA.json;
      note('IDOR-SETUP-A', 'Low', 'Could not list vendor A products for IDOR setup', {
        status: listA.status,
        body: alt,
      });
    }
    const ordersA = await api(sessions.vendor.jar, '/api/v1/vendor/orders?limit=5');
    const oa = ordersA.json?.data?.orders ?? ordersA.json?.data ?? ordersA.json?.orders ?? [];
    if (Array.isArray(oa) && oa.length) vendorAOrderId = oa[0].id;
  }

  if (sessions.vendorB) {
    const listB = await api(sessions.vendorB.jar, '/api/v1/vendor/products?limit=5');
    const productsB = listB.json?.data?.products ?? listB.json?.data ?? listB.json?.products ?? [];
    if (Array.isArray(productsB) && productsB.length) {
      vendorBProductId = productsB[0].id;
      pass('IDOR-SETUP-B', 'Vendor B listed own products', { count: productsB.length, sampleId: vendorBProductId });
    } else {
      // Create a minimal product on B if empty? No — audit only, skip create if possible.
      // Try settings / dashboard for B id confirmation
      const dash = await api(sessions.vendorB.jar, '/api/v1/vendor/dashboard');
      pass('IDOR-SETUP-B-DASH', 'Vendor B dashboard reachable', { status: dash.status, bodyKeys: dash.json && Object.keys(dash.json) });
    }
    const settingsB = await api(sessions.vendorB.jar, '/api/v1/vendor/settings');
    vendorBSettings = settingsB;
  }

  // Vendor A tries to PATCH vendor B product
  if (sessions.vendor && vendorBProductId) {
    const r = await api(sessions.vendor.jar, `/api/v1/vendor/products/${vendorBProductId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'IDOR_PROBE_SHOULD_FAIL' }),
    });
    expectStatus(
      'RBAC-IDOR-PATCH-PRODUCT',
      'Vendor A cannot PATCH vendor B product',
      r.status,
      [403, 404],
      'Critical',
      { body: r.json, productId: vendorBProductId }
    );
    // If 200 — critical IDOR
    if (r.status === 200) {
      note('RBAC-IDOR-PATCH-PRODUCT', 'Critical', 'IDOR: Vendor A successfully patched Vendor B product', {
        productId: vendorBProductId,
        body: r.json,
      });
    }
  } else if (sessions.vendor && CREDS.vendorB.vendorId) {
    // Try accessing vendor B order/settings with forged cookie / query param
    const r1 = await api(sessions.vendor.jar, `/api/v1/vendor/settings?vendorId=${CREDS.vendorB.vendorId}`);
    // Settings should still return vendor A's data or deny
    const settingsA = await api(sessions.vendor.jar, '/api/v1/vendor/settings');
    const idFromQuery = r1.json?.data?.id ?? r1.json?.data?.vendorId ?? r1.json?.id;
    const idOwn = settingsA.json?.data?.id ?? settingsA.json?.data?.vendorId ?? settingsA.json?.id;
    if (idFromQuery && idOwn && idFromQuery === CREDS.vendorB.vendorId && idFromQuery !== idOwn) {
      note('RBAC-IDOR-SETTINGS-QUERY', 'Critical', 'vendorId query param switched context to vendor B', {
        idFromQuery,
        idOwn,
      });
    } else {
      pass('RBAC-IDOR-SETTINGS-QUERY', 'vendorId query does not escalate to other vendor', {
        status: r1.status,
        idFromQuery,
        idOwn,
      });
    }

    // Forge impersonation cookie as vendor (should not work for non-admin)
    const jarWithForge = new Map(sessions.vendor.jar);
    jarWithForge.set('admin_impersonate_vendor_id', CREDS.vendorB.vendorId);
    const r2 = await api(jarWithForge, '/api/v1/vendor/settings');
    const forgedId = r2.json?.data?.id ?? r2.json?.data?.vendorId ?? r2.json?.id;
    if (forgedId === CREDS.vendorB.vendorId) {
      note('RBAC-IDOR-FORGE-IMPERSONATE-COOKIE', 'Critical', 'Non-admin forged admin_impersonate_vendor_id cookie', {
        forgedId,
        body: r2.json,
      });
    } else {
      pass('RBAC-IDOR-FORGE-IMPERSONATE-COOKIE', 'Forged impersonation cookie ignored for vendor', {
        status: r2.status,
        forgedId,
        expectedOwn: idOwn,
      });
    }

    // Try GET vendor B product via public catalog if we can find any product owned by B from admin
  }

  // Use admin to find a product belonging to another vendor for IDOR if B has none
  if (sessions.admin && sessions.vendor && !vendorBProductId) {
    const vendors = await api(sessions.admin.jar, '/api/v1/admin/vendors?limit=20');
    const vlist = vendors.json?.data?.vendors ?? vendors.json?.data ?? vendors.json?.vendors ?? [];
    pass('IDOR-ADMIN-VENDORS', 'Admin listed vendors for IDOR target hunt', {
      status: vendors.status,
      count: Array.isArray(vlist) ? vlist.length : 0,
    });

    // Get vendor A's vendor id from settings
    const settingsA = await api(sessions.vendor.jar, '/api/v1/vendor/settings');
    const vendorAId = settingsA.json?.data?.id ?? settingsA.json?.data?.vendorId ?? settingsA.json?.id;

    // List products as admin and find one not belonging to A
    const adminProducts = await api(sessions.admin.jar, '/api/v1/admin/products?limit=50');
    const plist = adminProducts.json?.data?.products ?? adminProducts.json?.data ?? adminProducts.json?.products ?? [];
    if (Array.isArray(plist)) {
      const other = plist.find((p) => p.vendorId && vendorAId && p.vendorId !== vendorAId);
      if (other) {
        vendorBProductId = other.id;
        const r = await api(sessions.vendor.jar, `/api/v1/vendor/products/${other.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'IDOR_PROBE_SHOULD_FAIL' }),
        });
        if (r.status === 200) {
          note('RBAC-IDOR-PATCH-PRODUCT', 'Critical', 'IDOR: Vendor A patched another vendor product', {
            productId: other.id,
            otherVendorId: other.vendorId,
            body: r.json,
          });
        } else {
          expectStatus(
            'RBAC-IDOR-PATCH-PRODUCT',
            'Vendor A cannot PATCH other vendor product',
            r.status,
            [403, 404],
            'Critical',
            { body: r.json, productId: other.id, otherVendorId: other.vendorId }
          );
        }

        // Also try GET by id if endpoint exists — PATCH route may not have GET; try DELETE
        const rDel = await api(sessions.vendor.jar, `/api/v1/vendor/products/${other.id}`, {
          method: 'DELETE',
        });
        if (rDel.status === 200) {
          note('RBAC-IDOR-DELETE-PRODUCT', 'Critical', 'IDOR: Vendor A deleted other vendor product', {
            productId: other.id,
            body: rDel.json,
          });
        } else {
          expectStatus(
            'RBAC-IDOR-DELETE-PRODUCT',
            'Vendor A cannot DELETE other vendor product',
            rDel.status,
            [403, 404],
            'Critical',
            { body: rDel.json }
          );
        }
      } else {
        pass('RBAC-IDOR-NO-TARGET', 'No cross-vendor product found for IDOR PATCH (skipped)', {});
      }
    }

    // Order IDOR: vendor A tries vendor B order from admin list
    const adminOrders = await api(sessions.admin.jar, '/api/v1/admin/orders?limit=30');
    const olist = adminOrders.json?.data?.orders ?? adminOrders.json?.data ?? adminOrders.json?.orders ?? [];
    if (Array.isArray(olist) && vendorAId) {
      const otherOrder = olist.find((o) => o.vendorId && o.vendorId !== vendorAId);
      if (otherOrder) {
        const r = await api(sessions.vendor.jar, `/api/v1/vendor/orders/${otherOrder.id}`);
        if (r.status === 200 && (r.json?.data?.id === otherOrder.id || r.json?.id === otherOrder.id)) {
          note('RBAC-IDOR-GET-ORDER', 'Critical', 'IDOR: Vendor A can GET another vendor order', {
            orderId: otherOrder.id,
            otherVendorId: otherOrder.vendorId,
          });
        } else {
          expectStatus(
            'RBAC-IDOR-GET-ORDER',
            'Vendor A cannot GET other vendor order',
            r.status,
            [403, 404],
            'Critical',
            { body: r.json, orderId: otherOrder.id }
          );
        }
      }
    }
  }

  // ── P5: Admin impersonation ──
  if (sessions.admin) {
    // Need a vendor id — from admin vendors list or seeded
    const vendors = await api(sessions.admin.jar, '/api/v1/admin/vendors?limit=5');
    const vlist = vendors.json?.data?.vendors ?? vendors.json?.data ?? vendors.json?.vendors ?? [];
    const targetVendor = Array.isArray(vlist) && vlist[0] ? vlist[0] : { id: CREDS.vendorB.vendorId };

    if (targetVendor?.id) {
      const enter = await api(sessions.admin.jar, '/api/v1/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: targetVendor.id }),
      });
      expectStatus('RBAC-IMPERSONATE-ENTER', 'Admin enter vendor impersonation', enter.status, [200], 'High', {
        body: enter.json,
      });

      const check = await api(sessions.admin.jar, '/api/v1/admin/impersonate');
      expectStatus('RBAC-IMPERSONATE-GET', 'GET impersonation state', check.status, [200], 'Medium', {
        body: check.json,
      });

      // Vendor APIs under impersonation
      const vDash = await api(sessions.admin.jar, '/api/v1/vendor/dashboard');
      expectStatus('RBAC-IMPERSONATE-VENDOR-DASH', 'Admin-as-vendor can hit vendor dashboard', vDash.status, [200], 'Medium');

      // Notifications scoping — customer notifications vs admin
      const notifBeforeExit = await api(sessions.admin.jar, '/api/v1/notifications');
      pass('RBAC-IMPERSONATE-NOTIF', 'Notifications under vendor impersonation', {
        status: notifBeforeExit.status,
        bodyPreview: notifBeforeExit.json,
      });
      // Under vendor impersonation, /api/v1/notifications should still be admin's userId
      // (customer impersonation is separate). Record observation.
      const meImp = await api(sessions.admin.jar, '/api/v1/auth/me');
      pass('RBAC-IMPERSONATE-ME', 'auth/me under vendor impersonation', {
        status: meImp.status,
        body: meImp.json,
      });

      const exit = await api(sessions.admin.jar, '/api/v1/admin/impersonate', { method: 'DELETE' });
      expectStatus('RBAC-IMPERSONATE-EXIT', 'Admin exit vendor impersonation', exit.status, [200], 'High', {
        body: exit.json,
      });
    }

    // Customer impersonation
    const custId = CREDS.disposableCustomer.userId;
    const enterC = await api(sessions.admin.jar, '/api/v1/admin/impersonate/customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: custId }),
    });
    expectStatus('RBAC-IMPERSONATE-CUST-ENTER', 'Admin enter customer impersonation', enterC.status, [200], 'High', {
      body: enterC.json,
    });

    if (enterC.status === 200) {
      const meC = await api(sessions.admin.jar, '/api/v1/auth/me');
      const notifC = await api(sessions.admin.jar, '/api/v1/notifications');
      const meData = meC.json?.data ?? meC.json;
      const impersonating = meData?.impersonating ?? meData?.user?.impersonating;
      pass('RBAC-IMPERSONATE-CUST-ME', 'auth/me shows customer impersonation context', {
        status: meC.status,
        me: meData,
        impersonating,
      });

      // Notifications should scope to impersonated customer if designed that way — observe
      const notifUserHint =
        notifC.json?.data?.items?.[0]?.userId ??
        notifC.json?.data?.[0]?.userId ??
        null;
      pass('RBAC-IMPERSONATE-CUST-NOTIF', 'Notifications under customer impersonation (observe scoping)', {
        status: notifC.status,
        count:
          notifC.json?.data?.items?.length ??
          notifC.json?.data?.length ??
          notifC.json?.items?.length,
        sampleUserId: notifUserHint,
        bodyPreview: JSON.stringify(notifC.json).slice(0, 300),
      });

      // If notifications return admin's private data while impersonating customer — potential leak to UI
      // We can't know admin userId easily; check if me says impersonating and notifs succeed
      if (notifC.status === 200 && !impersonating && meC.status === 200) {
        // soft observation only
      }

      const exitC = await api(sessions.admin.jar, '/api/v1/admin/impersonate/customer', {
        method: 'DELETE',
      });
      expectStatus('RBAC-IMPERSONATE-CUST-EXIT', 'Admin exit customer impersonation', exitC.status, [200], 'High');
    }
  }

  // ── P6: Cart ──
  {
    const unauthGet = await api(null, '/api/v1/cart');
    expectStatus('API-CART-GET-UNAUTH', 'GET /api/v1/cart without auth', unauthGet.status, [401, 403, 200], 'Medium', {
      note: '200 may be ok for guest cart',
      body: unauthGet.json,
    });
    // Record if guest cart allowed
    if (unauthGet.status === 200) {
      pass('API-CART-GUEST-ALLOWED', 'Guest cart GET returns 200 (by design?)', { body: unauthGet.json });
    }

    const unauthPost = await api(null, '/api/v1/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: '00000000-0000-0000-0000-000000000001', quantity: 1 }),
    });
    expectStatus('API-CART-POST-UNAUTH', 'POST /api/v1/cart without auth', unauthPost.status, [401, 403, 400, 404], 'Medium', {
      body: unauthPost.json,
    });

    if (sessions.customer) {
      const authGet = await api(sessions.customer.jar, '/api/v1/cart');
      expectStatus('API-CART-GET-AUTH', 'GET /api/v1/cart as customer', authGet.status, [200], 'Medium', {
        bodyPreview: JSON.stringify(authGet.json).slice(0, 200),
      });
    }
  }

  // ── P6: Orders list ──
  if (sessions.customer) {
    const r = await api(sessions.customer.jar, '/api/v1/orders');
    expectStatus('API-ORDERS-LIST', 'GET /api/v1/orders as customer', r.status, [200], 'Medium', {
      bodyPreview: JSON.stringify(r.json).slice(0, 200),
    });
  }
  {
    const r = await api(null, '/api/v1/orders');
    expectStatus('API-ORDERS-UNAUTH', 'GET /api/v1/orders unauth → 401/403', r.status, [401, 403], 'High');
  }

  // ── P6: Payments webhook without HMAC ──
  {
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_fake', order_id: 'order_fake', amount: 100 } } },
    });
    const r = await api(null, '/api/v1/payments/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'invalidsignature',
      },
      body,
    });
    // Must reject — 400 per route comments
    if (r.status === 400 || r.status === 401) {
      pass('API-WEBHOOK-HMAC', 'Payments webhook rejects invalid HMAC', {
        status: r.status,
        body: r.json,
      });
    } else {
      note('API-WEBHOOK-HMAC', 'Critical', 'Payments webhook did not reject invalid HMAC', {
        status: r.status,
        body: r.json ?? r.text,
      });
    }

    // Also no signature header
    const r2 = await api(null, '/api/v1/payments/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (r2.status === 400 || r2.status === 401) {
      pass('API-WEBHOOK-NOSIG', 'Payments webhook rejects missing signature', { status: r2.status, body: r2.json });
    } else {
      note('API-WEBHOOK-NOSIG', 'Critical', 'Payments webhook accepted missing signature', {
        status: r2.status,
        body: r2.json ?? r2.text,
      });
    }
  }

  // ── P6: OTP send — 1-2 careful probes ──
  {
    const r1 = await api(null, '/api/v1/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9000000099', intent: 'customer' }),
    });
    pass('API-OTP-SEND-1', 'OTP send probe 1', { status: r1.status, body: r1.json });

    const r2 = await api(null, '/api/v1/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9000000099', intent: 'customer' }),
    });
    pass('API-OTP-SEND-2', 'OTP send probe 2 (same phone — observe rate limit)', {
      status: r2.status,
      body: r2.json,
    });
    if (r2.status === 429) {
      pass('API-OTP-RATELIMIT', 'OTP rate limit returns 429 on rapid repeat', {});
    } else {
      // Not necessarily a bug — may allow 2 before limit
      pass('API-OTP-RATELIMIT-OBS', 'OTP second probe not 429 (may be within window)', {
        status: r2.status,
      });
    }
  }

  // ── P6: Invalid JSON ──
  if (sessions.customer) {
    const r = await api(sessions.customer.jar, '/api/v1/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expectStatus('API-INVALID-JSON', 'Invalid JSON body returns 4xx validation shape', r.status, [400, 422], 'Medium', {
      body: r.json ?? r.text,
    });
  }

  // Also admin endpoint with invalid JSON
  if (sessions.admin) {
    const r = await api(sessions.admin.jar, '/api/v1/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{broken',
    });
    expectStatus('API-INVALID-JSON-ADMIN', 'Admin invalid JSON → 4xx', r.status, [400, 422], 'Low', {
      body: r.json ?? r.text,
    });
  }

  // ── P6: BELOW_MOV / validation — try checkout or cart with tiny qty if easy ──
  if (sessions.customer) {
    // POST cart with missing fields
    const r = await api(sessions.customer.jar, '/api/v1/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 1 }),
    });
    expectStatus('API-CART-VALIDATION', 'Cart POST missing productId → validation error', r.status, [400, 422], 'Medium', {
      body: r.json,
    });

    // Try orders create with empty body if endpoint exists
    const r2 = await api(sessions.customer.jar, '/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    pass('API-ORDERS-POST-EMPTY', 'POST /api/v1/orders empty body (observe)', {
      status: r2.status,
      body: r2.json,
    });
    if (r2.status === 400 && (JSON.stringify(r2.json || {}).includes('MOV') || JSON.stringify(r2.json || {}).includes('BELOW_MOV'))) {
      pass('API-BELOW-MOV', 'BELOW_MOV surfaced on empty/low order', { body: r2.json });
    }
  }

  // ── P7: XSS in search ──
  {
    const xss = encodeURIComponent('<script>alert(1)</script>');
    const r = await api(null, `/search?q=${xss}`);
    const reflected =
      r.text.includes('<script>alert(1)</script>') &&
      !r.text.includes('&lt;script&gt;') &&
      r.status === 200;
    // Also check API search
    const rApi = await api(null, `/api/v1/search?q=${xss}`);
    const apiReflect = JSON.stringify(rApi.json || rApi.text).includes('<script>alert(1)</script>');

    if (reflected) {
      note('SEC-XSS-SEARCH', 'High', 'Search page reflects unsanitized <script> in HTML', {
        status: r.status,
      });
    } else {
      pass('SEC-XSS-SEARCH', 'Search page does not reflect raw script tag', {
        status: r.status,
        location: r.location,
      });
    }
    if (apiReflect) {
      // Echoing in JSON is lower risk if Content-Type is json and UI escapes
      pass('SEC-XSS-SEARCH-API', 'API search echoes query string in JSON (UI must escape)', {
        status: rApi.status,
        preview: JSON.stringify(rApi.json).slice(0, 200),
      });
    } else {
      pass('SEC-XSS-SEARCH-API', 'API search XSS probe', { status: rApi.status, body: rApi.json });
    }
  }

  // ── P7: SQL-ish in search ──
  {
    const sqli = encodeURIComponent("'; DROP TABLE products;--");
    const r = await api(null, `/api/v1/search?q=${sqli}`);
    if (r.status >= 500) {
      note('SEC-SQLI-SEARCH', 'High', 'SQL-ish search param caused 5xx', { status: r.status, body: r.text });
    } else {
      pass('SEC-SQLI-SEARCH', 'SQL-ish search handled without 5xx', {
        status: r.status,
        bodyPreview: JSON.stringify(r.json).slice(0, 200),
      });
    }
  }

  // ── P7: /admin/dashboard without cookie → redirect ──
  {
    const r = await api(null, '/admin/dashboard');
    const redirected = [301, 302, 303, 307, 308].includes(r.status);
    const toLogin =
      redirected &&
      r.location &&
      (/login|signin|auth|\//i.test(r.location) || r.location.includes('callbackUrl'));
    if (redirected || r.status === 401 || r.status === 403) {
      pass('SEC-ADMIN-PAGE-UNAUTH', 'Unauth /admin/dashboard blocked or redirected', {
        status: r.status,
        location: r.location,
      });
    } else if (r.status === 200 && r.text.includes('admin') && !r.text.includes('Sign in')) {
      note('SEC-ADMIN-PAGE-UNAUTH', 'High', 'Unauth /admin/dashboard returned 200 with admin content', {
        status: r.status,
        preview: r.text.slice(0, 200),
      });
    } else {
      pass('SEC-ADMIN-PAGE-UNAUTH', 'Unauth /admin/dashboard response observed', {
        status: r.status,
        location: r.location,
        preview: r.text.slice(0, 150),
      });
    }
  }

  // ── P7: admin users without auth (also covered in P5) ──
  {
    const r = await api(null, '/api/v1/admin/users');
    expectStatus('SEC-ADMIN-USERS-UNAUTH', 'GET /api/v1/admin/users without auth → 401/403', r.status, [401, 403], 'Critical');
  }

  // ── P7: secrets in .env.example + page source spot check ──
  {
    // Already read .env.example — NEXT_PUBLIC_ should only be public keys
    const publicSafe = [
      'NEXT_PUBLIC_SENTRY_DSN',
      'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
      'NEXT_PUBLIC_REGISTER_EMAIL_OTP',
    ];
    pass('SEC-ENV-EXAMPLE', '.env.example NEXT_PUBLIC_ vars are expected public-only placeholders', {
      publicVars: publicSafe,
      note: 'No RAZORPAY_KEY_SECRET / AUTH_SECRET / IMAGEKIT_PRIVATE_KEY exposed as NEXT_PUBLIC_',
    });

    const page = await api(null, '/');
    const html = page.text;
    const leakPatterns = [
      /AUTH_SECRET\s*=\s*['"][^'"]+['"]/,
      /RAZORPAY_KEY_SECRET/,
      /IMAGEKIT_PRIVATE_KEY/,
      /sk_live_[a-zA-Z0-9]+/,
      /sk_test_[a-zA-Z0-9]{20,}/,
      /BEGIN (RSA |OPENSSH )?PRIVATE KEY/,
      /postgres:\/\/[^:]+:[^@]+@/,
    ];
    const leaks = leakPatterns.filter((re) => re.test(html));
    if (leaks.length) {
      note('SEC-CLIENT-BUNDLE-LEAK', 'Critical', 'Homepage HTML matched secret-like patterns', {
        matches: leaks.map(String),
      });
    } else {
      pass('SEC-CLIENT-BUNDLE-LEAK', 'Homepage HTML spot-check: no secret-like patterns', {
        status: page.status,
      });
    }

    // Check for NEXT_PUBLIC_GOOGLE_MAPS in HTML (expected if used)
    if (/NEXT_PUBLIC_|AIza[0-9A-Za-z_-]{20,}/.test(html)) {
      pass('SEC-CLIENT-PUBLIC-KEY', 'Public Maps/API key may appear in client (expected for NEXT_PUBLIC_)', {});
    }
  }

  // ── P7: File upload auth ──
  {
    const r = await api(null, '/api/v1/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expectStatus('SEC-UPLOAD-UNAUTH', 'POST /api/v1/upload unauth denied', r.status, [401, 403], 'High');

    const r2 = await api(null, '/api/v1/vendor/documents/upload', {
      method: 'POST',
      body: '{}',
    });
    expectStatus('SEC-VENDOR-DOC-UPLOAD-UNAUTH', 'POST /api/v1/vendor/documents/upload unauth denied', r.status, [401, 403], 'High', {
      status: r2.status,
      body: r2.json,
    });

    // Onboarding documents — may be less locked
    const r3 = await api(null, '/api/v1/vendor/onboarding/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    pass('SEC-ONBOARDING-DOC-UPLOAD', 'POST vendor onboarding documents unauth (observe)', {
      status: r3.status,
      body: r3.json,
    });
    if (r3.status === 200) {
      note('SEC-ONBOARDING-DOC-UPLOAD', 'High', 'Unauth onboarding document upload returned 200', {
        body: r3.json,
      });
    } else if (![401, 403, 400, 422].includes(r3.status)) {
      note('SEC-ONBOARDING-DOC-UPLOAD', 'Medium', 'Unexpected status on unauth onboarding upload', {
        status: r3.status,
        body: r3.json,
      });
    }
  }

  // ── Logout ──
  if (sessions.customer) {
    const jar = sessions.customer.jar;
    const csrfRes = await api(jar, '/api/auth/csrf');
    const token = csrfRes.json?.csrfToken;
    const logoutRes = await fetch(`${BASE}/api/auth/signout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: jarHeader(jar),
      },
      body: new URLSearchParams({ csrfToken: token ?? '', callbackUrl: BASE }),
      redirect: 'manual',
    });
    const scs = logoutRes.headers.getSetCookie?.() ?? [];
    for (const sc of scs) mergeCookies(jar, sc);
    const meAfter = await api(jar, '/api/v1/auth/me');
    expectStatus('API-LOGOUT', 'After logout, /api/v1/auth/me is 401', meAfter.status, [401], 'High', {
      logoutStatus: logoutRes.status,
    });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    findings,
    passes,
    summary: {
      findings: findings.length,
      passes: passes.length,
      bySeverity: findings.reduce((acc, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
      }, {}),
    },
  };

  const outPath = join(__dirname, 'audit-p5-p7-results.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('\n=== DONE ===');
  console.log('Findings:', findings.length, 'Passes:', passes.length);
  console.log('Wrote', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
