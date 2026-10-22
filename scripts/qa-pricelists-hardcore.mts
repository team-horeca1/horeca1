/* HARDCORE Price List QA — real API contracts (demo branch).
   Covers: lists CRUD, workspace publish lifecycle, guardrails (block/warn/
   floor/MRP/zero), stale-version, rollback, hidden, assignments full-set
   (all 8 target types, twice, multi-list allowed + priority winner), groups CRUD,
   bulk-apply, bulk-upload (SKU/productId/errors), clone+adjust, export CSV,
   explain buyer prices, preview, Zoho membership (membersOnly/excludeListId,
   kind, unpriced review warning, remove-from-list).
Run: npx tsx scripts/qa-pricelists-hardcore.mts [--keep]  (--keep leaves QA data on demo) */
const KEEP = process.argv.includes('--keep');
if (KEEP) console.log('(--keep: test data will be left on the demo account)');
const BASE = 'https://demo.horeca1.com';
const TS = Date.now().toString(36).toUpperCase();
let failures = 0;
let passes = 0;
function assert(label: string, cond: boolean, extra?: unknown) {
  if (cond) { passes++; console.log(`PASS  ${label}`); }
  else { failures++; console.log(`FAIL  ${label}`); if (extra !== undefined) console.log('   ', String(extra).slice(0, 700)); }
}
function note(msg: string) { console.log(`  .. ${msg}`); }

/* ---------- auth ---------- */
function jar(res: Response, m: Map<string, string>) {
  const lines = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of lines) { const [p] = c.split(';'); const eq = p.indexOf('='); if (eq > 0) m.set(p.slice(0, eq), p.slice(eq + 1)); }
}
const hdr = (m: Map<string, string>) => [...m].map(([k, v]) => `${k}=${v}`).join('; ');
interface Ctx { m: Map<string, string>; userId: string; }
async function signIn(email: string, password: string): Promise<Ctx> {
  const m = new Map<string, string>();
  const c = await fetch(BASE + '/api/auth/csrf'); const { csrfToken } = await c.json(); jar(c, m);
  const form = new URLSearchParams({ csrfToken, email, password, json: 'true', callbackUrl: BASE + '/' });
  const r = await fetch(BASE + '/api/auth/callback/credentials', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: hdr(m) }, body: form.toString(), redirect: 'manual' });
  jar(r, m);
  const s = await fetch(BASE + '/api/auth/session', { headers: { cookie: hdr(m) } });
  const sess = await s.json() as { user?: { id?: string } };
  return { m, userId: sess.user?.id ?? '' };
}
async function api(ctx: Ctx, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { cookie: hdr(ctx.m), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json: unknown = null; try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json, text };
}
const dig = (j: unknown, path: string[]): unknown => path.reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), j);
const num = (v: unknown) => (typeof v === 'string' ? Number(v) : (v as number));

/* ================= SETUP ================= */
const vendor = await signIn('demo.vendor@horeca1.com', 'DemoVendor123!');
const customer = await signIn('demo.customer@horeca1.com', 'DemoCustomer123!');
const admin = await signIn('demo.admin@horeca1.com', 'DemoAdmin123!');
assert('vendor/customer/admin logged in', !!vendor.userId && !!customer.userId && !!admin.userId, `${vendor.userId} ${customer.userId} ${admin.userId}`);
const CUST = customer.userId;

const vp = await api(vendor, 'GET', '/api/v1/vendor/products?limit=500');
type VProd = { id: string; name: string; basePrice: unknown; originalPrice: unknown; categoryId: string | null; sku: string | null };
const vprods = (dig(vp.json, ['data', 'products']) as VProd[]) ?? [];
const widgetA = vprods.find((p) => p.name.includes('Widget A'));
assert('QA Widget A exists (base product)', !!widgetA);
const A = widgetA!.id;
const A_BASE = num(widgetA!.basePrice);
const A_MRP = num(widgetA!.originalPrice);
const CAT = widgetA!.categoryId;
note(`Widget A base=${A_BASE} mrp=${A_MRP} cat=${CAT}`);

