/* SUPERSEDED by qa-conflict-rule.mts (2026-10-22 client decision: same-product
   overlap across lists is an assignment-time conflict — Skip/Replace/Review —
   never a priority winner). The ladder-peel phases below predate that rule.
   Multi-list + precedence ladder hardcore test (Zoho model).
   5 lists, same product, different prices. Verifies:
   - same target may sit on several lists (no TARGET_BOUND any more)
   - customer on 2 lists: list priority (Move up/down) decides the winner
   - ladder: customer > group > credit_status > segment > pincode > area > base
     by peeling assignments off one layer at a time
Run: npx tsx scripts/qa-multilist-conflicts.mts [--keep]  (--keep leaves QA data) */
const KEEP = process.argv.includes('--keep');
if (KEEP) console.log('(--keep: test data will be left on the demo account)');
const BASE = 'https://demo.horeca1.com';
const TS = Date.now().toString(36).toUpperCase();
let failures = 0, passes = 0;
function assert(label: string, cond: boolean, extra?: unknown) {
  if (cond) { passes++; console.log(`PASS  ${label}`); }
  else { failures++; console.log(`FAIL  ${label}`); if (extra !== undefined) console.log('   ', String(extra).slice(0, 500)); }
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

/* product */
const vp = await api(vendor, 'GET', '/api/v1/vendor/products?limit=100');
const widget = (dig(vp.json, ['data', 'products']) as Array<{ id: string; name: string; basePrice: unknown }>).find((p) => p.name.includes('Widget A'))!;
const PID = widget.id;
const BASE_PRICE = Number(widget.basePrice);

/* demo customer universe facts (outlet pincode/city, credit, tags) */
const eff = await api(vendor, 'GET', '/api/v1/vendor/price-lists/assignments/effective');
const uni = (dig(eff.json, ['data']) as Array<{ userId: string; pincodes?: string[]; cities?: string[]; creditStatus?: string | null; tags?: string[] }>).find((x) => x.userId === CUST);
note(`universe: ${JSON.stringify(uni)}`);
const PIN = uni?.pincodes?.[0];
const CITY = uni?.cities?.[0];
const CREDIT = uni?.creditStatus ?? null;
const TAG = uni?.tags?.[0];
assert('demo customer has outlet pincode', !!PIN, JSON.stringify(uni?.pincodes));
assert('demo customer has outlet city', !!CITY, JSON.stringify(uni?.cities));

/* create 5 lists */
type Asg = Record<string, unknown>;
async function mkList(suffix: string) {
  const r = await api(vendor, 'POST', '/api/v1/vendor/price-lists', { name: `QA-MC-${TS}-${suffix}` });
  return dig(r.json, ['data', 'id']) as string;
}
const LA = await mkList('Cust');   // customer layer  ₹95
const LB = await mkList('Group');  // group layer     ₹94
const LC = await mkList('Pin');    // pincode layer   ₹91
const LD = await mkList('Area');   // area layer      ₹90
const LE = await mkList('Extra');  // credit/segment  ₹92/₹93
const ALL = [LA, LB, LC, LD, LE];
assert('5 lists created', ALL.every(Boolean));

/* Showcase data (QA-SHOW etc, left on demo on purpose) also targets this
   customer and would pollute the ladder. Snapshot every other list's
   assignments, clear them for the run, restore at cleanup. */
type RawAsg = Record<string, unknown>;
const snap = new Map<string, Asg[]>();
{
  const all = (dig((await api(vendor, 'GET', '/api/v1/vendor/price-lists')).json, ['data']) as Array<{ id: string; assignments?: RawAsg[] }>) ?? [];
  for (const l of all) {
    if (ALL.includes(l.id)) continue;
    const clean: Asg[] = (l.assignments ?? []).map((a) => {
      const out: Asg = { type: a.type };
      for (const k of ['userId', 'businessAccountId', 'outletId', 'brandId', 'brandName', 'pincode', 'area', 'segment', 'groupId', 'creditStatus']) {
        if (a[k]) out[k] = a[k];
      }
      return out;
    });
    if (clean.length > 0) {
      snap.set(l.id, clean);
      await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${l.id}`, { assignments: [] });
    }
  }
  note(`temporarily cleared assignments on ${snap.size} showcase/other list(s); will restore`);
}

async function wsVersion() {
  const r = await api(vendor, 'GET', '/api/v1/vendor/price-lists/workspace?limit=50');
  return (dig(r.json, ['data']) as { baseVersion: string | null }).baseVersion;
}
async function publish(listId: string, price: number) {
  const r = await api(vendor, 'PATCH', '/api/v1/vendor/price-lists/workspace', {
    baseVersion: await wsVersion(), acknowledgeWarnings: true,
    cells: [{ priceListId: listId, productId: PID, customPrice: price }],
  });
  return r;
}
for (const [l, p] of [[LA, 95], [LB, 94], [LC, 91], [LD, 90], [LE, 93]] as const) {
  const r = await publish(l, p);
  assert(`publish ₹${p} on list`, r.status === 200, `${r.status} ${r.text.slice(0, 200)}`);
}
/* workspace shows all 5 columns with distinct prices */
{
  const r = await api(vendor, 'GET', '/api/v1/vendor/price-lists/workspace?limit=50');
  const row = (dig(r.json, ['data', 'products']) as Array<{ id: string; cells: Record<string, { price: number | null } | null> }>).find((p) => p.id === PID);
  const prices = [LA, LB, LC, LD, LE].map((l) => row?.cells[l]?.price);
  assert('grid row has 5 distinct list prices 95/94/91/90/93', JSON.stringify(prices) === JSON.stringify([95, 94, 91, 90, 93]), JSON.stringify(prices));
}

const setAsg = (listId: string, assignments: Asg[], resolutions?: unknown) =>
  api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${listId}`, { assignments, ...(resolutions ? { resolutions } : {}) });
async function listAsg(listId: string) {
  const r = await api(vendor, 'GET', `/api/v1/vendor/price-lists/${listId}`);
  return (dig(r.json, ['data', 'assignments']) as Array<Record<string, unknown>>) ?? [];
}
async function explain() {
  const r = await api(vendor, 'GET', `/api/v1/vendor/price-lists/explain?customerId=${CUST}&productId=${PID}`);
  const d = dig(r.json, ['data']) as { unitPrice?: number; source?: string; priceListName?: string };
  return d;
}

/* ---------- Phase 1: same target on several lists ---------- */
console.log('\n== Phase 1: same target on several lists (allowed) ==');
let r = await setAsg(LC, [{ type: 'pincode', pincode: PIN }]);
assert('pincode -> LC 200', r.status === 200, r.text.slice(0, 200));
r = await setAsg(LA, [{ type: 'pincode', pincode: PIN }]);
assert('same pincode -> LA ALSO 200 (multi-list)', r.status === 200, `${r.status} ${r.text.slice(0, 250)}`);
assert('pincode held by BOTH LC and LA', (await listAsg(LC)).some((a) => a.type === 'pincode') && (await listAsg(LA)).some((a) => a.type === 'pincode'));
await setAsg(LA, []);

r = await setAsg(LD, [{ type: 'area', area: CITY }]);
assert('area -> LD 200', r.status === 200, r.text.slice(0, 200));
r = await setAsg(LB, [{ type: 'area', area: CITY }]);
assert('same area -> LB ALSO 200 (multi-list)', r.status === 200, `${r.status} ${r.text.slice(0, 200)}`);
assert('area held by BOTH LD and LB', (await listAsg(LD)).some((a) => a.type === 'area') && (await listAsg(LB)).some((a) => a.type === 'area'));
await setAsg(LB, []);

/* ---------- Phase 2: customer on two lists + priority winner ---------- */
console.log('\n== Phase 2: customer on 2 lists (priority winner) ==');
r = await setAsg(LA, [{ type: 'customer', userId: CUST }]);
assert('customer -> LA 200', r.status === 200);
r = await setAsg(LB, [{ type: 'customer', userId: CUST }], [{ userId: CUST, action: 'skip' }]);
assert('customer -> LB ALSO 200 (skip ignored)', r.status === 200, r.text.slice(0, 200));
assert('customer on BOTH LA and LB', (await listAsg(LA)).some((a) => a.type === 'customer') && (await listAsg(LB)).some((a) => a.type === 'customer'));
{
  const e = await explain();
  assert('tie (priority 0): older LA wins ₹95 via customer', e.unitPrice === 95 && (e.source ?? '').includes('customer'), JSON.stringify(e));
  const effR = await api(vendor, 'GET', '/api/v1/vendor/price-lists/assignments/effective');
  const me = (dig(effR.json, ['data']) as Array<{ userId: string; effective: { lists?: Array<{ priceListName: string }> } }>).find((x) => x.userId === CUST);
  assert('effective.lists shows both lists for customer', (me?.effective.lists?.length ?? 0) >= 2, JSON.stringify(me?.effective).slice(0, 300));
}
// Move LB up: LB priority 0, LA priority 5 -> LB price wins
await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${LA}`, { priority: 5 });
{
  const e = await explain();
  assert('LB moved up: LB wins ₹94 via customer', e.unitPrice === 94 && (e.source ?? '').includes('customer'), JSON.stringify(e));
}
await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${LA}`, { priority: 0 });
await setAsg(LB, []);

/* ---------- Phase 3: precedence ladder peel-off ---------- */
console.log('\n== Phase 3: ladder customer > group > credit/segment > pincode > area > base ==');
const grp = await api(vendor, 'POST', '/api/v1/vendor/customer-groups', { name: `QA-MC-${TS}-Grp`, members: [{ userId: CUST }] });
const GID = dig(grp.json, ['data', 'id']) as string;
assert('group created', grp.status === 201 && !!GID);
await setAsg(LB, [{ type: 'group', groupId: GID }]);
// LC already has pincode, LD already has area, LA already has customer
{
  const e = await explain();
  assert('layer 1: CUSTOMER wins ₹95', e.unitPrice === 95 && (e.source ?? '').includes('customer'), JSON.stringify(e));
}
await setAsg(LA, []); // remove customer layer
{
  const e = await explain();
  assert('layer 2: GROUP wins ₹94', e.unitPrice === 94 && (e.source ?? '').includes('group'), JSON.stringify(e));
}
await setAsg(LB, []); // remove group layer
if (CREDIT) {
  await setAsg(LE, [{ type: 'credit_status', creditStatus: CREDIT }]);
  const e = await explain();
  assert(`layer 3: CREDIT_STATUS (${CREDIT}) wins ₹93`, e.unitPrice === 93 && (e.source ?? '').includes('credit'), JSON.stringify(e));
  await setAsg(LE, []);
} else note('no creditStatus on demo customer — credit layer skipped');
if (TAG) {
  await setAsg(LE, [{ type: 'segment', segment: TAG }]);
  const pub = await publish(LE, 92);
  assert('segment list price re-published ₹92', pub.status === 200);
  const e = await explain();
  assert(`layer 4: SEGMENT (${TAG}) wins ₹92`, e.unitPrice === 92 && (e.source ?? '').includes('segment'), JSON.stringify(e));
  await setAsg(LE, []);
} else note('demo customer has no tags — segment layer skipped');
{
  const e = await explain();
  assert('layer 5: PINCODE wins ₹91', e.unitPrice === 91 && (e.source ?? '').includes('pincode'), JSON.stringify(e));
}
await setAsg(LC, []); // remove pincode layer
{
  const e = await explain();
  assert('layer 6: AREA wins ₹90', e.unitPrice === 90 && (e.source ?? '').includes('area'), JSON.stringify(e));
}
await setAsg(LD, []); // remove area layer
{
  const e = await explain();
  assert('layer 7: back to BASE', e.unitPrice === BASE_PRICE && (e.source ?? '') === 'base-price', JSON.stringify(e));
}

/* cleanup */
console.log('\n== cleanup ==');
for (const [listId, assignments] of snap) {
  const r = await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${listId}`, { assignments });
  note(`restored assignments on ${listId.slice(0, 8)} -> ${r.status}`);
}
if (KEEP) {
  note('KEEP mode: QA-MC lists/group left on demo account on purpose');
} else {
  for (const l of ALL) await api(vendor, 'DELETE', `/api/v1/vendor/price-lists/${l}`);
  if (GID) await api(vendor, 'DELETE', `/api/v1/vendor/customer-groups/${GID}`);
  const after = (dig((await api(vendor, 'GET', '/api/v1/vendor/price-lists')).json, ['data']) as Array<{ name: string }>) ?? [];
  assert('no QA-MC lists left active', !after.some((l) => l.name.includes(`QA-MC-${TS}`)), after.map((l) => l.name).join('|'));
}
console.log(`\n==== MULTILIST RESULT: ${passes} passed, ${failures} failed ====`);
process.exit(failures === 0 ? 0 : 1);
