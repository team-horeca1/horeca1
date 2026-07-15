/** Supplemental IDOR / upload / impersonation probes */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));

function mergeCookies(jar, setCookie) {
  if (!setCookie) return jar;
  for (const p of setCookie.split(/,(?=\s*[^;,]+=)/)) {
    const [kv] = p.split(';');
    const eq = kv.indexOf('=');
    if (eq < 1) continue;
    const n = kv.slice(0, eq).trim();
    const v = kv.slice(eq + 1).trim();
    if (!v) jar.delete(n);
    else jar.set(n, v);
  }
  return jar;
}
function jarHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function applySetCookies(jar, res) {
  const scs = res.headers.getSetCookie?.() ?? [];
  if (scs.length) for (const sc of scs) mergeCookies(jar, sc);
  else mergeCookies(jar, res.headers.get('set-cookie'));
}
async function login(email, password) {
  const jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  await applySetCookies(jar, csrfRes);
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
  await applySetCookies(jar, loginRes);
  return jar;
}
async function api(jar, path, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (jar) headers.Cookie = jarHeader(jar);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
  if (jar) await applySetCookies(jar, res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 400), location: res.headers.get('location') };
}

const out = {};

const admin = await login('admin@horeca1.com', 'admin123');
const vendor = await login('fresh@dailyfreshfoods.com', 'vendor123');
const vendorB = await login('audit.vendor.1784132100999@example.com', 'AuditVend1!');
const cust = await login('chef@tajpalace.com', 'customer123');

out.adminProducts = await api(admin, '/api/v1/admin/products?limit=30');
out.adminOrders = await api(admin, '/api/v1/admin/orders?limit=30');
out.vendorASettings = await api(vendor, '/api/v1/vendor/settings');
out.vendorBSettings = await api(vendorB, '/api/v1/vendor/settings');
out.vendorAOrders = await api(vendor, '/api/v1/vendor/orders?limit=5');
out.vendorBProducts = await api(vendorB, '/api/v1/vendor/products?limit=5');
out.vendorADash = await api(vendor, '/api/v1/vendor/dashboard');
out.vendorACustomers = await api(vendor, '/api/v1/vendor/customers?limit=3');

const products =
  out.adminProducts.json?.data?.products ??
  out.adminProducts.json?.data ??
  out.adminProducts.json?.products ??
  [];
const orders =
  out.adminOrders.json?.data?.orders ??
  out.adminOrders.json?.data ??
  out.adminOrders.json?.orders ??
  [];

const vaId =
  out.vendorASettings.json?.data?.id ??
  out.vendorASettings.json?.data?.vendorId ??
  out.vendorASettings.json?.id;
const vbId =
  out.vendorBSettings.json?.data?.id ??
  out.vendorBSettings.json?.data?.vendorId ??
  '58234d04-eb99-4bb1-a02a-374f68e95351';

out.ids = { vaId, vbId };
out.productSample = Array.isArray(products)
  ? products.slice(0, 5).map((p) => ({ id: p.id, vendorId: p.vendorId, name: p.name }))
  : { rawStatus: out.adminProducts.status, keys: out.adminProducts.json && Object.keys(out.adminProducts.json) };
out.orderSample = Array.isArray(orders)
  ? orders.slice(0, 5).map((o) => ({
      id: o.id,
      vendorId: o.vendorId,
      userId: o.userId,
      customerId: o.customerId,
    }))
  : { rawStatus: out.adminOrders.status, body: out.adminOrders.json };

const otherProd = Array.isArray(products)
  ? products.find((p) => p.vendorId && vaId && p.vendorId !== vaId)
  : null;
const aProd = Array.isArray(products) ? products.find((p) => p.vendorId === vaId) : null;
const otherOrd = Array.isArray(orders)
  ? orders.find((o) => o.vendorId && vaId && o.vendorId !== vaId)
  : null;

if (otherProd) {
  out.idorPatch = await api(vendor, `/api/v1/vendor/products/${otherProd.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'IDOR_FAIL' }),
  });
  out.idorDel = await api(vendor, `/api/v1/vendor/products/${otherProd.id}`, {
    method: 'DELETE',
  });
  out.idorTargetProd = otherProd;
} else {
  out.idorPatch = { skipped: true, reason: 'no otherProd', productsLen: Array.isArray(products) ? products.length : 0 };
}

if (aProd) {
  out.idorBtoA = await api(vendorB, `/api/v1/vendor/products/${aProd.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ basePrice: 1 }),
  });
  out.aProd = { id: aProd.id, vendorId: aProd.vendorId };
}