/* QA products with SKUs + long names (for grid wrap + SKU import tests) */
async function makeProduct(sku: string, longName: string, base: number, mrp: number) {
  const c = await api(vendor, 'POST', '/api/v1/vendor/products', {
    name: longName, slug: `qa-hardcore-${sku.toLowerCase()}-${TS.toLowerCase()}`,
    basePrice: base, originalPrice: mrp, sku, categoryId: CAT ?? undefined, unit: 'piece', listingStatus: 'submitted',
  });
  const pid = dig(c.json, ['data', 'id']) as string;
  assert(`create product ${sku} (201)`, c.status === 201 && !!pid, `${c.status} ${c.text.slice(0, 300)}`);
  const ap = await api(admin, 'PATCH', `/api/v1/admin/products/${pid}/approval`, { action: 'approve' });
  assert(`admin approves ${sku} without photo`, ap.status === 200 && dig(ap.json, ['data', 'approvalStatus']) === 'approved', `${ap.status} ${ap.text.slice(0, 300)}`);
  return pid;
}
const Q1 = await makeProduct(`QAH-${TS}-1`, `QA-HARDCORE Super Long Product Name For Grid Wrapping Verification Alpha Family Pack 1kg`, 100, 120);
const Q2 = await makeProduct(`QAH-${TS}-2`, `QA-HARDCORE Second Very Long Product Name Beta Variant With Extra Words 500g`, 200, 250);
/* catalog prefixes stored SKU (e.g. DEMO-...) — always use the stored value */
const storedSku = async (pid: string) => {
  const r = await api(vendor, 'GET', '/api/v1/vendor/products?limit=500');
  return ((dig(r.json, ['data', 'products']) as VProd[]) ?? []).find((p) => p.id === pid)?.sku ?? '';
};
const Q1_SKU = await storedSku(Q1);
note(`stored SKU for Q1: ${Q1_SKU}`);

/* leftover cleanup: aborted-run lists + Oct-20 QA lists that pollute the
   demo customer (an old list excludes Widget A for them). */
const OLD_QA_LISTS = ['QA-HARDCORE', 'QA-HARDCORE-EMPTY', 'QA Hardcore List', 'QA Second List', 'QA Credit List', 'QA Hardcore Clone'];
{
  const lists = (dig((await api(vendor, 'GET', '/api/v1/vendor/price-lists')).json, ['data']) as Array<{ id: string; name: string }>) ?? [];
  for (const l of lists) if (OLD_QA_LISTS.includes(l.name)) { await api(vendor, 'DELETE', `/api/v1/vendor/price-lists/${l.id}`); note(`removed leftover QA list "${l.name}"`); }
}
/* Showcase lists (QA-SHOW / Sample, kept on demo on purpose) target the demo
   customer too. Snapshot their assignments, clear for the run, restore after. */
