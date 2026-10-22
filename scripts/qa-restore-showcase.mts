/* Restore the intentionally-kept demo showcase assignments and remove
   leftover QA-CF lists from an interrupted run. */
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
  const s = await fetch(BASE + '/api/auth/session', { headers: { cookie: hdr(m) } });
  const sess = await s.json() as { user?: { id?: string } };
  return { m, userId: sess.user?.id ?? '' };
}
async function api(ctx: { m: Map<string, string> }, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { cookie: hdr(ctx.m), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text();
  let json: unknown = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
}
const dig = (j: unknown, p: string[]): unknown => p.reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), j);

const vendor = await signIn('demo.vendor@horeca1.com', 'DemoVendor123!');
const customer = await signIn('demo.customer@horeca1.com', 'DemoCustomer123!');
const CUST = customer.userId;

const lists = (dig((await api(vendor, 'GET', '/api/v1/vendor/price-lists')).json, ['data']) as Array<{ id: string; name: string }>) ?? [];
const byName = (frag: string) => lists.find((l) => l.name.includes(frag));

/* delete leftover QA-CF lists */
for (const l of lists.filter((l) => l.name.startsWith('QA-CF-') || l.name.startsWith('QA-MC-') || l.name.startsWith('QA-HC-'))) {
  const r = await api(vendor, 'DELETE', `/api/v1/vendor/price-lists/${l.id}`);
  console.log(`delete ${l.name}: ${r.status}`);
}

const groups = (dig((await api(vendor, 'GET', '/api/v1/vendor/customer-groups')).json, ['data']) as Array<{ id: string; name: string }>) ?? [];
const group = groups.find((g) => g.name.includes('QA-SHOW')) ?? groups[0];
console.log('group:', group?.name, group?.id);

const plan: Array<[string, Record<string, unknown>]> = [
  ['Sample — Hotel Prices', { type: 'customer', userId: CUST }],
  ['QA-SHOW 2', { type: 'group', groupId: group?.id }],
  ['QA-SHOW 3', { type: 'credit_status', creditStatus: 'active' }],
  ['QA-SHOW 4', { type: 'segment', segment: 'Hotel' }],
  ['QA-SHOW 5', { type: 'pincode', pincode: '400705' }],
  ['QA-SHOW 6', { type: 'area', area: 'Navi Mumbai' }],
];
for (const [frag, target] of plan) {
  const l = byName(frag);
  if (!l) { console.log(`MISSING list ${frag}`); continue; }
  const r = await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${l.id}`, { assignments: [target] });
  console.log(`restore ${l.name} <- ${JSON.stringify(target)}: ${r.status} ${r.status !== 200 ? r.text.slice(0, 200) : ''}`);
}
