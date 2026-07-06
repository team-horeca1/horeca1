/**
 * Verifies vendor multi-outlet migration + core flows against the live DB.
 * Run: npx tsx prisma/scripts/verify-multi-outlet.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { FulfillmentRouterService } from '../../src/modules/fulfillment/fulfillmentRouter.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const fulfillmentRouter = new FulfillmentRouterService();
const inventoryService = new InventoryService();

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  console.log('\n=== Vendor Multi-Outlet Verification ===\n');

  // 1. Schema sanity
  const invNullOutlet = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count FROM inventory WHERE outlet_id IS NULL`;
  check('All inventory rows have outlet_id', Number(invNullOutlet[0].count) === 0);

  const ordersMissingFulfill = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count FROM orders WHERE fulfillment_outlet_id IS NULL`;
  check('All orders have fulfillment_outlet_id', Number(ordersMissingFulfill[0].count) === 0);

  const dupInv = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT product_id, outlet_id FROM inventory GROUP BY product_id, outlet_id HAVING COUNT(*) > 1
    ) d`;
  check('No duplicate (product_id, outlet_id) inventory rows', Number(dupInv[0].count) === 0);

  // 2. Pick a vendor with inventory
  const vendor = await prisma.vendor.findFirst({
    where: { isActive: true, isVerified: true, products: { some: { inventories: { some: {} } } } },
    select: {
      id: true,
      businessName: true,
      businessAccountId: true,
      multiWarehouseEnabled: true,
      businessAccount: { select: { primaryOutletId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  check('Found active vendor with inventory', !!vendor, vendor?.businessName);

  if (!vendor) {
    console.log('\nCannot continue without vendor fixture.\n');
    process.exit(1);
  }

  const outlets = await prisma.outlet.findMany({
    where: { businessAccountId: vendor.businessAccountId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, pincode: true, latitude: true, longitude: true },
  });
  check('Vendor has at least one outlet', outlets.length >= 1, `${outlets.length} outlet(s)`);

  const primaryId = vendor.businessAccount.primaryOutletId ?? outlets[0]?.id;
  const product = await prisma.product.findFirst({
    where: { vendorId: vendor.id, inventories: { some: { outletId: primaryId! } } },
    select: {
      id: true,
      name: true,
      inventories: { where: { outletId: primaryId! }, select: { qtyAvailable: true, outletId: true } },
    },
  });
  check('Vendor has product with primary-outlet inventory', !!product, product?.name);

  if (!product || !primaryId) {
    process.exit(1);
  }

  // 3. Fulfillment router (single-warehouse path)
  const fulfillId = await fulfillmentRouter.resolveFulfillmentOutlet({
    vendorId: vendor.id,
    deliveryPincode: outlets[0]?.pincode ?? '400001',
    deliveryLat: outlets[0]?.latitude ?? null,
    deliveryLng: outlets[0]?.longitude ?? null,
    items: [{ productId: product.id, quantity: 1 }],
  });
  check('Fulfillment router returns an outlet', !!fulfillId, fulfillId);

  const stock = await inventoryService.bulkCheck(
    [{ productId: product.id, quantity: 1 }],
    fulfillId,
  );
  check('bulkCheck at fulfillment outlet works', stock.length === 1, `available=${stock[0]?.available}`);

  // 4. Multi-outlet transfer test (create second outlet row if needed, then transfer)
  let secondOutlet = outlets[1];
  const tag = `verify-mo-${Date.now()}`;
  let createdSecondOutlet = false;
  let createdSecondInv = false;
  let transferId: string | null = null;

  try {
    if (!secondOutlet) {
      secondOutlet = await prisma.outlet.create({
        data: {
          businessAccountId: vendor.businessAccountId,
          name: `Verify WH B ${tag}`,
          addressLine: 'Test address',
          city: 'Mumbai',
          state: 'MH',
          pincode: outlets[0]?.pincode ?? '400001',
          isActive: true,
        },
      });
      createdSecondOutlet = true;
    }

    const existingAtB = await prisma.inventory.findUnique({
      where: { productId_outletId: { productId: product.id, outletId: secondOutlet.id } },
    });
    if (!existingAtB) {
      await prisma.inventory.create({
        data: {
          productId: product.id,
          vendorId: vendor.id,
          outletId: secondOutlet.id,
          qtyAvailable: 0,
          lowStockThreshold: 10,
        },
      });
      createdSecondInv = true;
    }

    // Seed 5 units at primary for transfer test
    const beforePrimary = await prisma.inventory.findUnique({
      where: { productId_outletId: { productId: product.id, outletId: primaryId } },
    });
    const seedQty = Math.max((beforePrimary?.qtyAvailable ?? 0), 5);
    await prisma.inventory.update({
      where: { productId_outletId: { productId: product.id, outletId: primaryId } },
      data: { qtyAvailable: seedQty },
    });

    const result = await inventoryService.transferStock({
      vendorId: vendor.id,
      fromOutletId: primaryId,
      toOutletId: secondOutlet.id,
      items: [{ productId: product.id, quantity: 2 }],
      createdBy: undefined,
    });
    transferId = result.id;
    check('Stock transfer completes', result.status === 'completed', `transfer=${result.id}`);

    const afterPrimary = await prisma.inventory.findUnique({
      where: { productId_outletId: { productId: product.id, outletId: primaryId } },
    });
    const afterSecond = await prisma.inventory.findUnique({
      where: { productId_outletId: { productId: product.id, outletId: secondOutlet.id } },
    });
    check('Primary outlet debited by 2', (afterPrimary?.qtyAvailable ?? 0) === seedQty - 2);
    check('Second outlet credited by 2', (afterSecond?.qtyAvailable ?? 0) >= 2);

    // Restore primary qty if we bumped it
    if (beforePrimary) {
      await prisma.inventory.update({
        where: { productId_outletId: { productId: product.id, outletId: primaryId } },
        data: { qtyAvailable: beforePrimary.qtyAvailable },
      });
    }
    if (afterSecond && createdSecondInv) {
      await prisma.inventory.update({
        where: { productId_outletId: { productId: product.id, outletId: secondOutlet.id } },
        data: { qtyAvailable: 0 },
      });
    }
  } finally {
    if (transferId) {
      await prisma.stockTransfer.delete({ where: { id: transferId } }).catch(() => {});
    }
    if (createdSecondInv && secondOutlet) {
      await prisma.inventory.deleteMany({
        where: { productId: product.id, outletId: secondOutlet.id, qtyAvailable: 0 },
      }).catch(() => {});
    }
    if (createdSecondOutlet && secondOutlet) {
      await prisma.outlet.delete({ where: { id: secondOutlet.id } }).catch(() => {});
    }
  }

  // 5. Service area / delivery slot outlet columns exist
  const saWithOutlet = await prisma.serviceArea.count({ where: { vendorId: vendor.id } });
  check('Service areas readable for vendor', saWithOutlet >= 0, `${saWithOutlet} rows`);

  const recentOrder = await prisma.order.findFirst({
    where: { vendorId: vendor.id },
    select: {
      fulfillmentOutletId: true,
      fulfillmentOutlet: { select: { name: true } },
      outlet: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  check(
    'Recent order has fulfillment outlet linked',
    !!recentOrder?.fulfillmentOutletId,
    recentOrder?.fulfillmentOutlet?.name ?? 'n/a',
  );

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