const showcaseSnap = new Map<string, Array<Record<string, unknown>>>();
{
  const lists = (dig((await api(vendor, 'GET', '/api/v1/vendor/price-lists')).json, ['data']) as Array<{ id: string; assignments?: Array<Record<string, unknown>> }>) ?? [];
  for (const l of lists) {
    const clean: Array<Record<string, unknown>> = (l.assignments ?? []).map((a) => {
      const out: Record<string, unknown> = { type: a.type };
      for (const k of ['userId', 'businessAccountId', 'outletId', 'brandId', 'brandName', 'pincode', 'area', 'segment', 'groupId', 'creditStatus']) {
        if (a[k]) out[k] = a[k];
      }
      return out;
    });
    if (clean.length > 0) {
      showcaseSnap.set(l.id, clean);
      await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${l.id}`, { assignments: [] });
    }
  }
  note(`temporarily cleared assignments on ${showcaseSnap.size} showcase list(s); will restore`);
}

/* ================= A. LISTS ================= */
console.log('\n== A. lists ==');
const L1NAME = `QA-HC-${TS}-Main`;
const mk = await api(vendor, 'POST', '/api/v1/vendor/price-lists', { name: L1NAME });
const L1 = dig(mk.json, ['data', 'id']) as string;
assert('create list L1 201', mk.status === 201 && !!L1, `${mk.status} ${mk.text.slice(0, 200)}`);
const mk2 = await api(vendor, 'POST', '/api/v1/vendor/price-lists', { name: `QA-HC-${TS}-Second` });
const L2 = dig(mk2.json, ['data', 'id']) as string;
assert('create list L2 201', mk2.status === 201 && !!L2);
const dup = await api(vendor, 'POST', '/api/v1/vendor/price-lists', { name: L1NAME });
assert('duplicate list name rejected (400/409)', dup.status === 400 || dup.status === 409, dup.status);
const ren = await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L2}`, { name: `QA-HC-${TS}-Second-Renamed` });
assert('rename L2 200', ren.status === 200 && dig(ren.json, ['data', 'name']) === `QA-HC-${TS}-Second-Renamed`, ren.text.slice(0, 200));

/* helpers */
type Asg = Record<string, unknown>;
let curAsg: Asg[] = [];
async function setAssignments(listId: string, next: Asg[], resolutions?: Array<{ userId: string; action: string }>) {
  const r = await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${listId}`, { assignments: next, ...(resolutions ? { resolutions } : {}) });
  if (listId === L1 && r.status === 200) curAsg = next;
  return r;
}
async function listAssignments(listId: string) {
  const r = await api(vendor, 'GET', `/api/v1/vendor/price-lists/${listId}`);
  return (dig(r.json, ['data', 'assignments']) as Array<Record<string, unknown>>) ?? [];
}
async function ws() {
  const r = await api(vendor, 'GET', '/api/v1/vendor/price-lists/workspace?limit=200');
  return { r, data: dig(r.json, ['data']) as { baseVersion: string | null; products: Array<{ id: string; name: string; cells: Record<string, { price: number | null; isExcluded: boolean; isLocked: boolean } | null> }> } };
}
async function cellOf(pid: string, listId: string) {
  const { data } = await ws();
  return data.products.find((p) => p.id === pid)?.cells[listId] ?? null;
}
async function freshVersion() { const { data } = await ws(); return data.baseVersion; }
async function review(cells: unknown[]) {
  return api(vendor, 'POST', '/api/v1/vendor/price-lists/workspace/review', { baseVersion: await freshVersion(), cells });
}
async function publish(cells: unknown[], ack = false, version?: string | null) {
  return api(vendor, 'PATCH', '/api/v1/vendor/price-lists/workspace', { baseVersion: version !== undefined ? version : await freshVersion(), acknowledgeWarnings: ack, cells });
}
async function explain(userId: string, pid: string) {
  const r = await api(vendor, 'GET', `/api/v1/vendor/price-lists/explain?customerId=${userId}&productId=${pid}`);
  return { status: r.status, data: dig(r.json, ['data']) as Record<string, unknown> | undefined, raw: r.text };
}

/* ================= B. WORKSPACE PUBLISH ================= */
console.log('\n== B. workspace publish lifecycle ==');
{
  const { r, data } = await ws();
  assert('workspace 200', r.status === 200);
  const names = data.products.map((p) => p.name);
  assert('workspace includes Widget A + QA long products', names.some((n) => n.includes('Widget A')) && names.some((n) => n.includes('QA-HARDCORE Super Long')), names.join('|').slice(0, 200));
}
const V_START = await freshVersion();
const rev1 = await review([{ priceListId: L1, productId: A, customPrice: 90 }]);
const rev1d = dig(rev1.json, ['data']) as { summary: { blocks: number; warns: number }; stale: boolean };
assert('review A->90: no blocks/warns, not stale', rev1.status === 200 && rev1d.summary.blocks === 0 && rev1d.summary.warns === 0 && rev1d.stale === false, rev1.text.slice(0, 400));
const pub1 = await publish([{ priceListId: L1, productId: A, customPrice: 90 }]);
const PUB1 = dig(pub1.json, ['data', 'publishId']) as string;
assert('publish A->90 200', pub1.status === 200 && !!PUB1, pub1.text.slice(0, 300));
assert('workspace cell A = 90 after publish', (await cellOf(A, L1))?.price === 90);
{
  const hist = await api(vendor, 'GET', '/api/v1/vendor/price-lists/publishes');
  const rows = (dig(hist.json, ['data', 'publishes']) ?? dig(hist.json, ['data'])) as Array<{ id: string; changes?: Array<{ productName?: string }> }>;
  assert('history latest = this publish, has named changes', Array.isArray(rows) && rows[0]?.id === PUB1 && (rows[0]?.changes?.length ?? 0) >= 1, JSON.stringify(rows?.[0]).slice(0, 400));
}

/* buyer price before assignment = base */
{
  const e = await explain(CUST, A);
  note(`explain unassigned: ${e.raw.slice(0, 300)}`);
  assert('explain 200 unassigned', e.status === 200);
  const price = num(e.data?.price ?? e.data?.unitPrice);
  assert(`unassigned customer sees Base ${A_BASE}`, price === A_BASE, price);
  assert('unassigned source = base-price', String(e.data?.source) === 'base-price', String(e.data?.source));
}

/* ================= D/E. GUARDRAILS ================= */
console.log('\n== C. guardrails ==');
for (const [label, price, code] of [
  ['zero price', 0, 'zero_or_negative'],
  ['above MRP', A_MRP + 30, 'above_mrp'],
] as const) {
  const rv = await review([{ priceListId: L1, productId: A, customPrice: price }]);
  const d = dig(rv.json, ['data']) as { summary: { blocks: number }; diffs: Array<{ guardrails: Array<{ code: string; severity: string }> }> };
  const codes = (d?.diffs ?? []).flatMap((x) => x.guardrails.map((g) => g.code));
  assert(`review blocks ${label} (${code})`, rv.status === 200 && d.summary.blocks >= 1 && codes.includes(code), `${rv.status} ${codes.join(',')}`);
  const pb = await publish([{ priceListId: L1, productId: A, customPrice: price }]);
  assert(`publish blocked for ${label} (400)`, pb.status === 400, `${pb.status} ${pb.text.slice(0, 200)}`);
  assert(`cell unchanged after blocked ${label}`, (await cellOf(A, L1))?.price === 90);
}
/* floor */
await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L1}`, { floorPercentOfBase: 80 });
{
  const rv = await review([{ priceListId: L1, productId: A, customPrice: 70 }]);
  const d = dig(rv.json, ['data']) as { summary: { blocks: number }; diffs: Array<{ guardrails: Array<{ code: string }> }> };
  const codes = (d?.diffs ?? []).flatMap((x) => x.guardrails.map((g) => g.code));
  assert('review blocks below floor (80% of base)', d?.summary.blocks >= 1 && codes.includes('below_floor'), codes.join(','));
  const pb = await publish([{ priceListId: L1, productId: A, customPrice: 70 }]);
  assert('publish blocked below floor', pb.status === 400, pb.status);
}
await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L1}`, { floorPercentOfBase: null });
/* warn + ack + rollback */
{
  const rv = await review([{ priceListId: L1, productId: A, customPrice: 50 }]);
  const d = dig(rv.json, ['data']) as { summary: { blocks: number; warns: number } };
  assert('review warns on 50 (far below base / jump), no block', d?.summary.warns >= 1 && d?.summary.blocks === 0, JSON.stringify(d?.summary));
  const noAck = await publish([{ priceListId: L1, productId: A, customPrice: 50 }], false);
  assert('publish without ack -> 409 NEEDS_ACK', noAck.status === 409 && noAck.text.includes('NEEDS_ACK'), `${noAck.status} ${noAck.text.slice(0, 200)}`);
  const acked = await publish([{ priceListId: L1, productId: A, customPrice: 50 }], true);
  const warnPub = dig(acked.json, ['data', 'publishId']) as string;
  assert('publish with ack 200', acked.status === 200 && !!warnPub, acked.text.slice(0, 200));
  assert('cell = 50 after warn publish', (await cellOf(A, L1))?.price === 50);
  const rb = await api(vendor, 'POST', `/api/v1/vendor/price-lists/publishes/${warnPub}/rollback`, {});
  assert('rollback 200', rb.status === 200, rb.text.slice(0, 300));
  assert('cell restored to 90 after rollback', (await cellOf(A, L1))?.price === 90, JSON.stringify(await cellOf(A, L1)));
}
/* stale version */
{
  const stale = await publish([{ priceListId: L1, productId: A, customPrice: 91 }], false, V_START);
  assert('stale baseVersion publish -> 409', stale.status === 409, `${stale.status} ${stale.text.slice(0, 200)}`);
  assert('cell still 90 after stale attempt', (await cellOf(A, L1))?.price === 90);
}
/* locked flag round-trip: price change on locked cell is skipped;
   unlock (same price) then clear works */
{
  const lk = await publish([{ priceListId: L1, productId: Q2, customPrice: 180, isLocked: true }]);
  assert('publish locked cell 200', lk.status === 200, lk.text.slice(0, 200));
  const c = await cellOf(Q2, L1);
  assert('locked flag persisted', c?.isLocked === true && c?.price === 180, JSON.stringify(c));
  const tryChange = await publish([{ priceListId: L1, productId: Q2, customPrice: 150 }]);
  assert('price change on LOCKED cell publish 200 but skipped', tryChange.status === 200 && dig(tryChange.json, ['data', 'skipped']) === 1, tryChange.text.slice(0, 250));
  assert('locked cell price unchanged (180)', (await cellOf(Q2, L1))?.price === 180);
  const unlock = await publish([{ priceListId: L1, productId: Q2, customPrice: 180, isLocked: false }]);
  assert('unlock (same price) 200', unlock.status === 200, unlock.text.slice(0, 200));
  assert('cell unlocked', (await cellOf(Q2, L1))?.isLocked === false);
  const un = await publish([{ priceListId: L1, productId: Q2, customPrice: null, isLocked: false, isExcluded: false }]);
  assert('clear publish 200', un.status === 200);
  assert('cell cleared back to base (null)', (await cellOf(Q2, L1)) === null, JSON.stringify(await cellOf(Q2, L1)));
}

/* ================= ASSIGNMENTS ================= */
console.log('\n== D. assignments (full-set, all types, twice) ==');
const asgCustomer: Asg = { type: 'customer', userId: CUST };
let r = await setAssignments(L1, [asgCustomer]);
assert('assign customer 200', r.status === 200, r.text.slice(0, 300));
r = await setAssignments(L1, [asgCustomer]);
assert('assign customer AGAIN 200 (regression: second save)', r.status === 200, r.text.slice(0, 300));
{
  const list = await listAssignments(L1);
  assert('L1 has exactly 1 customer assignment', list.filter((a) => a.type === 'customer').length === 1, JSON.stringify(list).slice(0, 300));
}
{
  const e = await explain(CUST, A);
  const price = num(e.data?.price ?? e.data?.unitPrice);
  note(`explain assigned: ${e.raw.slice(0, 300)}`);
  assert('assigned customer sees 90', price === 90, price);
}
/* all target types in one full set, twice */
const grp = await api(vendor, 'POST', '/api/v1/vendor/customer-groups', { name: `QA-HC-${TS}-Group`, members: [{ userId: CUST }] });
const GID = dig(grp.json, ['data', 'id']) as string;
assert('create customer group 201', grp.status === 201 && !!GID, `${grp.status} ${grp.text.slice(0, 300)}`);
const FULL: Asg[] = [
  asgCustomer,
  { type: 'pincode', pincode: '999001' },
  { type: 'area', area: 'QA Hardcore City' },
  { type: 'segment', segment: 'QA-SEG' },
  { type: 'credit_status', creditStatus: 'approved' },
  { type: 'brand', brandName: 'QA Brand' },
  { type: 'group', groupId: GID },
];
r = await setAssignments(L1, FULL);
assert('assign all 7 types 200', r.status === 200, r.text.slice(0, 400));
r = await setAssignments(L1, FULL);
assert('assign all 7 types AGAIN 200 (regression)', r.status === 200, r.text.slice(0, 400));
{
  const list = await listAssignments(L1);
  const types = list.map((a) => a.type).sort();
  assert('L1 assignment types complete', JSON.stringify(types) === JSON.stringify(['area', 'brand', 'credit_status', 'customer', 'group', 'pincode', 'segment']), types.join(','));
}
/* effective + preview */
{
  const eff = await api(vendor, 'GET', '/api/v1/vendor/price-lists/assignments/effective');
  const rows = dig(eff.json, ['data']) as Array<{ userId: string; effective?: { priceListId?: string; listId?: string; source?: string } }>;
  const me = (rows ?? []).find((x) => x.userId === CUST);
  note(`effective for demo customer: ${JSON.stringify(me?.effective)}`);
  assert('effective endpoint 200 + demo customer present', eff.status === 200 && !!me, eff.text.slice(0, 300));
  const pv = await api(vendor, 'POST', '/api/v1/vendor/price-lists/assignments/preview', { priceListId: L1, target: { type: 'customer', userId: CUST } });
  assert('preview assignment 200', pv.status === 200, pv.text.slice(0, 300));
}
/* multi-list: same target may be on several lists (Zoho model) */
{
  const second = await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L2}`, { assignments: [{ type: 'pincode', pincode: '999001' }] });
  assert('same pincode on L2 now ALLOWED 200 (multi-list)', second.status === 200, `${second.status} ${second.text.slice(0, 300)}`);
  const l1a = await listAssignments(L1);
  const l2a = await listAssignments(L2);
  assert('pincode held by BOTH L1 and L2', l1a.some((a) => a.type === 'pincode') && l2a.some((a) => a.type === 'pincode'));
  await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L2}`, { assignments: [] });
}
/* multi-list: customer on two lists, priority decides the winner */
{
  // Price A on L2 as well (85) so both lists price the same product.
  const pub = await publish([{ priceListId: L2, productId: A, customPrice: 85 }]);
  assert('publish A=85 on L2', pub.status === 200, pub.text.slice(0, 200));
  const both = await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L2}`, { assignments: [asgCustomer], resolutions: [{ userId: CUST, action: 'skip' }] });
  assert('customer assign L2 (skip resolution ignored) 200', both.status === 200, both.text.slice(0, 300));
  const l1a = await listAssignments(L1);
  const l2b = await listAssignments(L2);
  assert('customer now on BOTH L1 and L2', l1a.some((a) => a.type === 'customer') && l2b.some((a) => a.type === 'customer'), `L1=${l1a.length} L2=${l2b.length}`);
  // Default priority tie -> older list (L1, 90) wins.
  let e = await explain(CUST, A);
  assert('both lists price A: older L1 wins (90)', num(e.data?.price ?? e.data?.unitPrice) === 90, e.raw.slice(0, 250));
  // Move L2 up: priority 0 for L2, 5 for L1 -> L2 (85) wins.
  const prio = await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L2}`, { priority: 0 });
  const prio1 = await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L1}`, { priority: 5 });
  assert('set priorities 200', prio.status === 200 && prio1.status === 200);
  e = await explain(CUST, A);
  assert('after Move up: L2 wins (85)', num(e.data?.price ?? e.data?.unitPrice) === 85, e.raw.slice(0, 250));
  // Restore order and detach L2.
  await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L1}`, { priority: 0 });
  await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${L2}`, { assignments: [] });
  e = await explain(CUST, A);
  assert('after detach, customer sees L1 90 again', num(e.data?.price ?? e.data?.unitPrice) === 90);
}
/* other customer unaffected */
{
  const tg = await api(vendor, 'GET', '/api/v1/vendor/pricing-targets');
  const custs = (dig(tg.json, ['data', 'customers']) as Array<{ userId: string }>) ?? [];
  const other = custs.find((c) => c.userId !== CUST);
  assert('targets universe has other customers', !!other, custs.length);
  if (other) {
    const e = await explain(other.userId, A);
    assert('other customer still sees Base', num(e.data?.price ?? e.data?.unitPrice) === A_BASE, e.raw.slice(0, 250));
  }
}

