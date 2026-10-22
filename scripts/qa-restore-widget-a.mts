const BASE = 'https://demo.horeca1.com';
function jar(res: Response, m: Map<string, string>) {
  const lines = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of lines) { const [p] = c.split(';'); const eq = p.indexOf('='); if (eq > 0) m.set(p.slice(0, eq), p.slice(eq + 1)); }
}
const hdr = (m: Map<string, string>) => [...m].map(([k, v]) => `${k}=${v}`).join('; ');
async function signIn(email: string, password: string) {
  const m = new Map<string, string>();
  const c = await fetch(BASE + '/api/auth/csrf'); const { csrfToken } = await c.json(); jar(c, m);
  const form = new URLSearchParams({ csrfToken, email, password, json: 'true', callbackUrl: BASE + '/' });
  const r = await fetch(BASE + '/api/auth/callback/credentials', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: hdr(m) }, body: form.toString(), redirect: 'manual' });
  jar(r, m); return { m };
}
const vendor = await signIn('demo.vendor@horeca1.com', 'DemoVendor123!');
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { cookie: hdr(vendor.m), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}
const ws = await api('GET', '/api/v1/vendor/price-lists/workspace?limit=50');
const data = ws.json?.data as { baseVersion: string; priceLists: Array<{ id: string; name: string }>; products: Array<{ id: string; name: string }> };
const list = data.priceLists.find((l) => l.name.startsWith('Sample'))!;
const prod = data.products.find((p) => p.name.includes('Widget A'))!;
const r = await api('PATCH', '/api/v1/vendor/price-lists/workspace', { baseVersion: data.baseVersion, acknowledgeWarnings: true, cells: [{ priceListId: list.id, productId: prod.id, customPrice: 90 }] });
console.log('restore Widget A=90 on Sample:', r.status);
