/**
 * Catalog SKU Option 1 — link semantics verification.
 *
 * Rules under test:
 *  1. New SKU → creates approved master
 *  2. Same vendor + same SKU twice → conflict
 *  3. Different vendor + same SKU → link allowed
 *  4. Name mismatch without confirmLink → CONFIRM_LINK_REQUIRED
 *  5. Name mismatch with confirmLink → succeeds
 *
 * Run: npx tsx scripts/verify_catalog_sku_linking.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { ApiError } from '../src/middleware/errorHandler';
import {
  applyMasterLinkToVendorProduct,
  assertVendorPosSkuUnique,
  CatalogService,
  resolveMasterForVendorApproval,
} from '../src/modules/catalog/catalog.service';
import { formatVendorSku, resolveVendorCode } from '../src/lib/sku';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const TEST_SKU = `VERIFY-SKU-${Date.now().toString(36).toUpperCase()}`;

async function main() {
  let failed = 0;
  const assert = (ok: boolean, msg: string) => {
    if (ok) console.log(`  ${GREEN}✓ ${msg}${RESET}`);
    else {
      console.log(`  ${RED}✗ ${msg}${RESET}`);
      failed++;
    }
  };

  console.log(`${BOLD}Catalog SKU linking verification${RESET}`);
  console.log(`Test SKU: ${TEST_SKU}\n`);

  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true } });
  if (!admin) throw new Error('No admin user in DB — seed first');

  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    select: { id: true, businessName: true },
    take: 2,
    orderBy: { createdAt: 'asc' },
  });
  if (vendors.length < 2) throw new Error('Need at least 2 active vendors');

  const leaf = await prisma.category.findFirst({
    where: { isActive: true, approvalStatus: 'approved', children: { none: {} }, parentId: { not: null } },
    select: { id: true, name: true },
  });
  if (!leaf) throw new Error('Need an approved leaf category');

  const [vendorA, vendorB] = vendors;
  const createdProductIds: string[] = [];
  let masterId: string | null = null;

  const makePending = async (vendorId: string, name: string, slugSuffix: string) => {
    const p = await prisma.product.create({
      data: {
        vendorId,
        categoryId: leaf.id,
        name,
        slug: `verify-sku-${slugSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        basePrice: 20,
        approvalStatus: 'pending',
        listingStatus: 'submitted',
        isActive: false,
        vendorSku: `POS-${slugSuffix}`,
        brand: 'VerifyBrand',
      },
    });
    await prisma.productCategory.create({
      data: { productId: p.id, categoryId: leaf.id, isPrimary: true },
    });
    createdProductIds.push(p.id);
    return p;
  };

  try {
    // 1) New SKU creates master
    console.log(`${BOLD}1. New catalog SKU creates master${RESET}`);
    const productA1 = await makePending(vendorA.id, 'Verify Basmati Rice 5kg', 'a1');
    masterId = await resolveMasterForVendorApproval({
      product: {
        id: productA1.id,
        vendorId: vendorA.id,
        name: productA1.name,
        brand: productA1.brand,
        categoryId: productA1.categoryId,
        imageUrl: null,
        unit: null,
        packSize: null,
        vendorSku: productA1.vendorSku,
        sku: null,
        masterProductId: null,
      },
      adminUserId: admin.id,
      catalogSku: TEST_SKU,
      categoryIds: [leaf.id],
    });
    await applyMasterLinkToVendorProduct(productA1.id, vendorA.id, masterId);
    const master = await prisma.masterProduct.findUnique({ where: { id: masterId } });
    assert(!!master && master.sku === TEST_SKU, `Master created with SKU ${TEST_SKU}`);
    assert(master?.name === 'Verify Basmati Rice 5kg', 'Master name taken from listing');

    // 2) Same vendor cannot reuse SKU
    console.log(`\n${BOLD}2. Same vendor + same SKU → conflict${RESET}`);
    const productA2 = await makePending(vendorA.id, 'Verify Basmati Rice 5kg Dup', 'a2');
    let sameVendorBlocked = false;
    try {
      await resolveMasterForVendorApproval({
        product: {
          id: productA2.id,
          vendorId: vendorA.id,
          name: productA2.name,
          brand: productA2.brand,
          categoryId: productA2.categoryId,
          imageUrl: null,
          unit: null,
          packSize: null,
          vendorSku: productA2.vendorSku,
          sku: null,
          masterProductId: null,
        },
        adminUserId: admin.id,
        catalogSku: TEST_SKU,
        categoryIds: [leaf.id],
        confirmLink: true,
      });
    } catch (e) {
      sameVendorBlocked = e instanceof ApiError && e.code === 'CONFLICT';
      if (sameVendorBlocked) {
        assert(true, `Blocked: ${e.message}`);
      } else {
        assert(false, `Unexpected error: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (!sameVendorBlocked) assert(false, 'Expected CONFLICT for same-vendor duplicate');

    // 3) Different vendor can link (matching name — no confirm needed)
    console.log(`\n${BOLD}3. Different vendor + same SKU → link${RESET}`);
    const productB1 = await makePending(vendorB.id, 'Verify Basmati Rice 5kg', 'b1');
    const linkedId = await resolveMasterForVendorApproval({
      product: {
        id: productB1.id,
        vendorId: vendorB.id,
        name: productB1.name,
        brand: productB1.brand,
        categoryId: productB1.categoryId,
        imageUrl: null,
        unit: null,
        packSize: null,
        vendorSku: productB1.vendorSku,
        sku: null,
        masterProductId: null,
      },
      adminUserId: admin.id,
      catalogSku: TEST_SKU,
      categoryIds: [leaf.id],
    });
    assert(linkedId === masterId, 'Vendor B resolve returns same master id');
    await applyMasterLinkToVendorProduct(productB1.id, vendorB.id, linkedId);
    const b1 = await prisma.product.findUnique({ where: { id: productB1.id }, select: { masterProductId: true } });
    assert(b1?.masterProductId === masterId, 'Vendor B product has masterProductId set');

    // Free vendor B's slot so mismatch tests aren't shadowed by same-vendor unique.
    await prisma.product.update({
      where: { id: productB1.id },
      data: { masterProductId: null },
    });

    // 4) Name mismatch without confirm
    console.log(`\n${BOLD}4. Name mismatch without confirmLink → CONFIRM_LINK_REQUIRED${RESET}`);
    const productB2 = await makePending(vendorB.id, 'Totally Different Product Name', 'b2');
    let mismatchBlocked = false;
    try {
      await resolveMasterForVendorApproval({
        product: {
          id: productB2.id,
          vendorId: vendorB.id,
          name: productB2.name,
          brand: productB2.brand,
          categoryId: productB2.categoryId,
          imageUrl: null,
          unit: null,
          packSize: null,
          vendorSku: productB2.vendorSku,
          sku: null,
          masterProductId: null,
        },
        adminUserId: admin.id,
        catalogSku: TEST_SKU,
        categoryIds: [leaf.id],
      });
    } catch (e) {
      mismatchBlocked = e instanceof ApiError && e.code === 'CONFIRM_LINK_REQUIRED';
      if (mismatchBlocked) {
        assert(true, `Confirm required: ${e.message.slice(0, 80)}…`);
      } else {
        assert(false, `Unexpected error: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (!mismatchBlocked) assert(false, 'Expected CONFIRM_LINK_REQUIRED');

    // 5) Name mismatch with confirm
    console.log(`\n${BOLD}5. Name mismatch with confirmLink → succeeds${RESET}`);
    const confirmedId = await resolveMasterForVendorApproval({
      product: {
        id: productB2.id,
        vendorId: vendorB.id,
        name: productB2.name,
        brand: productB2.brand,
        categoryId: productB2.categoryId,
        imageUrl: null,
        unit: null,
        packSize: null,
        vendorSku: productB2.vendorSku,
        sku: null,
        masterProductId: null,
      },
      adminUserId: admin.id,
      catalogSku: TEST_SKU,
      categoryIds: [leaf.id],
      confirmLink: true,
    });
    assert(confirmedId === masterId, 'Confirmed link returns same master');
    await applyMasterLinkToVendorProduct(productB2.id, vendorB.id, confirmedId);
    const b2 = await prisma.product.findUnique({
      where: { id: productB2.id },
      select: { masterProductId: true, name: true },
    });
    assert(b2?.masterProductId === masterId, 'Product linked after confirm');
    assert(b2?.name === 'Verify Basmati Rice 5kg', 'Listing name overwritten from master on link');

    // 6) POS duplicate when existing row only has composed sku (vendorSku null)
    console.log(`\n${BOLD}6. POS duplicate — legacy composed sku only${RESET}`);
    const vendorRow = await prisma.vendor.findUnique({
      where: { id: vendorA.id },
      select: { vendorCode: true, slug: true },
    });
    if (!vendorRow) throw new Error('Vendor A missing');
    const vendorCode = resolveVendorCode(vendorRow);
    const dupPos = `POS-DUP-${Date.now().toString(36)}`;
    const composedSku = formatVendorSku(vendorCode, dupPos);
    const legacyListing = await prisma.product.create({
      data: {
        vendorId: vendorA.id,
        categoryId: leaf.id,
        name: 'Legacy composed SKU only',
        slug: `verify-pos-legacy-${Date.now()}`,
        basePrice: 10,
        approvalStatus: 'approved',
        listingStatus: 'submitted',
        isActive: true,
        sku: composedSku,
        vendorSku: null,
        brand: 'VerifyBrand',
      },
    });
    createdProductIds.push(legacyListing.id);
    let posDupBlocked = false;
    try {
      await assertVendorPosSkuUnique(vendorA.id, dupPos);
    } catch (e) {
      posDupBlocked = e instanceof ApiError && e.code === 'CONFLICT';
      if (posDupBlocked) {
        assert(true, `Blocked duplicate POS: ${e.message.slice(0, 72)}…`);
      } else {
        assert(false, `Unexpected error: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (!posDupBlocked) assert(false, 'Expected CONFLICT for duplicate POS vs composed sku');

    // 7) Country + shelf life persist on vendor update
    console.log(`\n${BOLD}7. Country / shelf life PATCH roundtrip${RESET}`);
    const logisticsProduct = await makePending(vendorA.id, 'Verify Logistics Fields', 'log');
    const catalog = new CatalogService();
    await catalog.updateProduct(logisticsProduct.id, vendorA.id, {
      countryOfOrigin: 'India',
      shelfLifeDays: 30,
      storageType: 'ambient',
      vegNonVeg: 'veg',
    });
    const afterPatch = await prisma.product.findUnique({
      where: { id: logisticsProduct.id },
      select: { countryOfOrigin: true, shelfLifeDays: true },
    });
    assert(afterPatch?.countryOfOrigin === 'India', 'countryOfOrigin saved on PATCH');
    assert(afterPatch?.shelfLifeDays === 30, 'shelfLifeDays saved on PATCH');

    console.log(`\n${BOLD}Result: ${failed === 0 ? `${GREEN}ALL PASSED${RESET}` : `${RED}${failed} FAILED${RESET}`}${BOLD}${RESET}`);
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    if (createdProductIds.length) {
      await prisma.productCategory.deleteMany({ where: { productId: { in: createdProductIds } } });
      await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    }
    if (masterId) {
      await prisma.masterProductCategory.deleteMany({ where: { masterProductId: masterId } });
      await prisma.masterProduct.delete({ where: { id: masterId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