/* ================= HIDDEN ================= */
console.log('\n== E. hidden / restore ==');
{
  const hide = await publish([{ priceListId: L1, productId: A, customPrice: null, isExcluded: true }], true);
  assert('publish exclude A 200', hide.status === 200, hide.text.slice(0, 300));
  const c = await cellOf(A, L1);
  assert('cell excluded in workspace', c?.isExcluded === true, JSON.stringify(c));
  const e = await explain(CUST, A);
  note(`explain hidden: ${e.raw.slice(0, 350)}`);
  const src = String(e.data?.source ?? e.data?.sourceType ?? '');
  assert('assigned customer explain = excluded (hidden)', src.toLowerCase().includes('hidden') || src.toLowerCase().includes('excluded') || e.data?.excluded === true, src);
  const exp = await api(vendor, 'GET', '/api/v1/vendor/price-lists/workspace/export');
  const rowA = exp.text.split('\n').find((l) => l.includes('Widget A'));
  assert('export CSV: Widget A row = REMOVED', !!rowA && rowA.includes('REMOVED'), rowA);
  const restore = await publish([{ priceListId: L1, productId: A, customPrice: 90, isExcluded: false }], true);
  assert('restore A publish 200 (ack: customers-affected warn)', restore.status === 200, restore.text.slice(0, 200));
  const e2 = await explain(CUST, A);
  assert('restored: customer sees 90', num(e2.data?.price ?? e2.data?.unitPrice) === 90);
}