if (otherOrd) {
  out.idorOrderGet = await api(vendor, `/api/v1/vendor/orders/${otherOrd.id}`);
  out.idorOrderInvoice = await api(vendor, `/api/v1/vendor/orders/${otherOrd.id}/invoice`);
  out.idorTargetOrd = { id: otherOrd.id, vendorId: otherOrd.vendorId };
}

// Customer cross-order
out.custOrders = await api(cust, '/api/v1/orders');
if (Array.isArray(orders) && orders[0]) {
  out.custCrossOrder = await api(cust, `/api/v1/orders/${orders[0].id}`);
  out.custCrossInvoice = await api(cust, `/api/v1/orders/${orders[0].id}/invoice`);
}

// Admin page
out.adminPage = await api(null, '/admin/dashboard');

// Onboarding multipart no auth
{
  const form = new FormData();
  form.append('type', 'gst');
  form.append('phone', '9888777666');
  form.append('vendorId', vbId);
  form.append('file', new Blob(['fake'], { type: 'application/pdf' }), 'x.pdf');
  const r = await fetch(`${BASE}/api/v1/vendor/onboarding/documents`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  out.onboardingMultipart = { status: r.status, body: json || text.slice(0, 200) };
}

// Upload unauth SVG
{
  const f = new FormData();
  f.append('file', new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }), 'x.svg');
  const r = await fetch(`${BASE}/api/v1/upload`, { method: 'POST', body: f });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  out.uploadUnauthSvg = { status: r.status, body: json || text.slice(0, 150) };
}

// Customer impersonation notification detail
out.impEnter = await api(admin, '/api/v1/admin/impersonate/customer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'c5ff54df-77f5-4003-9db2-36e3ad796541' }),
});
out.impMe = await api(admin, '/api/v1/auth/me');
out.impNotif = await api(admin, '/api/v1/notifications?limit=5');
out.impExit = await api(admin, '/api/v1/admin/impersonate/customer', { method: 'DELETE' });

// Checkout / MOV
out.checkoutProbe = await api(cust, '/api/v1/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    paymentMethod: 'cod',
    addressId: '00000000-0000-4000-8000-000000000001',
  }),
});

// Files route IDOR if we can find a doc id
out.filesProbe = await api(vendor, '/api/v1/files/vendor-docs/00000000-0000-4000-8000-000000000001');

writeFileSync(join(__dirname, 'audit-p5-p7-supplement.json'), JSON.stringify(out, null, 2));
console.log('Wrote supplement. Key excerpts:');
console.log(
  JSON.stringify(
    {
      ids: out.ids,
      productSample: out.productSample,
      orderSample: out.orderSample,
      idorPatch: out.idorPatch && { status: out.idorPatch.status, body: out.idorPatch.json },
      idorDel: out.idorDel && { status: out.idorDel.status, body: out.idorDel.json },
      idorBtoA: out.idorBtoA && { status: out.idorBtoA.status, body: out.idorBtoA.json },
      idorOrderGet: out.idorOrderGet && { status: out.idorOrderGet.status, body: out.idorOrderGet.json },
      custCrossOrder: out.custCrossOrder && {
        status: out.custCrossOrder.status,
        body: out.custCrossOrder.json,
      },
      custCrossInvoice: out.custCrossInvoice && {
        status: out.custCrossInvoice.status,
        body: out.custCrossInvoice.json,
      },
      adminPage: out.adminPage,
      onboardingMultipart: out.onboardingMultipart,
      uploadUnauthSvg: out.uploadUnauthSvg,
      impMe: { status: out.impMe.status, impersonating: out.impMe.json?.impersonating, dataId: out.impMe.json?.data?.id },
      impNotif: {
        status: out.impNotif.status,
        preview: JSON.stringify(out.impNotif.json).slice(0, 400),
      },
      checkoutProbe: { status: out.checkoutProbe.status, body: out.checkoutProbe.json },
      vendorASettingsStatus: out.vendorASettings.status,
      vendorBProducts: { status: out.vendorBProducts.status, body: out.vendorBProducts.json },
      vendorAOrders: { status: out.vendorAOrders.status },
      vendorACustomers: { status: out.vendorACustomers.status, body: out.vendorACustomers.json },
    },
    null,
    2
  )
);
