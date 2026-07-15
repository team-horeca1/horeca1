/** Final supplemental probes for audit report */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const __dirname = dirname(fileURLToPath(import.meta.url));

function mergeCookies(jar, setCookie) {
  if (!setCookie) return;
  for (const p of setCookie.split(/,(?=\s*[^;,]+=)/)) {
    const [kv] = p.split(';');
    const eq = kv.indexOf('=');
    if (eq < 1) continue;
    const n = kv.slice(0, eq).trim();
    const v = kv.slice(eq + 1).trim();
    if (!v) jar.delete(n);
    else jar.set(n, v);
  }
}
function jarH(j) {
  return [...j.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function apply(j, r) {
  const s = r.headers.getSetCookie?.() ?? [];
  if (s.length) for (const c of s) mergeCookies(j, c);
  else mergeCookies(j, r.headers.get('set-cookie'));
}
async function login(e, p) {
  const j = new Map();
  const c = await fetch(`${BASE}/api/auth/csrf`);
  await apply(j, c);
  const { csrfToken } = await c.json();
  const l = await fetch(`${BASE}/api/auth/callback/credentials?`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jarH(j),
    },
    body: new URLSearchParams({
      csrfToken,
      email: e,
      password: p,
      callbackUrl: BASE,
      json: 'true',
    }),
    redirect: 'manual',
  });
  await apply(j, l);
  return j;
}
async function api(j, path, init = {}) {
  const h = { ...(init.headers || {}) };
  if (j) h.Cookie = jarH(j);
  const r = await fetch(`${BASE}${path}`, { ...init, headers: h, redirect: 'manual' });
  if (j) await apply(j, r);
  const t = await r.text();
  let json = null;
  try {
    json = JSON.parse(t);
  } catch {
    /* ignore */
  }
  return { status: r.status, json, text: t.slice(0, 300), location: r.headers.get('location') };
}

const admin = await login('admin@horeca1.com', 'admin123');
const vendor = await login('fresh@dailyfreshfoods.com', 'vendor123');
const vendorB = await login('audit.vendor.1784132100999@example.com', 'AuditVend1!');
const brand = await login('brand@kitchensmith.com', 'brand123');
const cust = await login('chef@tajpalace.com', 'customer123');

const out = {};
out.brandAdmin = await api(brand, '/api/v1/admin/users');
out.brandVendor = await api(brand, '/api/v1/vendor/dashboard');
out.vendorProducts = await api(vendor, '/api/v1/vendor/products?limit=1');
out.vendorTeam = await api(vendor, '/api/v1/vendor/team');
out.vendorRoles = await api(vendor, '/api/v1/vendor/roles');
out.vendorMe = await api(vendor, '/api/v1/auth/me');

out.walletWebhook = await api(null, '/api/v1/wallet/razorpay-webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'bad' },
  body: JSON.stringify({ event: 'payment.captured' }),
});

const adminProds = await api(admin, '/api/v1/admin/products?limit=50');
const plist = adminProds.json?.data?.products ?? [];
const gvId = '85f39d83-7409-42ca-8252-81590124b07d';
const gvProd = plist.find((p) => p.vendorId === gvId);
if (gvProd) {
  out.idorVendorBPatchGV = await api(vendorB, `/api/v1/vendor/products/${gvProd.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'HACK' }),
  });
  out.idorVendorAPatchGV = await api(vendor, `/api/v1/vendor/products/${gvProd.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'HACK' }),
  });
  out.gvProd = { id: gvProd.id, vendorId: gvProd.vendorId };
}

// MOV: use cart
out.cart = await api(cust, '/api/v1/cart');
const groups = out.cart.json?.data?.vendorGroups ?? [];
if (groups.length) {
  const vendorOrders = groups.map((g) => ({
    vendorId: g.vendor.id,
    items: (g.items || []).map((i) => ({
      productId: i.productId || i.product?.id,
      quantity: 1,
    })),
  }));
  out.movAttempt = await api(cust, '/api/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: 'cod',
      vendorOrders,
      deliveryAddress: {
        label: 'test',
        addressLine1: '1 Test St',
        city: 'Mumbai',
        state: 'MH',
        pincode: '400001',
      },
    }),
  });
}

const home = await fetch(`${BASE}/`);
const html = await home.text();
const patterns = [
  /rzp_live_[A-Za-z0-9]+/,
  /rzp_test_[A-Za-z0-9]{10,}/,
  /sk_live_[A-Za-z0-9]+/,
  /AUTH_SECRET/,
  /IMAGEKIT_PRIVATE/,
  /PRIVATE_KEY/,
  /postgres:\/\/[^\s"']+/,
  /re_[A-Za-z0-9]{20,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
];
out.homeSecretHits = patterns
  .map((re) => {
    const m = html.match(re);
    return m ? m[0].slice(0, 40) : null;
  })
  .filter(Boolean);
out.htmlLen = html.length;

// Impersonation cookie flags
out.impEnterFlags = await (async () => {
  const r = await fetch(`${BASE}/api/v1/admin/impersonate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: jarH(admin),
    },
    body: JSON.stringify({ vendorId: '58234d04-eb99-4bb1-a02a-374f68e95351' }),
  });
  const scs = r.headers.getSetCookie?.() ?? [];
  await api(admin, '/api/v1/admin/impersonate', { method: 'DELETE' });
  return scs.map((c) => {
    const parts = c.split(';').map((s) => s.trim());
    const name = parts[0].split('=')[0];
    return {
      name,
      httpOnly: parts.some((p) => /^HttpOnly$/i.test(p)),
      secure: parts.some((p) => /^Secure$/i.test(p)),
      sameSite: (parts.find((p) => /^SameSite=/i.test(p)) || '').split('=')[1] || null,
    };
  });
})();

writeFileSync(join(__dirname, 'audit-p5-p7-final.json'), JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      brandAdmin: out.brandAdmin,
      brandVendor: out.brandVendor,
      vendorProducts: out.vendorProducts,
      vendorTeamPreview: JSON.stringify(out.vendorTeam.json).slice(0, 400),
      vendorRoles: { status: out.vendorRoles.status, body: out.vendorRoles.json },
      walletWebhook: out.walletWebhook,
      idorVendorBPatchGV: out.idorVendorBPatchGV && {
        status: out.idorVendorBPatchGV.status,
        body: out.idorVendorBPatchGV.json,
      },
      idorVendorAPatchGV: out.idorVendorAPatchGV && {
        status: out.idorVendorAPatchGV.status,
        body: out.idorVendorAPatchGV.json,
      },
      movAttempt: out.movAttempt && { status: out.movAttempt.status, body: out.movAttempt.json },
      cartVendors: groups.map((g) => ({
        id: g.vendor?.id,
        name: g.vendor?.businessName,
        mov: g.vendor?.minOrderValue,
        itemCount: g.items?.length,
      })),
      homeSecretHits: out.homeSecretHits,
      impEnterFlags: out.impEnterFlags,
    },
    null,
    2
  )
);