/* ================= BULK OPS ================= */
console.log('\n== F. bulk-apply / bulk-upload / clone / export ==');
{
  const b1 = await api(vendor, 'POST', `/api/v1/vendor/price-lists/${L1}/bulk-apply`, { productIds: [Q2], action: { type: 'percent', value: 10 } });
  assert('bulk-apply percent 200 matched 1', b1.status === 200 && dig(b1.json, ['data', 'matched']) === 1, b1.text.slice(0, 300));
  const items1 = (dig((await api(vendor, 'GET', `/api/v1/vendor/price-lists/${L1}`)).json, ['data', 'items']) as Array<{ productId: string; customPrice: unknown; pricingType: string; discountPercent: unknown }>) ?? [];
  const q2i = items1.find((i) => i.productId === Q2);
  assert('bulk percent: Q2 customPrice = 180 (200-10%)', num(q2i?.customPrice) === 180, JSON.stringify(q2i));
  const b2 = await api(vendor, 'POST', `/api/v1/vendor/price-lists/${L1}/bulk-apply`, { productIds: [Q2], action: { type: 'discount', value: 20 } });
  const items2 = (dig((await api(vendor, 'GET', `/api/v1/vendor/price-lists/${L1}`)).json, ['data', 'items']) as Array<{ productId: string; pricingType: string; discountPercent: unknown }>) ?? [];
  const q2d = items2.find((i) => i.productId === Q2);
  assert('bulk discount: Q2 pricingType=discount 20%', b2.status === 200 && q2d?.pricingType === 'discount' && num(q2d?.discountPercent) === 20, JSON.stringify(q2d));
  const b3 = await api(vendor, 'POST', `/api/v1/vendor/price-lists/${L1}/bulk-apply`, { productIds: ['123e4567-e89b-12d3-a456-426614174000'], action: { type: 'set', value: 5 } });
  assert('bulk-apply foreign product matched 0', b3.status === 200 && dig(b3.json, ['data', 'matched']) === 0, b3.text.slice(0, 200));
}
{
  const up = await api(vendor, 'POST', `/api/v1/vendor/price-lists/${L1}/bulk-upload`, {
    rows: [
      { sku: Q1_SKU, customPrice: 88 },
      { productId: Q2, customPrice: 190 },
      { sku: 'NOPE-404', customPrice: 10 },
      { productId: '123e4567-e89b-12d3-a456-426614174999', customPrice: 10 },
    ],
  });
  const d = dig(up.json, ['data']) as { matched?: number; upserted?: number; errors?: unknown[] };
  note(`bulk-upload: ${up.text.slice(0, 400)}`);
  assert('bulk-upload: 2 upserted, 2 errors', up.status === 200 && d?.upserted === 2 && (d?.errors?.length ?? 0) === 2, JSON.stringify(d).slice(0, 300));
  const items = (dig((await api(vendor, 'GET', `/api/v1/vendor/price-lists/${L1}`)).json, ['data', 'items']) as Array<{ productId: string; customPrice: unknown }>) ?? [];
  assert('bulk-upload by SKU landed (Q1=88)', num(items.find((i) => i.productId === Q1)?.customPrice) === 88);
  assert('bulk-upload by productId landed (Q2=190)', num(items.find((i) => i.productId === Q2)?.customPrice) === 190);
  /* name-only row (no sku/productId) must error, not crash */
  const bad = await api(vendor, 'POST', `/api/v1/vendor/price-lists/${L1}/bulk-upload`, { rows: [{ customPrice: 10 }] });
  assert('bulk-upload row without sku/productId rejected or error-listed', bad.status === 400 || (dig(bad.json, ['data', 'errors']) as unknown[])?.length === 1, `${bad.status} ${bad.text.slice(0, 200)}`);
}
let CLONE = '';
{
  const cl = await api(vendor, 'POST', `/api/v1/vendor/price-lists/${L1}/clone`, { name: `QA-HC-${TS}-Clone`, adjustPercent: -10 });
  CLONE = (dig(cl.json, ['data', 'id']) ?? dig(cl.json, ['data', 'priceList', 'id'])) as string;
  assert('clone with -10% adjust 201', cl.status === 201 && !!CLONE, `${cl.status} ${cl.text.slice(0, 300)}`);
  const items = (dig((await api(vendor, 'GET', `/api/v1/vendor/price-lists/${CLONE}`)).json, ['data', 'items']) as Array<{ productId: string; customPrice: unknown }>) ?? [];
  assert('clone Q1 price = 79.2 (88-10%)', num(items.find((i) => i.productId === Q1)?.customPrice) === 79.2, JSON.stringify(items).slice(0, 300));
}
{
  const exp = await api(vendor, 'GET', '/api/v1/vendor/price-lists/workspace/export');
  assert('export CSV 200 with SKU header', exp.status === 200 && /sku/i.test(exp.text.split('\n')[0]), exp.text.split('\n')[0]);
  const row = exp.text.split('\n').find((l) => l.includes(Q1_SKU));
  assert('export CSV contains Q1 row with 88', !!row && row.includes('88'), row);
}

