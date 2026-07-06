/**
 * Verifies SKU-based inventory bulk import (bulkUpdateStockBySku).
 * Run: npx tsx prisma/scripts/verify-inventory-import.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { ensureInventoryRowsForOutlet } from '../../src/lib/inventoryOutlet';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const vendor = await prisma.vendor.findFirst({
    where: { products: { some: {} } },
    include: {
      businessAccount: { include: { outlets: { where: { isActive: true }, take: 1 } } },
      products: { take: 1, select: { id: true, sku: true, vendorSku: true } },
    },
  });

  if (!vendor?.products[0]) {
    console.log('SKIP: no vendor with products');
    process.exit(0);
  }

  const outlet = vendor.businessAccount?.outlets[0];
  if (!outlet) {
    console.log('SKIP: no active outlet');
    process.exit(0);
  }

  const product = vendor.products[0];
  const sku = product.vendorSku || product.sku || product.id;
  await ensureInventoryRowsForOutlet(vendor.id, outlet.id);

  const before = await prisma.inventory.findFirst({
    where: { vendorId: vendor.id, productId: product.id, outletId: outlet.id },
  });
  const restoreQty = before?.qtyAvailable ?? 0;
  const restoreThreshold = before?.lowStockThreshold ?? 0;

  const svc = new InventoryService();
  const testQty = 77;
  const testThreshold = 5;

  const result = await svc.bulkUpdateStockBySku({
    vendorId: vendor.id,
    businessAccountId: vendor.businessAccountId!,
    defaultOutletId: outlet.id,
    multiWarehouse: false,
    items: [{ sku, qtyAvailable: testQty, lowStockThreshold: testThreshold }],
  });

  const after = await prisma.inventory.findFirst({
    where: { vendorId: vendor.id, productId: product.id, outletId: outlet.id },
  });

  const ok =
    result.updated === 1 &&
    after?.qtyAvailable === testQty &&
    after?.lowStockThreshold === testThreshold;

  console.log(`SKU: ${sku}`);
  console.log(`Result: matched=${result.matched} updated=${result.updated} skipped=${result.skipped}`);
  console.log(`Qty: ${restoreQty} → ${after?.qtyAvailable} (expected ${testQty})`);
  console.log(ok ? '✓ PASS inventory SKU import' : '✗ FAIL inventory SKU import');

  // Restore original values
  if (before) {
    await prisma.inventory.update({
      where: { productId_outletId: { productId: product.id, outletId: outlet.id } },
      data: { qtyAvailable: restoreQty, lowStockThreshold: restoreThreshold },
    });
  }

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
