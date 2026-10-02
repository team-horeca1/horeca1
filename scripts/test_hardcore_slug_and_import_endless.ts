import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });

import * as XLSX from 'xlsx';
import assert from 'assert';

function createExcelBuffer(rows: Record<string, any>[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

async function runHardcoreTesting() {
  const { prisma } = await import('../src/lib/prisma');
  const { CatalogService } = await import('../src/modules/catalog/catalog.service');
  const { handleVendorProductImport } = await import('../src/app/api/v1/vendor/products/import/route');
  const { handleAdminProductImport } = await import('../src/app/api/v1/admin/products/import/route');
  const { NextRequest } = await import('next/server');

  console.log('================================================================');
  console.log('   BULK UPLOAD & PRODUCT SLUG ENDLESS SCENARIO HARDCORE SUITE   ');
  console.log('================================================================\n');

  // Setup test environment
  let business = await prisma.businessAccount.findFirst({
    where: { legalName: 'Hardcore Slug Test Supplier Ltd' },
  });
  if (!business) {
    business = await prisma.businessAccount.create({
      data: {
        legalName: 'Hardcore Slug Test Supplier Ltd',
        displayName: 'Hardcore Slug Test Supplier',
        isVendor: true,
        businessType: 'distributor',
      },
    });
  }

  let user = await prisma.user.findFirst({
    where: { email: 'hardcore-slug-vendor@horeca1.com' },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'hardcore-slug-vendor@horeca1.com',
        fullName: 'Hardcore Slug Vendor',
        role: 'vendor',
        hcidDisplay: 'HC-TEST-SLUG',
      },
    });
  }

  let store = await prisma.vendor.findFirst({
    where: { slug: 'hardcore-store-slug' },
  });
  if (!store) {
    store = await prisma.vendor.create({
      data: {
        userId: user.id,
        businessAccountId: business.id,
        businessName: 'Hardcore Store',
        displayName: 'Hardcore Store Mumbai',
        slug: 'hardcore-store-slug',
        vendorCode: 'HCSLUG',
        isPrimaryStore: true,
        isActive: true,
      },
    });
  }

  if (!store.defaultOutletId) {
    const outlet = await prisma.outlet.create({
      data: {
        businessAccountId: business.id,
        name: 'Hardcore Store Warehouse',
        addressLine: 'Sector 5, Industrial Area',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        isActive: true,
      },
    });
    store = await prisma.vendor.update({
      where: { id: store.id },
      data: { defaultOutletId: outlet.id },
    });
  }

  let category = await prisma.category.findFirst({
    where: { slug: 'hardcore-test-category' },
  });
  if (!category) {
    category = await prisma.category.create({
      data: {
        name: 'Hardcore Test Category',
        slug: 'hardcore-test-category',
        approvalStatus: 'approved',
        isActive: true,
      },
    });
  }

  // Wipe previous test products for clean run
  await prisma.product.deleteMany({
    where: { vendorId: store.id },
  });

  const catalogService = new CatalogService();
  const vendorCtx = {
    userId: user.id,
    email: user.email,
    role: 'vendor',
    activeVendorId: store.id,
    activeBusinessAccountId: business.id,
    isPermissionOwner: true,
    permissions: ['products.create', 'products.edit'] as any,
    permissionSet: new Set(['products.create', 'products.edit']) as any,
  };

  const adminCtx = {
    userId: user.id,
    email: user.email,
    role: 'admin',
    isPermissionOwner: true,
    permissions: ['products.create', 'products.edit'] as any,
    permissionSet: new Set(['products.create', 'products.edit']) as any,
  };

  function makeVendorRequest(buffer: Buffer, mode: 'preview' | 'commit', force = false) {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    formData.append('file', blob, 'test.xlsx');
    formData.append('mode', mode);
    if (force) formData.append('force', 'true');

    return new NextRequest('http://localhost:3000/api/v1/vendor/products/import', {
      method: 'POST',
      body: formData,
    });
  }

  function makeAdminRequest(buffer: Buffer, vId: string | null, mode: 'preview' | 'commit', force = false) {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    formData.append('file', blob, 'test.xlsx');
    formData.append('mode', mode);
    if (vId) formData.append('vendorId', vId);
    if (force) formData.append('force', 'true');

    return new NextRequest('http://localhost:3000/api/v1/admin/products/import', {
      method: 'POST',
      body: formData,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 1: Single Product Create & The Exact User Bug
  // "If you change the SKU, just so that you can move ahead,
  // it says this slug already exists... of course one slug one SKU"
  // ─────────────────────────────────────────────────────────────
  console.log('[SCENARIO 1] Single Create: Same Product Name with Different SKUs');
  const p1 = await catalogService.createProduct(
    store.id,
    {
      name: 'Amul Salted Butter 500g',
      vendorSku: 'AMUL-500',
      basePrice: 275,
      taxPercent: 12,
      categoryIds: [category.id],
      listingStatus: 'submitted',
    },
  );
  console.log(`  ✓ Product 1 created: ID=${p1.id}, Slug="${p1.slug}", SKU="${p1.sku}"`);
  assert(p1.slug.includes('hardcore-store-slug'), 'Slug must include store slug');
  assert(p1.slug.includes('amul-salted-butter-500g'), 'Slug must include product name');
  assert(p1.slug.includes('amul-500'), 'Slug must include SKU');

  // Now create Product 2 with SAME NAME but changed SKU to "move ahead"
  console.log('  Testing creating Product 2 with identical name but different SKU (AMUL-100)...');
  const p2 = await catalogService.createProduct(
    store.id,
    {
      name: 'Amul Salted Butter 500g',
      vendorSku: 'AMUL-100',
      basePrice: 60,
      taxPercent: 12,
      categoryIds: [category.id],
      listingStatus: 'submitted',
    },
  );
  console.log(`  ✓ Product 2 created: ID=${p2.id}, Slug="${p2.slug}", SKU="${p2.sku}"`);
  assert(p2.id !== p1.id, 'Must be distinct products');
  assert(p2.slug.includes('amul-100'), 'Slug must include new SKU');
  assert(p2.slug !== p1.slug, 'Slugs must be distinct');
  console.log('  ✓ SCENARIO 1 PASSED: Same product name with different SKU created without collision!\n');

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 2: Auto-Increment Mechanism (-1, -2, -3...)
  // Even if store, product name, and SKU are identical repeats in the future!
  // ─────────────────────────────────────────────────────────────
  console.log('[SCENARIO 2] Auto-Increment Mechanism on Repeated Collisions');
  // Directly invoke resolveUniqueProductSlug multiple times with identical inputs
  const { resolveUniqueProductSlug } = await import('../src/lib/productSlug');

  const slugA = await resolveUniqueProductSlug(prisma, store.id, store.slug, 'Fresh Whole Milk', 'MILK-1L');
  console.log(`  Candidate A (Base): "${slugA}"`);
  assert.strictEqual(slugA, 'hardcore-store-slug-fresh-whole-milk-milk-1l');

  // Save product with candidate A into DB
  await prisma.product.create({
    data: {
      vendorId: store.id,
      name: 'Fresh Whole Milk',
      slug: slugA,
      sku: 'HCSLUG-MILK-1L',
      basePrice: 65,
      taxPercent: 0,
    },
  });

  // Next candidate with identical store, name, and SKU
  const slugB = await resolveUniqueProductSlug(prisma, store.id, store.slug, 'Fresh Whole Milk', 'MILK-1L');
  console.log(`  Candidate B (First collision): "${slugB}"`);
  assert.strictEqual(slugB, 'hardcore-store-slug-fresh-whole-milk-milk-1l-1');

  // Save into DB
  await prisma.product.create({
    data: {
      vendorId: store.id,
      name: 'Fresh Whole Milk',
      slug: slugB,
      sku: 'HCSLUG-MILK-1L-V2',
      basePrice: 65,
      taxPercent: 0,
    },
  });

  // Next candidate again
  const slugC = await resolveUniqueProductSlug(prisma, store.id, store.slug, 'Fresh Whole Milk', 'MILK-1L');
  console.log(`  Candidate C (Second collision): "${slugC}"`);
  assert.strictEqual(slugC, 'hardcore-store-slug-fresh-whole-milk-milk-1l-2');

  await prisma.product.create({
    data: {
      vendorId: store.id,
      name: 'Fresh Whole Milk',
      slug: slugC,
      sku: 'HCSLUG-MILK-1L-V3',
      basePrice: 65,
      taxPercent: 0,
    },
  });

  // Next candidate again
  const slugD = await resolveUniqueProductSlug(prisma, store.id, store.slug, 'Fresh Whole Milk', 'MILK-1L');
  console.log(`  Candidate D (Third collision): "${slugD}"`);
  assert.strictEqual(slugD, 'hardcore-store-slug-fresh-whole-milk-milk-1l-3');

  console.log('  ✓ SCENARIO 2 PASSED: Auto-increments -1, -2, -3 seamlessly on database collisions!\n');

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 3: VARCHAR(255) Boundary Truncation Test
  // Extremely long name + store + SKU
  // ─────────────────────────────────────────────────────────────
  console.log('[SCENARIO 3] Max VARCHAR(255) Truncation Safety');
  const superLongName = 'Premium Extra Virgin Organic Cold Pressed Sesame Oil In Glass Bottle With Hologram Seal Batch A1234567890 B1234567890 C1234567890 D1234567890 E1234567890';
  const superLongSku = 'EXTREMELY-LONG-SKU-IDENTIFIER-CODE-FOR-WAREHOUSE-LOGISTICS-TRACKING-1234567890';

  const longSlug1 = await resolveUniqueProductSlug(prisma, store.id, store.slug, superLongName, superLongSku);
  console.log(`  Long Slug 1 (len=${longSlug1.length}): "${longSlug1}"`);
  assert(longSlug1.length <= 255, `Slug length ${longSlug1.length} exceeds 255!`);

  await prisma.product.create({
    data: {
      vendorId: store.id,
      name: superLongName,
      slug: longSlug1,
      sku: 'LONG-SKU-1',
      basePrice: 100,
      taxPercent: 5,
    },
  });

  const longSlug2 = await resolveUniqueProductSlug(prisma, store.id, store.slug, superLongName, superLongSku);
  console.log(`  Long Slug 2 (len=${longSlug2.length}): "${longSlug2}"`);
  assert(longSlug2.length <= 255, `Slug length ${longSlug2.length} exceeds 255!`);
  assert(longSlug2.endsWith('-1'), `Must end with -1 suffix`);

  console.log('  ✓ SCENARIO 3 PASSED: Slug length is safely bounded under 255 chars with auto-increment suffix!\n');

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 4: Bulk Upload - Multi-variant Rows with Same Name
  // (The critical bug where finding by name caused rows to overwrite each other)
  // ─────────────────────────────────────────────────────────────
  console.log('[SCENARIO 4] Bulk Upload: Multiple Rows with Same Name but Different SKUs');
  const multiVariantRows = [
    {
      'Item Name': 'Tata Salt Vacuum Evaporated',
      'SKU': 'TATA-SALT-1KG',
      'Net Rate': 28,
      'Tax %': 0,
      'Category': 'Hardcore Test Category',
      'Stock': 100,
    },
    {
      'Item Name': 'Tata Salt Vacuum Evaporated',
      'SKU': 'TATA-SALT-500G',
      'Net Rate': 16,
      'Tax %': 0,
      'Category': 'Hardcore Test Category',
      'Stock': 50,
    },
    {
      'Item Name': 'Tata Salt Vacuum Evaporated',
      'SKU': 'TATA-SALT-LITE',
      'Net Rate': 42,
      'Tax %': 0,
      'Category': 'Hardcore Test Category',
      'Stock': 75,
    },
  ];

  const excelBuf1 = createExcelBuffer(multiVariantRows);
  const previewReq1 = makeVendorRequest(excelBuf1, 'preview');
  const previewRes1 = await handleVendorProductImport(previewReq1, vendorCtx);
  const previewJson1 = await previewRes1.json();

  console.log(`  Preview response: creates=${previewJson1.data.creates}, updates=${previewJson1.data.updates}`);
  assert.strictEqual(previewJson1.data.creates, 3, 'Preview must identify all 3 distinct SKUs as creates');
  assert.strictEqual(previewJson1.data.updates, 0, 'Preview must not falsely classify different SKUs as updates');

  const commitReq1 = makeVendorRequest(excelBuf1, 'commit');
  const commitRes1 = await handleVendorProductImport(commitReq1, vendorCtx);
  const commitJson1 = await commitRes1.json();

  console.log(`  Commit response: created=${commitJson1.data.created}, updated=${commitJson1.data.updated}`);
  assert.strictEqual(commitJson1.data.created, 3, 'Commit must create 3 separate products');
  assert.strictEqual(commitJson1.data.updated, 0, 'Commit must not update/overwrite');

  // Verify DB state
  const tataProducts = await prisma.product.findMany({
    where: { vendorId: store.id, name: 'Tata Salt Vacuum Evaporated' },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`  Found ${tataProducts.length} products in DB for "Tata Salt Vacuum Evaporated":`);
  tataProducts.forEach((p, idx) => {
    console.log(`    [${idx + 1}] SKU="${p.sku}", Slug="${p.slug}", BasePrice=${p.basePrice}`);
  });
  assert.strictEqual(tataProducts.length, 3, 'DB must contain exactly 3 products');
  assert(tataProducts[0].slug.includes('tata-salt-1kg'), 'Slug 1 must include SKU 1');
  assert(tataProducts[1].slug.includes('tata-salt-500g'), 'Slug 2 must include SKU 2');
  assert(tataProducts[2].slug.includes('tata-salt-lite'), 'Slug 3 must include SKU 3');

  console.log('  ✓ SCENARIO 4 PASSED: Multi-variant bulk upload created 3 distinct listings without overwriting!\n');

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 5: Bulk Upload - Re-upload / Update Same SKU
  // ─────────────────────────────────────────────────────────────
  console.log('[SCENARIO 5] Bulk Upload: Re-uploading to Update Existing SKU');
  const updateRows = [
    {
      'Item Name': 'Tata Salt Vacuum Evaporated',
      'SKU': 'TATA-SALT-1KG',
      'Net Rate': 32, // updated from 28
      'Tax %': 0,
      'Category': 'Hardcore Test Category',
      'Stock': 150,
    },
  ];

  const excelBuf2 = createExcelBuffer(updateRows);
  const commitReq2 = makeVendorRequest(excelBuf2, 'commit');
  const commitRes2 = await handleVendorProductImport(commitReq2, vendorCtx);
  const commitJson2 = await commitRes2.json();

  console.log(`  Commit response: created=${commitJson2.data.created}, updated=${commitJson2.data.updated}`);
  assert.strictEqual(commitJson2.data.created, 0, 'Should not create new row');
  assert.strictEqual(commitJson2.data.updated, 1, 'Should update existing row');

  const updatedTata1kg = await prisma.product.findFirst({
    where: { vendorId: store.id, vendorSku: 'TATA-SALT-1KG' },
  });
  assert.strictEqual(Number(updatedTata1kg?.basePrice), 32, 'Base price must be updated to 32');
  console.log(`  ✓ Updated product in DB: BasePrice=${updatedTata1kg?.basePrice}, Slug="${updatedTata1kg?.slug}"`);
  console.log('  ✓ SCENARIO 5 PASSED: Re-importing matches by SKU and updates correctly!\n');

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 6: Bulk Upload - Repeated Slug Collision Handling
  // If an import row produces a slug that collides with an existing product
  // ─────────────────────────────────────────────────────────────
  console.log('[SCENARIO 6] Bulk Upload: Auto-Increment on In-File / DB Collision');
  // Two rows in file with identical names and identical SKUs (common dirty export error)
  const duplicateRowsInFile = [
    {
      'Item Name': 'Fortune Sunlite Sunflower Oil 1L',
      'SKU': 'FORTUNE-SUN-1L',
      'Net Rate': 140,
      'Tax %': 5,
      'Category': 'Hardcore Test Category',
      'Stock': 50,
    },
    {
      'Item Name': 'Fortune Sunlite Sunflower Oil 1L',
      'SKU': 'FORTUNE-SUN-1L', // duplicate in file!
      'Net Rate': 145, // in-file second row updates the first row
      'Tax %': 5,
      'Category': 'Hardcore Test Category',
      'Stock': 60,
    },
  ];

  const excelBuf3 = createExcelBuffer(duplicateRowsInFile);
  const commitReq3 = makeVendorRequest(excelBuf3, 'commit');
  const commitRes3 = await handleVendorProductImport(commitReq3, vendorCtx);
  const commitJson3 = await commitRes3.json();

  console.log(`  In-file duplicate commit response: created=${commitJson3.data.created}, updated=${commitJson3.data.updated}`);
  assert.strictEqual(commitJson3.data.created, 1, 'First row creates');
  assert.strictEqual(commitJson3.data.updated, 1, 'Second row in file updates the first row');

  const fortuneProduct = await prisma.product.findFirst({
    where: { vendorId: store.id, vendorSku: 'FORTUNE-SUN-1L' },
  });
  assert.strictEqual(Number(fortuneProduct?.basePrice), 145, 'Should have updated price from 2nd row');
  console.log(`  ✓ In-file duplicate handled: Final Price=${fortuneProduct?.basePrice}, Slug="${fortuneProduct?.slug}"`);
  console.log('  ✓ SCENARIO 6 PASSED: In-file duplicates cleanly update without inserting duplicate rows!\n');

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 7: Bulk Upload - Row Without SKU
  // Rows where user only provides Product Name
  // ─────────────────────────────────────────────────────────────
  console.log('[SCENARIO 7] Bulk Upload: Row Without SKU');
  const noSkuRows = [
    {
      'Item Name': 'Pure Cane Sugar 1kg',
      'Net Rate': 45,
      'Tax %': 5,
      'Category': 'Hardcore Test Category',
      'Stock': 100,
    },
  ];

  const excelBuf4 = createExcelBuffer(noSkuRows);
  const commitReq4 = makeVendorRequest(excelBuf4, 'commit');
  const commitRes4 = await handleVendorProductImport(commitReq4, vendorCtx);
  const commitJson4 = await commitRes4.json();

  console.log(`  No-SKU commit response: created=${commitJson4.data.created}, updated=${commitJson4.data.updated}`);
  assert.strictEqual(commitJson4.data.created, 1);

  const sugarProduct = await prisma.product.findFirst({
    where: { vendorId: store.id, name: 'Pure Cane Sugar 1kg' },
  });
  console.log(`  ✓ Created No-SKU Product: Slug="${sugarProduct?.slug}"`);
  assert(sugarProduct?.slug.includes('hardcore-store-slug-pure-cane-sugar-1kg'), 'Slug must include store and name');

  // Re-importing same name without SKU updates it
  const commitReq4b = makeVendorRequest(excelBuf4, 'commit');
  const commitRes4b = await handleVendorProductImport(commitReq4b, vendorCtx);
  const commitJson4b = await commitRes4b.json();
  console.log(`  Re-import No-SKU response: created=${commitJson4b.data.created}, updated=${commitJson4b.data.updated}`);
  assert.strictEqual(commitJson4b.data.updated, 1, 'Re-importing without SKU updates existing product with same name');
  console.log('  ✓ SCENARIO 7 PASSED: Rows without SKU mint store-name slug and update on name match!\n');

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 8: Admin Import Endpoint Verification
  // ─────────────────────────────────────────────────────────────
  console.log('[SCENARIO 8] Admin Import Route Verification');
  const adminRows = [
    {
      'Item Name': 'Taj Mahal Tea 500g',
      'SKU': 'TAJ-500',
      'Net Rate': 350,
      'Tax %': 5,
      'Category': 'Hardcore Test Category',
      'Stock': 40,
    },
    {
      'Item Name': 'Taj Mahal Tea 500g',
      'SKU': 'TAJ-250',
      'Net Rate': 185,
      'Tax %': 5,
      'Category': 'Hardcore Test Category',
      'Stock': 60,
    },
  ];

  const adminExcelBuf = createExcelBuffer(adminRows);
  const adminCommitReq = makeAdminRequest(adminExcelBuf, store.id, 'commit');
  const adminCommitRes = await handleAdminProductImport(adminCommitReq, adminCtx);
  const adminCommitJson = await adminCommitRes.json();

  console.log(`  Admin commit response: created=${adminCommitJson.data.created}, updated=${adminCommitJson.data.updated}`);
  assert.strictEqual(adminCommitJson.data.created, 2, 'Admin import must create 2 distinct products for different SKUs');
  assert.strictEqual(adminCommitJson.data.updated, 0);

  const teaProducts = await prisma.product.findMany({
    where: { vendorId: store.id, name: 'Taj Mahal Tea 500g' },
  });
  assert.strictEqual(teaProducts.length, 2);
  console.log(`  ✓ Admin imported products:`);
  teaProducts.forEach((p) => console.log(`    Slug="${p.slug}", SKU="${p.sku}"`));
  console.log('  ✓ SCENARIO 8 PASSED: Admin import creates distinct products with store-product-name-sku slugs!\n');

  // Cleanup test products
  await prisma.product.deleteMany({
    where: { vendorId: store.id },
  });

  console.log('================================================================');
  console.log('   ALL 8 ENDLESS SCENARIOS PASSED WITH ZERO ERRORS! BULLETPROOF! ');
  console.log('================================================================');
}

runHardcoreTesting()
  .catch((err) => {
    console.error('\n❌ HARDCORE TEST FAILED:', err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