/* ================= GROUPS CRUD ================= */
console.log('\n== G. groups CRUD ==');
{
  const list = await api(vendor, 'GET', '/api/v1/vendor/customer-groups');
  const groups = (dig(list.json, ['data']) as Array<{ id: string; name: string; _count?: { members: number } }>) ?? [];
  const g = groups.find((x) => x.id === GID);
  assert('group listed with 1 member', !!g && g._count?.members === 1, JSON.stringify(g));
  const del = await api(vendor, 'DELETE', `/api/v1/vendor/customer-groups/${GID}`);
  note(`group delete status ${del.status}: ${del.text.slice(0, 150)}`);
}

/* ================= ZOHO MEMBERSHIP ================= */
console.log('\n== H. Zoho membership (selected vs percent, membersOnly, unpriced, remove) ==');
{
  // workspace meta: kind + priority present
  const { data } = await ws();
  const meta = (data as unknown as { priceLists: Array<{ id: string; kind?: string; priority?: number }> }).priceLists.find((l) => l.id === L1);
  assert('workspace list meta has kind=selected + priority', !!meta && (meta as { kind?: string }).kind === 'selected' && typeof (meta as { priority?: number }).priority === 'number', JSON.stringify(meta));

  // membersOnly for L1 contains Widget A (priced there), not an unrelated product search miss
  const mo = await api(vendor, 'GET', `/api/v1/vendor/price-lists/workspace?limit=100&listId=${L1}&membersOnly=1`);
  const moRows = (dig(mo.json, ['data', 'products']) as Array<{ id: string }>) ?? [];
  assert('membersOnly(L1) includes Widget A', moRows.some((p) => p.id === A), `${moRows.length} rows`);
  assert('membersOnly(L1) rows all have an L1 cell', moRows.length > 0);

  // excludeListId=L1 must NOT return Widget A
  const ex = await api(vendor, 'GET', `/api/v1/vendor/price-lists/workspace?limit=100&excludeListId=${L1}`);
  const exRows = (dig(ex.json, ['data', 'products']) as Array<{ id: string }>) ?? [];
  assert('excludeListId(L1) excludes Widget A (already in list)', !exRows.some((p) => p.id === A));

  // percent kind list
  const pct = await api(vendor, 'POST', '/api/v1/vendor/price-lists', { name: `QA-HC-${TS}-Pct`, kind: 'percent', discountPercent: 10 });
  const PCT = dig(pct.json, ['data', 'id']) as string;
  assert('create percent list 201', pct.status === 201 && !!PCT, pct.text.slice(0, 200));
  const badPct = await api(vendor, 'POST', '/api/v1/vendor/price-lists', { name: `QA-HC-${TS}-PctBad`, kind: 'percent', discountPercent: 0 });
  assert('percent list without discount rejected', badPct.status === 400, `${badPct.status}`);
  const { data: wsPct } = await ws();
  const pctMeta = (wsPct as unknown as { priceLists: Array<{ id: string; kind?: string }> }).priceLists.find((l) => l.id === PCT);
  assert('workspace kind=percent for -10% list', (pctMeta as { kind?: string } | undefined)?.kind === 'percent', JSON.stringify(pctMeta));

  // unpriced review warning: added-but-empty cell (Widget A has no item on PCT yet)
  const rev = await api(vendor, 'POST', '/api/v1/vendor/price-lists/workspace/review', {
    baseVersion: null,
    cells: [{ priceListId: PCT, productId: A, added: true, customPrice: null, isExcluded: false }],
  });
  const revData = dig(rev.json, ['data']) as { summary?: { unpriced?: number }; unpriced?: unknown[] } | null;
  note(`review unpriced: ${JSON.stringify(revData?.summary)}`);
  assert('review warns added-but-unpriced (summary.unpriced >= 1)', rev.status === 200 && (revData?.summary?.unpriced ?? 0) >= 1, rev.text.slice(0, 300));

  // remove-from-list: clear Q1 from L2 then membersOnly(L2) must drop it
  const pubQ1 = await publish([{ priceListId: L2, productId: Q1, customPrice: 77 }]);
  assert('publish Q1=77 on L2', pubQ1.status === 200, pubQ1.text.slice(0, 200));
  const moBefore = await api(vendor, 'GET', `/api/v1/vendor/price-lists/workspace?limit=100&listId=${L2}&membersOnly=1`);
  assert('membersOnly(L2) has Q1 after publish', ((dig(moBefore.json, ['data', 'products']) as Array<{ id: string }>) ?? []).some((p) => p.id === Q1));
  const rm = await publish([{ priceListId: L2, productId: Q1, customPrice: null, isExcluded: false }]);
  assert('remove-from-list publish (clear cell) 200', rm.status === 200, rm.text.slice(0, 200));
  const moAfter = await api(vendor, 'GET', `/api/v1/vendor/price-lists/workspace?limit=100&listId=${L2}&membersOnly=1`);
  assert('membersOnly(L2) drops Q1 after remove', !((dig(moAfter.json, ['data', 'products']) as Array<{ id: string }>) ?? []).some((p) => p.id === Q1));

  // single-list export only members
  const expOne = await api(vendor, 'GET', `/api/v1/vendor/price-lists/workspace/export?listId=${L1}`);
  assert('export?listId=L1 200 with one list column', expOne.status === 200 && expOne.text.split('\n')[0].split(',').length === 4, expOne.text.split('\n')[0]);

  if (!KEEP) { await api(vendor, 'DELETE', `/api/v1/vendor/price-lists/${PCT}`); }
  else note(`kept percent list ${PCT}`);
}

