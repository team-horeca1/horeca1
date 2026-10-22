/* Conflict rule (client decision 2026-10-22):
   - Multiple lists per customer OK when they cover DIFFERENT products.
   - SAME product priced on 2 applicable lists = conflict at assignment:
     preview reports it; save without resolution = 409 PRICE_CONFLICT.
   - Skip keeps old list; Replace moves the customer; Review Manually = no save.
   - Hidden (excluded) is not a price -> no conflict.
   - A list-wide % list prices every product -> conflicts with any priced list.
Run: npx tsx scripts/qa-conflict-rule.mts [--keep] */
const KEEP = process.argv.includes('--keep');
if (KEEP) console.log('(--keep: test data will be left on the demo account)');
const BASE = 'https://demo.horeca1.com';
const TS = Date.now().toString(36).toUpperCase();
let failures = 0, passes = 0;
function assert(label: string, cond: boolean, extra?: unknown) {
  if (cond) { passes++; console.log(`PASS  ${label}`); }
  else { failures++; console.log(`FAIL  ${label}`); if (extra !== undefined) console.log('   ', String(extra).slice(0, 600)); }
}
const note = (m: string) => console.log(`  .. ${m}`);
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
assert('logged in', !!vendor.userId && !!CUST);

const vp = await api(vendor, 'GET', '/api/v1/vendor/products?limit=100');
const prods = dig(vp.json, ['data', 'products']) as Array<{ id: string; name: string }>;
const PA = prods.find((p) => p.name.includes('Widget A'))!;
const PB = prods.find((p) => p.name.includes('Widget B'))!;
assert('widgets A+B found', !!PA && !!PB);

type Asg = Record<string, unknown>;
async function mkList(suffix: string, extra: Record<string, unknown> = {}) {
  const r = await api(vendor, 'POST', '/api/v1/vendor/price-lists', { name: `QA-CF-${TS}-${suffix}`, ...extra });
  return dig(r.json, ['data', 'id']) as string;
}
const L1 = await mkList('A80');        // prices Widget A
const L2 = await mkList('B150');       // prices Widget B (different product)
const L3 = await mkList('A70');        // prices Widget A too (overlap with L1)
const L4 = await mkList('Pct', { kind: 'percent', discountPercent: 10 }); // prices everything
const L5 = await mkList('HideA');      // hides Widget A (not a price)
const ALL = [L1, L2, L3, L4, L5];
assert('5 lists created', ALL.every(Boolean));

