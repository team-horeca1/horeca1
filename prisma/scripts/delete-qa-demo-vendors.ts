/**
 * Deletes QA test suppliers from the demo database only.
 * Refuses any DATABASE_URL that is not horeca1_demo.
 *
 *   DATABASE_URL=postgresql://horeca1_demo:…@127.0.0.1:5433/horeca1_demo npx tsx prisma/scripts/delete-qa-demo-vendors.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL ?? '';
if (!url.includes('/horeca1_demo')) {
  console.error('Refusing to run. DATABASE_URL must be the demo database horeca1_demo.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function main() {
  const vendors = await prisma.vendor.findMany({
    where: {
      OR: [
        { businessName: { startsWith: 'QA-', mode: 'insensitive' } },
        { displayName: { startsWith: 'QA-', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      userId: true,
      businessAccountId: true,
      businessName: true,
      displayName: true,
      defaultOutletId: true,
    },
  });

  const skipped: string[] = [];
  const deleted: string[] = [];

  for (const vendor of vendors) {
    const settled = await prisma.financeSettlementBatch.count({
      where: { vendorId: vendor.id, status: 'settled' },
    });
    const settledLines = await prisma.supplierPayableLine.count({
      where: { vendorId: vendor.id, status: 'settled' },
    });
    const label = vendor.displayName?.trim() || vendor.businessName;
    if (settled > 0 || settledLines > 0) {
      skipped.push(label);
      console.log(`skip (settled payout): ${label}`);
      continue;
    }

    const orderIds = (await prisma.order.findMany({
      where: { vendorId: vendor.id },
      select: { id: true },
    })).map((row) => row.id);

    await prisma.$transaction(async (tx) => {
      if (orderIds.length > 0) {
        await tx.supplierPayableEvent.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.supplierPayableHold.deleteMany({ where: { line: { orderId: { in: orderIds } } } });
        await tx.supplierPayableLine.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      }
      await tx.supplierPayableLine.deleteMany({ where: { vendorId: vendor.id } });
      await tx.financeSettlementEvent.deleteMany({ where: { batch: { vendorId: vendor.id } } });
      await tx.financeSettlementBatch.deleteMany({ where: { vendorId: vendor.id } });
      await tx.supplierCommissionAgreement.deleteMany({ where: { vendorId: vendor.id } });
      await tx.inventory.deleteMany({ where: { vendorId: vendor.id } });
      await tx.cartItem.deleteMany({ where: { vendorId: vendor.id } });
      await tx.priceSlab.deleteMany({ where: { vendorId: vendor.id } });
      await tx.product.deleteMany({ where: { vendorId: vendor.id } });
      await tx.vendorTeamMember.deleteMany({ where: { vendorId: vendor.id } });
      await tx.serviceArea.deleteMany({ where: { vendorId: vendor.id } });
      await tx.deliverySlot.deleteMany({ where: { vendorId: vendor.id } });
      await tx.vendor.update({ where: { id: vendor.id }, data: { defaultOutletId: null } });
      await tx.vendor.delete({ where: { id: vendor.id } });
    });

    const otherStores = await prisma.vendor.count({ where: { userId: vendor.userId } });
    const customerOrders = await prisma.order.count({ where: { userId: vendor.userId } });
    if (otherStores === 0 && customerOrders === 0) {
      await prisma.user.delete({ where: { id: vendor.userId } }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'user delete failed';
        console.log(`kept user for ${label}: ${message.split('\n')[0]}`);
      });
    }
    deleted.push(label);
    console.log(`deleted: ${label}`);
  }

  console.log(`Done. Deleted ${deleted.length}. Skipped ${skipped.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
