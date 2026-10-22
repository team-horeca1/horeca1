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
  jar(r, m);
  return { m };
}
const vendor = await signIn('demo.vendor@horeca1.com', 'DemoVendor123!');
const res = await fetch(BASE + '/api/v1/vendor/price-lists', { headers: { cookie: hdr(vendor.m) } });
const json = (await res.json()) as { data?: Array<{ id: string; name: string; isActive?: boolean; assignments?: Array<Record<string, unknown>> }> };
for (const l of json.data ?? []) {
  const asgs = (l.assignments ?? []).map((a) => {
    const v = a.userId ?? a.groupId ?? a.pincode ?? a.area ?? a.segment ?? a.creditStatus ?? '';
    return `${a.type}:${v}`;
  });
  console.log(`${l.name} | active=${l.isActive} | assignments=[${asgs.join(', ')}]`);
}