/* snapshot + clear other lists' assignments (showcase data must not pollute) */
const snap = new Map<string, Asg[]>();
{
  const all = (dig((await api(vendor, 'GET', '/api/v1/vendor/price-lists')).json, ['data']) as Array<{ id: string; assignments?: Asg[] }>) ?? [];
  for (const l of all) {
    if (ALL.includes(l.id)) continue;
    const clean: Asg[] = (l.assignments ?? []).map((a) => {
      const out: Asg = { type: a.type };
      for (const k of ['userId', 'businessAccountId', 'outletId', 'brandId', 'brandName', 'pincode', 'area', 'segment', 'groupId', 'creditStatus']) if (a[k]) out[k] = a[k];
      return out;
    });
    if (clean.length > 0) { snap.set(l.id, clean); await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${l.id}`, { assignments: [] }); }
  }
  note(`cleared assignments on ${snap.size} other list(s); restored at cleanup`);
}

async function wsVersion() {
  const r = await api(vendor, 'GET', '/api/v1/vendor/price-lists/workspace?limit=50');
  return (dig(r.json, ['data']) as { baseVersion: string | null }).baseVersion;
}
async function publishCell(listId: string, productId: string, cell: Record<string, unknown>) {
  return api(vendor, 'PATCH', '/api/v1/vendor/price-lists/workspace', {
    baseVersion: await wsVersion(), acknowledgeWarnings: true,
    cells: [{ priceListId: listId, productId, ...cell }],
  });
}
assert('publish A=80 on L1', (await publishCell(L1, PA.id, { customPrice: 80 })).status === 200);
assert('publish B=150 on L2', (await publishCell(L2, PB.id, { customPrice: 150 })).status === 200);
assert('publish A=70 on L3', (await publishCell(L3, PA.id, { customPrice: 70 })).status === 200);
assert('publish Hide A on L5', (await publishCell(L5, PA.id, { isExcluded: true })).status === 200);

const custTarget = { type: 'customer', userId: CUST };
async function assign(listId: string, resolutions?: unknown) {
  return api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${listId}`, { assignments: [custTarget], ...(resolutions ? { resolutions } : {}) });
}
async function assignmentsOf(listId: string) {
  const all = (dig((await api(vendor, 'GET', '/api/v1/vendor/price-lists')).json, ['data']) as Array<{ id: string; assignments?: Asg[] }>) ?? [];
  return all.find((l) => l.id === listId)?.assignments ?? [];
}
async function preview(listId: string) {
  const r = await api(vendor, 'POST', '/api/v1/vendor/price-lists/assignments/preview', { priceListId: listId, target: custTarget });
  return dig(r.json, ['data']) as { conflicts?: Array<{ existingPricelistId: string; productCount: number; productNames?: string[] }> } | null;
}
async function explain(productId: string) {
  const r = await api(vendor, 'GET', `/api/v1/vendor/price-lists/explain?customerId=${CUST}&productId=${productId}`);
  return dig(r.json, ['data']) as { unitPrice: number | null; priceListName?: string | null } | null;
}

/* 1. disjoint lists both assign cleanly */
assert('assign L1 (Widget A)', (await assign(L1)).status === 200);
assert('assign L2 (Widget B, different product) — no conflict', (await assign(L2)).status === 200);
{
  const effR = await api(vendor, 'GET', '/api/v1/vendor/price-lists/assignments/effective');
  const row = (dig(effR.json, ['data']) as Array<{ userId: string; effective: { lists?: Array<{ priceListId: string }> }; conflict: unknown }>).find((x) => x.userId === CUST);
  const ids = (row?.effective.lists ?? []).map((l) => l.priceListId);
  assert('customer on BOTH disjoint lists', ids.includes(L1) && ids.includes(L2), JSON.stringify(ids));
  assert('no conflict flag for disjoint lists', row?.conflict == null, JSON.stringify(row?.conflict));
  assert('price A=80 from L1', Number((await explain(PA.id))?.unitPrice) === 80, JSON.stringify(await explain(PA.id)));
  assert('price B=150 from L2', Number((await explain(PB.id))?.unitPrice) === 150);
}

/* 2. overlap: preview + blocked save */
{
  const pv = await preview(L3);
  assert('preview L3 reports conflict with L1 (1 product)', !!pv && pv.conflicts?.length === 1 && pv.conflicts[0].existingPricelistId === L1 && pv.conflicts[0].productCount === 1, JSON.stringify(pv));
  const blocked = await assign(L3);
  assert('save overlapping L3 without choice = 409', blocked.status === 409, `${blocked.status} ${blocked.text.slice(0, 200)}`);
  assert('409 code PRICE_CONFLICT', String(dig(blocked.json, ['error', 'code']) ?? dig(blocked.json, ['code']) ?? blocked.text).includes('PRICE_CONFLICT'), blocked.text.slice(0, 200));
  assert('L3 not assigned after block', (await assignmentsOf(L3)).length === 0);
}

/* 3. Skip keeps old */
{
  const r = await assign(L3, [{ userId: CUST, action: 'skip' }]);
  assert('Skip save ok', r.status === 200, `${r.status} ${r.text.slice(0, 200)}`);
  assert('Skip: L3 still not assigned', (await assignmentsOf(L3)).length === 0);
  assert('Skip: L1 still assigned', (await assignmentsOf(L1)).some((a) => a.userId === CUST));
  assert('Skip: price A still 80', Number((await explain(PA.id))?.unitPrice) === 80);
}

/* 4. Replace moves customer */
{
  const r = await assign(L3, [{ userId: CUST, action: 'replace' }]);
  assert('Replace save ok', r.status === 200, `${r.status} ${r.text.slice(0, 200)}`);
  assert('Replace: L3 assigned', (await assignmentsOf(L3)).some((a) => a.userId === CUST));
  assert('Replace: customer removed from L1', !(await assignmentsOf(L1)).some((a) => a.userId === CUST));
  assert('Replace: price A now 70 from L3', Number((await explain(PA.id))?.unitPrice) === 70, JSON.stringify(await explain(PA.id)));
}

/* 5. percent list overlaps everything priced */
{
  const pv = await preview(L4);
  assert('preview percent list conflicts (all products priced)', !!pv && (pv.conflicts?.length ?? 0) >= 1, JSON.stringify(pv));
  const blocked = await assign(L4);
  assert('percent save without choice = 409', blocked.status === 409, `${blocked.status}`);
}

/* 6. Hidden is not a price -> no conflict, and Hidden wins */
{
  const pv = await preview(L5);
  assert('preview Hide-list: no price conflict', (pv?.conflicts?.length ?? 0) === 0, JSON.stringify(pv));
  const r = await assign(L5);
  assert('assign Hide-list ok', r.status === 200, `${r.status} ${r.text.slice(0, 200)}`);
  const ex = await explain(PA.id);
  assert('Hidden wins: Widget A has no purchasable price', ex?.unitPrice == null, JSON.stringify(ex));
}

/* cleanup */
if (!KEEP) {
  for (const id of ALL) await api(vendor, 'DELETE', `/api/v1/vendor/price-lists/${id}`);
  for (const [id, asgs] of snap) await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${id}`, { assignments: asgs });
  note(`cleaned ${ALL.length} QA lists; restored ${snap.size} list assignment sets`);
} else {
  for (const [id, asgs] of snap) await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${id}`, { assignments: asgs });
  note(`--keep: left lists; restored ${snap.size} showcase assignment sets`);
}
console.log(`\n=== qa-conflict-rule: ${passes} passed, ${failures} failed ===`);
process.exit(failures > 0 ? 1 : 0);
