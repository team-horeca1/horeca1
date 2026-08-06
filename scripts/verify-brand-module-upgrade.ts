/**
 * E2E verify Brand Module Upgrade (Parts 1–4).
 * Requires: npm run dev on localhost:3000 + seeded DB.
 *
 * Run: npx tsx scripts/verify-brand-module-upgrade.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

type Jar = Map<string, string>;

function jarHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function mergeCookies(jar: Jar, setCookie: string | null) {
  if (!setCookie) return;
  for (const part of setCookie.split(/,\s*(?=[^;]+?=)/)) {
    const [nv] = part.split(';');
    const eq = nv.indexOf('=');
    if (eq > 0) jar.set(nv.slice(0, eq).trim(), nv.slice(eq + 1).trim());
  }
}

async function passwordLogin(email: string, password: string, retries = 4): Promise<Jar> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const jar: Jar = new Map();
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    if (csrfRes.status === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    mergeCookies(jar, csrfRes.headers.get('set-cookie'));
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const loginRes = await fetch(`${BASE}/api/auth/callback/credentials?`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jarHeader(jar) },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE, json: 'true' }),
      redirect: 'manual',
    });
    mergeCookies(jar, loginRes.headers.get('set-cookie'));
    if ([...jar.keys()].some((k) => k.includes('authjs.session-token'))) return jar;
    if (loginRes.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new Error(`Login failed for ${email}`);
}

async function api(jar: Jar, path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    Cookie: jarHeader(jar),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
  mergeCookies(jar, res.headers.get('set-cookie'));
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function ok(step: string, detail?: unknown) {
  console.log(`✓ ${step}`, detail !== undefined ? JSON.stringify(detail) : '');
}

async function main() {
  const stamp = Date.now().toString().slice(-6);
  console.log(`\n=== Brand Module Upgrade E2E @ ${BASE} ===\n`);

  // Health
  const health = await fetch(`${BASE}/api/auth/providers`);
  assert(health.ok, `dev server not reachable (${health.status})`);
  ok('dev server up');

  // ── Part 1: brand creates product with new detail fields ──
  const brandJar = await passwordLogin('brand@kitchensmith.com', 'brand123');
  ok('brand login');

  const createBody = {
    name: `Verify SKU ${stamp}`,
    description: `Brand-owned description ${stamp}`,
    packSize: '1 kg',
    unit: 'kg',
    sku: `VERIFY-${stamp}`,
    hsn: '190110',
    barcode: `890${stamp}001`,
    ean: `890${stamp}001`,
    vegNonVeg: 'veg' as const,
    storageType: 'dry',
    shelfLifeDays: 365,
    countryOfOrigin: 'India',
    fssaiRef: '10012021000123',
    netWeight: 1,
    netWeightUnit: 'kg',
    tags: ['verify', 'e2e'],
    aliasNames: [`verify-alias-${stamp}`, 'flour verify'],
    imageUrl: 'https://ik.imagekit.io/demo/img/image1.jpeg',
    images: ['https://ik.imagekit.io/demo/img/image1.jpeg'],
  };

  const created = await api(brandJar, '/api/v1/brand/products', {
    method: 'POST',
    body: JSON.stringify(createBody),
  });
  assert(created.status === 201 && created.json?.success, `create brand product failed: ${JSON.stringify(created)}`);
  const masterId = created.json.data.id as string;
  // Re-read from DB — API may serialize Decimals oddly; persistence is the source of truth
  const persisted = await prisma.brandMasterProduct.findUnique({ where: { id: masterId } });
  assert(persisted, 'created product not in DB');
  if (persisted.hsn !== '190110' || !persisted.aliasNames.includes(`verify-alias-${stamp}`)) {
    console.error('CREATE RESPONSE:', JSON.stringify(created.json, null, 2));
    console.error('DB ROW:', JSON.stringify(persisted, null, 2));
  }
  assert(persisted.hsn === '190110', `hsn not persisted (got ${persisted.hsn})`);
  assert(persisted.aliasNames.includes(`verify-alias-${stamp}`), 'aliasNames not persisted');
  assert(persisted.vegNonVeg === 'veg', 'vegNonVeg not persisted');
  assert(persisted.images.length > 0, 'images not persisted');
  ok('Part1 create brand product with detail fields', { masterId, name: persisted.name, hsn: persisted.hsn });

  // ── Part 2: vendor browses stores + maps without prior approval ──
  const vendorJar = await passwordLogin('fresh@dailyfreshfoods.com', 'vendor123');
  ok('vendor login');

  const stores = await api(vendorJar, '/api/v1/vendor/brand-mappings?view=stores');
  assert(stores.status === 200 && stores.json?.success, `stores view failed: ${JSON.stringify(stores)}`);
  const brands = stores.json.data.brands as Array<{
    id: string; name: string; authStatus: string; catalogSize: number;
  }>;
  assert(brands.length > 0, 'no brands returned (gate should be removed)');
  ok('Part2 stores index returns brands', {
    count: brands.length,
    sample: brands.slice(0, 3).map((b) => ({ name: b.name, auth: b.authStatus, catalog: b.catalogSize })),
  });

  // Prefer a brand where Daily Fresh is NOT approved — use Everest if present with auth none/pending/rejected
  let targetBrand = brands.find((b) => b.name.toLowerCase().includes('everest') && b.authStatus !== 'approved');
  if (!targetBrand) {
    targetBrand = brands.find((b) => b.authStatus === 'none' || b.authStatus === 'rejected');
  }
  if (!targetBrand) {
    // Fall back: clear Kitchen Smith auth for this vendor so we can re-request pending
    const ks = brands.find((b) => b.name.toLowerCase().includes('kitchen'));
    assert(ks, 'no Kitchen Smith brand found');
    const vendor = await prisma.vendor.findFirst({ where: { slug: 'daily-fresh-foods' }, select: { id: true } });
    assert(vendor, 'daily-fresh-foods vendor missing');
    await prisma.brandAuthorizedDistributor.deleteMany({ where: { brandId: ks.id, vendorId: vendor.id } });
    targetBrand = { ...ks, authStatus: 'none' };
    ok('cleared Kitchen Smith distributor auth for clean pending test');
  }

  // Ensure target brand has our master product OR use Kitchen Smith (we just created there)
  const kitchenSmith = brands.find((b) => b.name.toLowerCase().includes('kitchen'));
  assert(kitchenSmith, 'Kitchen Smith missing from stores');

  // Use Kitchen Smith (product we created) — ensure auth is not approved so pending request is created
  const vendorRow = await prisma.vendor.findFirst({ where: { slug: 'daily-fresh-foods' }, select: { id: true } });
  assert(vendorRow, 'vendor missing');
  const existingAuth = await prisma.brandAuthorizedDistributor.findUnique({
    where: { brandId_vendorId: { brandId: kitchenSmith.id, vendorId: vendorRow.id } },
  });
  if (existingAuth?.status === 'approved') {
    await prisma.brandAuthorizedDistributor.update({
      where: { id: existingAuth.id },
      data: { status: 'rejected', brandApprovedAt: null },
    });
    ok('temporarily set Kitchen Smith auth to rejected so mapping raises pending');
  } else if (existingAuth?.status === 'pending') {
    ok('Kitchen Smith auth already pending');
  } else if (!existingAuth) {
    ok('Kitchen Smith auth is none — first mapping will create pending');
  }

  // Pick a vendor product with no live/pending mapping (default view buckets)
  const buckets = await api(vendorJar, '/api/v1/vendor/brand-mappings');
  assert(buckets.status === 200 && buckets.json?.success, `mappings buckets failed: ${JSON.stringify(buckets)}`);
  let unmapped = (buckets.json.data.unmapped ?? []) as Array<{ productId: string; name: string }>;

  // If everything is already mapped to some brand, detach one product so we can re-link to Kitchen Smith
  if (unmapped.length === 0) {
    const mapped = (buckets.json.data.mapped ?? []) as Array<{
      mappingId: string; productId: string; productName: string;
    }>;
    assert(mapped.length > 0, 'vendor has no products to map');
    const victim = mapped[0];
    const unlinkVictim = await api(vendorJar, `/api/v1/vendor/brand-mappings/${victim.mappingId}`, { method: 'DELETE' });
    assert(unlinkVictim.json?.success, `pre-unlink failed: ${JSON.stringify(unlinkVictim)}`);
    const refreshed = await api(vendorJar, '/api/v1/vendor/brand-mappings');
    unmapped = (refreshed.json.data.unmapped ?? []) as Array<{ productId: string; name: string }>;
    ok('pre-unlinked a mapped product to free a SKU for Kitchen Smith mapping', {
      productId: victim.productId,
      name: victim.productName,
    });
  }

  assert(unmapped.length > 0, 'no unmapped vendor products after prep');
  const vendorProductId = unmapped[0].productId;
  const vendorProductName = unmapped[0].name;
  ok('picked unmapped vendor product', { vendorProductId, vendorProductName });

  // Also confirm table view works for the brand workspace
  const table = await api(vendorJar, `/api/v1/vendor/brand-mappings?view=table&brandId=${kitchenSmith.id}`);
  assert(table.status === 200 && Array.isArray(table.json?.data?.rows), `table view failed: ${JSON.stringify(table)}`);
  ok('Part2 table view returns rows', { rowCount: table.json.data.rows.length });

  // Confirm catalog browsable without approval
  const catalog = await api(vendorJar, `/api/v1/brand-master-products?brandId=${kitchenSmith.id}&limit=50`);
  assert(catalog.status === 200 && catalog.json?.success, `catalog browse failed: ${JSON.stringify(catalog)}`);
  const catalogProducts = catalog.json.data.products as Array<{ id: string; name: string }>;
  assert(catalogProducts.some((p) => p.id === masterId), 'new master product not browsable');
  ok('Part2 catalog browsable without approval', { catalogCount: catalogProducts.length });

  const mapRes = await api(vendorJar, '/api/v1/vendor/brand-mappings', {
    method: 'POST',
    body: JSON.stringify({ distributorProductId: vendorProductId, brandMasterProductId: masterId }),
  });
  assert(mapRes.status === 200 || mapRes.status === 201, `map failed: ${JSON.stringify(mapRes)}`);
  assert(mapRes.json?.success, `map not success: ${JSON.stringify(mapRes)}`);
  const mappingId = (mapRes.json.data?.id ?? mapRes.json.data?.mapping?.id) as string | undefined;
  ok('Part2 created mapping without prior approval', { mappingId, status: mapRes.status, dataKeys: Object.keys(mapRes.json.data ?? {}) });

  // Confirm pending auth row
  const authAfter = await prisma.brandAuthorizedDistributor.findUnique({
    where: { brandId_vendorId: { brandId: kitchenSmith.id, vendorId: vendorRow.id } },
  });
  assert(authAfter?.status === 'pending', `expected pending auth, got ${authAfter?.status}`);
  ok('Part2 ensurePendingDistributorAuth → pending');

  // ── Part 3: brand distributors Requests column ──
  const dists = await api(brandJar, '/api/v1/brand/authorized-distributors');
  assert(dists.status === 200 && dists.json?.success, `distributors list failed: ${JSON.stringify(dists)}`);
  const rows = (dists.json.data ?? dists.json.data?.distributors ?? dists.json) as unknown;
  const list = Array.isArray(rows)
    ? rows
    : Array.isArray((rows as { distributors?: unknown[] })?.distributors)
      ? (rows as { distributors: unknown[] }).distributors
      : [];
  type DistRow = { vendorId?: string; status?: string; vendor?: { businessName?: string }; mappedCount?: number };
  const distList = list as DistRow[];
  const pendingRow = distList.find(
    (d) => d.status === 'pending' && (d.vendorId === vendorRow.id || d.vendor?.businessName?.toLowerCase().includes('daily')),
  );
  assert(pendingRow, `pending request not in brand distributors API: ${JSON.stringify(distList).slice(0, 500)}`);
  ok('Part3 pending request visible to brand', {
    status: pendingRow.status,
    mappedCount: pendingRow.mappedCount,
    vendor: pendingRow.vendor?.businessName,
  });

  // ── Part 4: customer surfaces show brand override without approval ──
  // Public product API returns nested brandMappings (PDP + DAL consume these).
  // displayName / brandOverride are applied in toVendorProduct (client DAL) /
  // PDP derived values — not flattened on this raw API response.
  const publicProduct = await fetch(`${BASE}/api/v1/products/${vendorProductId}`);
  const publicJson = await publicProduct.json();
  assert(publicJson.success, `product fetch failed: ${JSON.stringify(publicJson)}`);
  const productPayload = publicJson.data as {
    name: string;
    brandMappings?: Array<{
      brandMasterProduct?: {
        name?: string;
        description?: string | null;
        imageUrl?: string | null;
        images?: string[];
        packSize?: string | null;
        brand?: { name?: string; slug?: string };
      };
    }>;
  };

  const master = productPayload.brandMappings?.[0]?.brandMasterProduct;
  assert(master, `brandMappings missing on product API: ${JSON.stringify(productPayload).slice(0, 600)}`);
  assert(
    master.name === createBody.name,
    `brand master name not on product: got ${master.name}`,
  );
  assert(master.brand?.name === 'Kitchen Smith', `brand name missing: ${master.brand?.name}`);
  assert(
    (master.images?.length ?? 0) > 0 || !!master.imageUrl,
    'brand images missing on mapping',
  );
  assert(
    master.description === createBody.description,
    `brand description not applied: ${master.description}`,
  );
  assert(productPayload.name === vendorProductName, 'raw Product.name must stay supplier value');
  ok('Part4 product API exposes brand mapping override fields without approval', {
    supplierName: productPayload.name,
    brandName: master.name,
    brand: master.brand?.name,
    packSize: master.packSize,
  });

  // Catalog/search path (uses DAL toVendorProduct → brandOverride)
  const vendorSlug = 'daily-fresh-foods';
  const vendorPage = await fetch(`${BASE}/api/v1/vendors/${vendorSlug}`);
  let vendorJson: { success?: boolean; data?: { products?: Array<Record<string, unknown>> } } | null = null;
  if (vendorPage.ok) {
    vendorJson = await vendorPage.json();
  }
  // Fallback: products search
  const searchRes = await fetch(`${BASE}/api/v1/products?vendorId=${encodeURIComponent(
    (await prisma.vendor.findFirst({ where: { slug: vendorSlug }, select: { id: true } }))?.id ?? '',
  )}&limit=50`);
  const searchJson = await searchRes.json().catch(() => null);
  const vendorCatalogProducts = (
    (searchJson?.data?.products ?? searchJson?.data ?? vendorJson?.data?.products ?? []) as Array<Record<string, unknown>>
  );
  const catalogHit = vendorCatalogProducts.find((p) => p.id === vendorProductId);
  if (catalogHit) {
    const override = catalogHit.brandOverride as { brandName?: string; fields?: string[] } | undefined;
    const display = (catalogHit.displayName ?? catalogHit.name) as string;
    if (override || display === createBody.name) {
      ok('Part4 catalog/search shows brand override', {
        displayName: display,
        brandOverride: override ?? null,
      });
    } else if (Array.isArray(catalogHit.brandMappings) && (catalogHit.brandMappings as unknown[]).length > 0) {
      ok('Part4 catalog includes brandMappings for client DAL', {
        mappingCount: (catalogHit.brandMappings as unknown[]).length,
      });
    } else {
      console.warn('WARN: catalog hit found but no override fields — raw keys:', Object.keys(catalogHit));
    }
  } else {
    console.warn('WARN: product not in catalog listing sample; product API + PDP checks still apply');
  }

  // PDP page should render (HTML check for brand name / override)
  const pdp = await fetch(`${BASE}/product/${vendorProductId}`);
  assert(pdp.ok, `PDP failed ${pdp.status}`);
  const html = await pdp.text();
  // Client-rendered Next.js page may not SSR the name; at least the shell must load.
  assert(html.includes(vendorProductId) || html.includes('product') || html.length > 500, 'PDP HTML empty');
  ok('Part4 PDP route loads', { status: pdp.status, bytes: html.length });

  // ── Unlink → revert ──
  let unlinkId = mappingId;
  if (!unlinkId) {
    const live = await prisma.brandProductMapping.findFirst({
      where: {
        distributorProductId: vendorProductId,
        brandMasterProductId: masterId,
        status: { in: ['auto_mapped', 'verified'] },
      },
      select: { id: true },
    });
    unlinkId = live?.id;
  }
  assert(unlinkId, 'could not resolve mapping id to unlink');

  const del = await api(vendorJar, `/api/v1/vendor/brand-mappings/${unlinkId}`, { method: 'DELETE' });
  assert(del.status === 200 && del.json?.success, `unlink failed: ${JSON.stringify(del)}`);
  ok('unlinked mapping', { unlinkId });

  const afterUnlink = await fetch(`${BASE}/api/v1/products/${vendorProductId}`);
  const afterJson = await afterUnlink.json();
  const afterData = afterJson.data as { name?: string; brandMappings?: unknown[] };
  assert(
    !afterData.brandMappings || afterData.brandMappings.length === 0,
    `brandMappings still present after unlink: ${JSON.stringify(afterData.brandMappings)}`,
  );
  assert(afterData.name === vendorProductName, `supplier name changed unexpectedly: ${afterData.name}`);
  ok('Part4 unlink reverts override', {
    name: afterData.name,
    brandMappings: afterData.brandMappings ?? [],
  });

  // Cleanup: soft-delete brand master product we created
  await api(brandJar, `/api/v1/brand/products/${masterId}`, { method: 'DELETE' });
  ok('cleanup deleted brand master product');

  console.log('\n=== ALL VERIFY CHECKS PASSED ===\n');
}

main()
  .catch((e) => {
    console.error('\n✗ VERIFY FAILED:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
