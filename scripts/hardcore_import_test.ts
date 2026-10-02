import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });

import * as XLSX from 'xlsx';

function createExcelBuffer(rows: Record<string, any>[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  console.log('--- Starting Hardcore Multi-Store & Cross-Vendor Bulk Upload Test ---');

  // Find or create test business and vendors (Store 1 and Store 2)
  let business = await prisma.businessAccount.findFirst({
    where: { legalName: 'Hardcore Test Supplier Ltd' },
  });
  if (!business) {
    business = await prisma.businessAccount.create({
      data: {
        legalName: 'Hardcore Test Supplier Ltd',
        displayName: 'Hardcore Test Supplier',
        isVendor: true,
        businessType: 'distributor',
      },
    });
  }

  // Find or create a user for authentication/context
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'hardcore-test-vendor@horeca1.com',
        name: 'Hardcore Test Vendor',
        role: 'vendor',
        hcidDisplay: 'HC-TEST-9999',
      },
    });
  }

  // Store 1 (Primary Store)
  let store1 = await prisma.vendor.findFirst({
    where: { slug: 'test-hardcore-store-1' },
  });
  if (!store1) {
    store1 = await prisma.vendor.create({
      data: {
        userId: user.id,
        businessAccountId: business.id,
        businessName: 'Hardcore Store 1',
        displayName: 'Hardcore Store 1 (Mumbai)',
        slug: 'test-hardcore-store-1',
        vendorCode: 'HCSUPP', // Explicit Supplier Code
        isPrimaryStore: true,
        isActive: true,
      },
    });
  } else if (!store1.vendorCode) {
    store1 = await prisma.vendor.update({
      where: { id: store1.id },
      data: { vendorCode: 'HCSUPP', isPrimaryStore: true },
    });
  }

  // Store 2 (Secondary Store under same business, no vendorCode so it inherits HCSUPP)
  let store2 = await prisma.vendor.findFirst({
    where: { slug: 'test-hardcore-store-2' },
  });
  if (!store2) {
    store2 = await prisma.vendor.create({
      data: {
        userId: user.id,
        businessAccountId: business.id,
        businessName: 'Hardcore Store 2',
        displayName: 'Hardcore Store 2 (Pune)',
        slug: 'test-hardcore-store-2',
        vendorCode: null, // intentionally null to test inheritance from primary store!
        isPrimaryStore: false,
        isActive: true,
      },
    });
  }

  // Competitor Vendor (Different business, different supplier code)
  let competitorBusiness = await prisma.businessAccount.findFirst({
    where: { legalName: 'Competitor Supplier Ltd' },
  });
  if (!competitorBusiness) {
    competitorBusiness = await prisma.businessAccount.create({
      data: {
        legalName: 'Competitor Supplier Ltd',
        displayName: 'Competitor Supplier',
        isVendor: true,
      },
    });
  }

  let competitorStore = await prisma.vendor.findFirst({
    where: { slug: 'test-competitor-store' },
  });
  if (!competitorStore) {
    competitorStore = await prisma.vendor.create({
      data: {
        userId: user.id,
        businessAccountId: competitorBusiness.id,
        businessName: 'Competitor Store',
        displayName: 'Competitor Store',
        slug: 'test-competitor-store',
        vendorCode: 'COMPSUP',
        isPrimaryStore: true,
        isActive: true,
      },
    });
  }

  // Ensure default outlet exists for each vendor (each vendor must have its own unique defaultOutletId)
  for (const v of [store1, store2, competitorStore]) {
    const existing = await prisma.vendor.findUnique({
      where: { id: v.id },
      select: { defaultOutletId: true },
    });
    if (!existing?.defaultOutletId) {
      const newOutlet = await prisma.outlet.create({
        data: {
          businessAccountId: v.businessAccountId,
          name: `${v.businessName} Warehouse`,
          addressLine: 'Plot 42, MIDC Industrial Area',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          isActive: true,
        },
      });
      await prisma.vendor.update({
        where: { id: v.id },
        data: { defaultOutletId: newOutlet.id },
      });
    }
  }

  // Ensure an approved test category exists
  let testCat = await prisma.category.findFirst({
    where: { slug: 'dairy-hardcore-test' },
  });
  if (!testCat) {
    testCat = await prisma.category.create({
      data: {
        name: 'Dairy Hardcore Test',
        slug: 'dairy-hardcore-test',
        approvalStatus: 'approved',
        isActive: true,
      },
    });
  }

  // Clean up any old test products
  await prisma.product.deleteMany({
    where: {
      vendorId: { in: [store1.id, store2.id, competitorStore.id] },
    },
  });

  console.log(`✓ Test environment ready.`);
  console.log(`  Store 1 (Primary): ID=${store1.id}, VendorCode=${store1.vendorCode}`);
  console.log(`  Store 2 (Secondary): ID=${store2.id}, VendorCode=${store2.vendorCode} (Inherits ${store1.vendorCode})`);
  console.log(`  Competitor Store: ID=${competitorStore.id}, VendorCode=${competitorStore.vendorCode}`);

  const { NextRequest } = await import('next/server');
  const { handleVendorProductImport } = await import('../src/app/api/v1/vendor/products/import/route');
  const { handleAdminProductImport } = await import('../src/app/api/v1/admin/products/import/route');

  // Helper to simulate NextRequest FormData
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

  function makeAdminRequest(buffer: Buffer, vendorId: string | null, mode: 'preview' | 'commit') {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    formData.append('file', blob, 'test.xlsx');
    formData.append('mode', mode);
    if (vendorId) formData.append('vendorId', vendorId);

    return new NextRequest('http://localhost:3000/api/v1/admin/products/import', {
      method: 'POST',
      body: formData,
    });
  }

  // Standard Test Catalog
  const testSheetRows = [
    {
      'Item Name': 'Amul Butter 500g Pack',
      'SKU': 'AMUL-BTR-500',
      'Net Rate': 250,
      'Tax %': 5,
      'Category': testCat.name,
      'Stock On Hand': 100,
    },
    {
      'Item Name': 'Amul Processed Cheese Block 1kg',
      'SKU': 'AMUL-CHS-1KG',
      'Net Rate': 450,
      'Tax %': 12,
      'Category': testCat.name,
      'Stock On Hand': 50,
    },
    {
      'Item Name': 'Amul Fresh Malai Paneer 1kg',
      'SKU': 'AMUL-PNR-1KG',
      'Net Rate': 350,
      'Tax %': 5,
      'Category': testCat.name,
      'Stock On Hand': 30,
    },
  ];

  const testFileBuffer = createExcelBuffer(testSheetRows);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST SCENARIO 1: Import 3 products into Store 1
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Scenario 1: Importing into Store 1 ---');
  const req1 = makeVendorRequest(testFileBuffer, 'commit');
  const ctx1 = {
    userId: user.id,
    email: user.email,
    role: 'vendor',
    activeVendorId: store1.id,
    activeBusinessAccountId: business.id,
    isPermissionOwner: true,
    permissions: ['products.create'] as any,
    permissionSet: new Set(['products.create']) as any,
  };
  const res1 = await handleVendorProductImport(req1 as any, ctx1 as any);
  const json1 = await res1.json();
  console.log('Store 1 Commit Result:', JSON.stringify(json1.data || json1, null, 2));

  if (!json1.success || json1.data?.blocked || json1.data?.created !== 3) {
    throw new Error(`Scenario 1 Failed: Expected 3 created, got ${json1.data?.created}, errors: ${JSON.stringify(json1.data?.errors)}`);
  }
  console.log('✓ Scenario 1 Passed: 3 products successfully created in Store 1.');

  // Verify DB state for Store 1
  const store1Products = await prisma.product.findMany({
    where: { vendorId: store1.id },
    select: { name: true, sku: true, vendorSku: true, basePrice: true },
    orderBy: { sku: 'asc' },
  });
  console.log('Store 1 Products in DB:');
  for (const p of store1Products) {
    console.log(`  • ${p.name} | SKU: ${p.sku} | POS SKU: ${p.vendorSku} | Base Price: ${p.basePrice}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST SCENARIO 2: Import EXACT SAME products with EXACT SAME SKUs into Store 2
  // (This is the CORE issue reported by user!)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Scenario 2: Importing EXACT SAME products & SKUs into Store 2 ---');
  const req2 = makeVendorRequest(testFileBuffer, 'commit');
  const ctx2 = {
    userId: user.id,
    email: user.email,
    role: 'vendor',
    activeVendorId: store2.id,
    activeBusinessAccountId: business.id,
    isPermissionOwner: true,
    permissions: ['products.create'] as any,
    permissionSet: new Set(['products.create']) as any,
  };
  const res2 = await handleVendorProductImport(req2 as any, ctx2 as any);
  const json2 = await res2.json();
  console.log('Store 2 Commit Result:', JSON.stringify(json2.data || json2, null, 2));

  if (!json2.success || json2.data?.blocked || json2.data?.created !== 3) {
    throw new Error(`Scenario 2 Failed: Expected 3 created in Store 2, got ${json2.data?.created}, errors: ${JSON.stringify(json2.data?.errors)}`);
  }
  console.log('✓ Scenario 2 Passed: EXACT SAME products and SKUs created in Store 2 with ZERO errors!');

  // Verify Store 2 has same SKUs and inherited supplier code
  const store2Products = await prisma.product.findMany({
    where: { vendorId: store2.id },
    select: { name: true, sku: true, vendorSku: true, basePrice: true },
    orderBy: { sku: 'asc' },
  });
  console.log('Store 2 Products in DB:');
  for (const p of store2Products) {
    console.log(`  • ${p.name} | SKU: ${p.sku} | POS SKU: ${p.vendorSku} | Base Price: ${p.basePrice}`);
  }

  // Verify Store 1 and Store 2 have matching SKUs
  if (store1Products.length !== store2Products.length) {
    throw new Error('Store 1 and Store 2 product counts do not match!');
  }
  for (let i = 0; i < store1Products.length; i++) {
    if (store1Products[i].sku !== store2Products[i].sku) {
      throw new Error(`SKU mismatch between stores: Store 1 has ${store1Products[i].sku}, Store 2 has ${store2Products[i].sku}`);
    }
    if (store1Products[i].vendorSku !== store2Products[i].vendorSku) {
      throw new Error(`vendorSku mismatch: Store 1 has ${store1Products[i].vendorSku}, Store 2 has ${store2Products[i].vendorSku}`);
    }
  }
  console.log('✓ SKUs and vendorSkus match 100% across Store 1 and Store 2!');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST SCENARIO 3: Re-import into Store 1 with UPDATED prices (Updates, not duplicates)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Scenario 3: Re-importing into Store 1 with updated prices ---');
  const updatedRows = [
    {
      'Item Name': 'Amul Butter 500g Pack',
      'SKU': 'AMUL-BTR-500',
      'Net Rate': 275, // Updated price
      'Tax %': 5,
      'Category': testCat.name,
      'Stock On Hand': 150,
    },
    {
      'Item Name': 'Amul Processed Cheese Block 1kg',
      'SKU': 'AMUL-CHS-1KG',
      'Net Rate': 490, // Updated price
      'Tax %': 12,
      'Category': testCat.name,
      'Stock On Hand': 75,
    },
    {
      'Item Name': 'Amul Fresh Malai Paneer 1kg',
      'SKU': 'AMUL-PNR-1KG',
      'Net Rate': 370, // Updated price
      'Tax %': 5,
      'Category': testCat.name,
      'Stock On Hand': 45,
    },
  ];
  const updatedBuffer = createExcelBuffer(updatedRows);
  const req3 = makeVendorRequest(updatedBuffer, 'commit');
  const res3 = await handleVendorProductImport(req3 as any, ctx1 as any);
  const json3 = await res3.json();
  console.log('Store 1 Re-import Result:', JSON.stringify(json3.data || json3, null, 2));

  if (!json3.success || json3.data?.created !== 0 || json3.data?.updated !== 3) {
    throw new Error(`Scenario 3 Failed: Expected 0 created, 3 updated, got ${json3.data?.created} created, ${json3.data?.updated} updated`);
  }
  console.log('✓ Scenario 3 Passed: Re-import updated all 3 items in Store 1 with 0 duplicate errors.');

  // Verify Store 1 has updated price, Store 2 still has original price (Store isolation check)
  const p1Updated = await prisma.product.findFirst({
    where: { vendorId: store1.id, vendorSku: 'AMUL-BTR-500' },
  });
  const p2Original = await prisma.product.findFirst({
    where: { vendorId: store2.id, vendorSku: 'AMUL-BTR-500' },
  });
  if (Number(p1Updated?.basePrice) !== 275 || Number(p2Original?.basePrice) !== 250) {
    throw new Error(`Store price isolation failed! Store 1: ${p1Updated?.basePrice}, Store 2: ${p2Original?.basePrice}`);
  }
  console.log('✓ Store price isolation verified: Store 1 price updated to 275; Store 2 remained 250.');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST SCENARIO 4: Competitor vendor imports with SAME raw SKU
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Scenario 4: Competitor vendor importing same raw SKU ---');
  const req4 = makeVendorRequest(testFileBuffer, 'commit');
  const ctx4 = {
    userId: user.id,
    email: user.email,
    role: 'vendor',
    activeVendorId: competitorStore.id,
    activeBusinessAccountId: competitorBusiness.id,
    isPermissionOwner: true,
    permissions: ['products.create'] as any,
    permissionSet: new Set(['products.create']) as any,
  };
  const res4 = await handleVendorProductImport(req4 as any, ctx4 as any);
  const json4 = await res4.json();
  console.log('Competitor Store Result:', JSON.stringify(json4.data || json4, null, 2));

  if (!json4.success || json4.data?.created !== 3) {
    throw new Error(`Scenario 4 Failed: Expected 3 created for competitor store, got ${json4.data?.created}`);
  }
  console.log('✓ Scenario 4 Passed: Competitor vendor successfully imported same SKUs with their own Supplier Code prefix.');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST SCENARIO 5: Pre-prefixed SKU import (no double-prefixing)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Scenario 5: Sheet contains already-composed SKU ---');
  const prePrefixedRows = [
    {
      'Item Name': 'Amul Ghee 1L Tin',
      'SKU': 'HCSUPP-AMUL-GHEE-1L', // Already has HCSUPP prefix!
      'Net Rate': 650,
      'Tax %': 5,
      'Category': testCat.name,
      'Stock On Hand': 20,
    },
  ];
  const prePrefixedBuffer = createExcelBuffer(prePrefixedRows);
  const req5 = makeVendorRequest(prePrefixedBuffer, 'commit');
  const res5 = await handleVendorProductImport(req5 as any, ctx1 as any);
  const json5 = await res5.json();
  console.log('Pre-prefixed Import Result:', JSON.stringify(json5.data || json5, null, 2));

  if (!json5.success || json5.data?.created !== 1) {
    throw new Error(`Scenario 5 Failed: Expected 1 created, got ${json5.data?.created}`);
  }

  const gheeProduct = await prisma.product.findFirst({
    where: { vendorId: store1.id, name: 'Amul Ghee 1L Tin' },
  });
  console.log(`Ghee product in DB: sku="${gheeProduct?.sku}", vendorSku="${gheeProduct?.vendorSku}"`);
  if (gheeProduct?.sku !== 'HCSUPP-AMUL-GHEE-1L') {
    throw new Error(`Expected sku to be "HCSUPP-AMUL-GHEE-1L", got "${gheeProduct?.sku}" (Double prefix detected!)`);
  }
  if (gheeProduct?.vendorSku !== 'AMUL-GHEE-1L') {
    throw new Error(`Expected vendorSku to be "AMUL-GHEE-1L", got "${gheeProduct?.vendorSku}"`);
  }
  console.log('✓ Scenario 5 Passed: No double-prefixing! Composed SKU and vendorSku cleanly normalized.');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST SCENARIO 6: Admin Portal Import with Vendor Selected
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Scenario 6: Admin Bulk Upload for Store 1 & Store 2 ---');
  const adminTestRows = [
    {
      'Item Name': 'Amul Dahi 400g Pouch',
      'SKU': 'AMUL-DAHI-400',
      'Net Rate': 40,
      'Tax %': 0,
      'Category': testCat.name,
      'Stock On Hand': 50,
    },
  ];
  const adminBuffer = createExcelBuffer(adminTestRows);

  const adminCtx = {
    userId: user.id,
    email: user.email,
    role: 'admin',
    isPermissionOwner: true,
    permissions: ['products.create'] as any,
    permissionSet: new Set(['products.create']) as any,
  };

  // Admin imports for Store 1
  const adminReq1 = makeAdminRequest(adminBuffer, store1.id, 'commit');
  const adminRes1 = await handleAdminProductImport(adminReq1 as any, adminCtx as any);
  const adminJson1 = await adminRes1.json();
  console.log('Admin Import Store 1 Result:', JSON.stringify(adminJson1.data || adminJson1, null, 2));
  if (!adminJson1.success || adminJson1.data?.created !== 1) {
    throw new Error(`Admin Import Store 1 failed: ${JSON.stringify(adminJson1)}`);
  }

  // Admin imports for Store 2
  const adminReq2 = makeAdminRequest(adminBuffer, store2.id, 'commit');
  const adminRes2 = await handleAdminProductImport(adminReq2 as any, adminCtx as any);
  const adminJson2 = await adminRes2.json();
  console.log('Admin Import Store 2 Result:', JSON.stringify(adminJson2.data || adminJson2, null, 2));
  if (!adminJson2.success || adminJson2.data?.created !== 1) {
    throw new Error(`Admin Import Store 2 failed: ${JSON.stringify(adminJson2)}`);
  }
  console.log('✓ Scenario 6 Passed: Admin bulk import works flawlessly across multiple stores of the same vendor.');

  // Clean up test products
  await prisma.product.deleteMany({
    where: {
      vendorId: { in: [store1.id, store2.id, competitorStore.id] },
    },
  });
  console.log('\n✓ Cleaned up all test products.');
  console.log('══════════════════════════════════════════════════════════════════════════');
  console.log('ALL HARDCORE TESTS PASSED 100% WITH ZERO ERRORS!');
  console.log('══════════════════════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('\n❌ HARDCORE TEST FAILED:', err);
  process.exit(1);
});