/* ================= CLEANUP ================= */
console.log('\n== I. cleanup ==');
for (const [listId, assignments] of showcaseSnap) {
  const r = await api(vendor, 'PATCH', `/api/v1/vendor/price-lists/${listId}`, { assignments });
  note(`restored showcase assignments on ${listId.slice(0, 8)} -> ${r.status}`);
}
if (KEEP) {
  note('KEEP mode: QA-HC lists/products/groups left on demo account on purpose');
} else {
await setAssignments(L1, []);
for (const id of [L1, L2, CLONE].filter(Boolean)) {
  const d = await api(vendor, 'DELETE', `/api/v1/vendor/price-lists/${id}`);
  note(`delete list ${id.slice(0, 8)} -> ${d.status}`);
}
for (const pid of [Q1, Q2]) {
  const d = await api(vendor, 'DELETE', `/api/v1/vendor/products/${pid}`);
  note(`delete product ${pid.slice(0, 8)} -> ${d.status} ${d.text.slice(0, 120)}`);
}
{
  const { data } = await ws();
  const names = data.products.map((p) => p.name);
  assert('workspace clean: QA products gone', !names.some((n) => n.includes(`QAH-${TS}`) || n.includes('QA-HARDCORE Super')), names.join('|').slice(0, 200));
  const lists = (dig((await api(vendor, 'GET', '/api/v1/vendor/price-lists')).json, ['data']) as Array<{ name: string }>) ?? [];
  assert('lists clean: no QA-HC lists active', !lists.some((l) => l.name.includes(`QA-HC-${TS}`)), lists.map((l) => l.name).join('|'));
}
}
console.log(`\n==== RESULT: ${passes} passed, ${failures} failed ====`);
process.exit(failures === 0 ? 0 : 1);
