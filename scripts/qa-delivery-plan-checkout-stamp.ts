/**
 * End-to-end: create multi-vendor draft orders with deliveryMode/date stamped.
 * Also verifies soft-block rejects unavailable modes on non-draft create.
 * Run: npx tsx scripts/qa-delivery-plan-checkout-stamp.ts
 */
import { prisma } from '../src/lib/prisma';
import { OrderService, type OrderContext } from '../src/modules/order/order.service';

async function main() {
  const spice = await prisma.vendor.findFirst({
    where: { businessName: { contains: 'Spice Trail', mode: 'insensitive' }, isActive: true },
    select: {
      id: true,
      businessName: true,
      selfPickupOffered: true,
      serviceAreas: {
        where: { pincode: '400708', isActive: true },
        select: {
          pincode: true,
          deliversMon: true,
          deliversWed: true,
          deliversFri: true,
          thirdPartyDeliveryAvailable: true,
        },
      },
    },
  });
  if (!spice) throw new Error('Spice Trail not found');

  const daily = await prisma.vendor.findFirst({
    where: { businessName: { contains: 'Daily Fresh', mode: 'insensitive' }, isActive: true },
    select: {
      id: true,
      businessName: true,
      selfPickupOffered: true,
      serviceAreas: {
        where: { isActive: true, OR: [{ pincode: '400708' }, { pincode: '400710' }] },
        select: {
          pincode: true,
          thirdPartyDeliveryAvailable: true,
          deliversMon: true,
          deliversWed: true,
          deliversFri: true,
        },
      },
    },
  });

  const spiceProduct = await prisma.product.findFirst({
    where: { vendorId: spice.id, isActive: true },
    select: { id: true, name: true },
  });
  if (!spiceProduct) throw new Error('No Spice Trail product');

  const dailyProduct = daily
    ? await prisma.product.findFirst({
        where: { vendorId: daily.id, isActive: true },
        select: { id: true, name: true },
      })
    : null;

  // Prefer the live QA Fresh Customer cart (not another stale cart).
  const cart = await prisma.cart.findFirst({
    where: {
      id: '8d15e251-f860-4d7d-97f0-2b9eafeeae40',
    },
    select: {
      userId: true,
      businessAccountId: true,
      outletId: true,
      user: { select: { fullName: true, email: true } },
      outlet: { select: { id: true, pincode: true, city: true, addressLine: true } },
    },
  });
  if (!cart?.outlet) throw new Error('QA cart / outlet not found');

  const ctx: OrderContext = {
    userId: cart.userId,
    businessAccountId: cart.businessAccountId,
    outletId: cart.outletId,
  };
  const outlet = cart.outlet;

  console.log('customer', cart.user.fullName, outlet.pincode);
  console.log('spice', spice.businessName, spice.serviceAreas, 'selfPickup', spice.selfPickupOffered);
  console.log('daily', daily?.businessName, daily?.serviceAreas, 'selfPickup', daily?.selfPickupOffered);
  console.log('products', spiceProduct.name, dailyProduct?.name);

  const svc = new OrderService();

  // 1) Single-vendor draft with supplier_delivery + date
  const draft = await svc.create(ctx, {
    paymentMethod: 'cod',
    saveDraft: true,
    vendorOrders: [
      {
        vendorId: spice.id,
        items: [{ productId: spiceProduct.id, quantity: 1 }],
        deliveryMode: 'supplier_delivery',
        deliveryDate: '2026-09-21',
      },
    ],
  });
  const draftOrders = (draft as { orders: Array<{ id: string }> }).orders;
  if (!draftOrders?.length) throw new Error(`unexpected create shape: ${JSON.stringify(draft).slice(0, 300)}`);
  const draftId = draftOrders[0].id;
  const draftRow = await prisma.order.findUnique({
    where: { id: draftId },
    select: { id: true, status: true, deliveryMode: true, deliveryDate: true, vendorId: true },
  });
  console.log('DRAFT stamp', draftRow);
  if (draftRow?.deliveryMode !== 'supplier_delivery') throw new Error('draft missing deliveryMode');
  if (!draftRow.deliveryDate) throw new Error('draft missing deliveryDate');

  // Cleanup single draft before soft-block tests
  await prisma.orderItem.deleteMany({ where: { orderId: draftId } });
  await prisma.order.delete({ where: { id: draftId } });

  // 2) Soft-block: third_party when not available on Spice @ 400708
  let blocked = false;
  try {
    await svc.create(ctx, {
      paymentMethod: 'cod',
      vendorOrders: [
        {
          vendorId: spice.id,
          items: [{ productId: spiceProduct.id, quantity: 1 }],
          deliveryMode: 'third_party',
          deliveryDate: null,
        },
      ],
    });
  } catch (e) {
    blocked = true;
    console.log('SOFT-BLOCK third_party OK:', (e as Error).message);
  }
  if (!blocked) throw new Error('expected third_party soft-block');

  // 3) Soft-block: self_pickup when vendor does not offer it
  if (!spice.selfPickupOffered) {
    let blockedPickup = false;
    try {
      await svc.create(ctx, {
        paymentMethod: 'cod',
        vendorOrders: [
          {
            vendorId: spice.id,
            items: [{ productId: spiceProduct.id, quantity: 1 }],
            deliveryMode: 'self_pickup',
          },
        ],
      });
    } catch (e) {
      blockedPickup = true;
      console.log('SOFT-BLOCK self_pickup OK:', (e as Error).message);
    }
    if (!blockedPickup) throw new Error('expected self_pickup soft-block');
  }

  // 4) Multi-vendor draft — independent modes per PO
  if (daily && dailyProduct) {
    const dailyPin = outlet.pincode ?? '400708';
    let area = await prisma.serviceArea.findFirst({
      where: { vendorId: daily.id, pincode: dailyPin, isActive: true },
    });
    if (!area) {
      area = await prisma.serviceArea.create({
        data: {
          vendorId: daily.id,
          pincode: dailyPin,
          isActive: true,
          deliversMon: true,
          deliversTue: false,
          deliversWed: true,
          deliversThu: false,
          deliversFri: true,
          deliversSat: false,
          deliversSun: false,
          cutoffTime: '16:00',
          thirdPartyDeliveryAvailable: false,
        },
      });
      console.log('created Daily Fresh area for', dailyPin);
    }
    if (!daily.selfPickupOffered) {
      await prisma.vendor.update({
        where: { id: daily.id },
        data: { selfPickupOffered: true },
      });
    }

    const multi = await svc.create(ctx, {
      paymentMethod: 'cod',
      saveDraft: true,
      vendorOrders: [
        {
          vendorId: spice.id,
          items: [{ productId: spiceProduct.id, quantity: 1 }],
          deliveryMode: 'supplier_delivery',
          deliveryDate: '2026-09-21',
        },
        {
          vendorId: daily.id,
          items: [{ productId: dailyProduct.id, quantity: 1 }],
          deliveryMode: 'self_pickup',
          deliveryDate: null,
        },
      ],
    });
    const orders = (multi as { orders: Array<{ id: string }> }).orders;
    if (!orders?.length) throw new Error('multi create returned no orders');
    const rows = await prisma.order.findMany({
      where: { id: { in: orders.map((o) => o.id) } },
      select: {
        id: true,
        vendorId: true,
        deliveryMode: true,
        deliveryDate: true,
        status: true,
      },
    });
    console.log('MULTI-VENDOR stamps', rows);
    const spiceRow = rows.find((r) => r.vendorId === spice.id);
    const dailyRow = rows.find((r) => r.vendorId === daily.id);
    if (spiceRow?.deliveryMode !== 'supplier_delivery' || !spiceRow.deliveryDate) {
      throw new Error('multi spice stamp failed');
    }
    if (dailyRow?.deliveryMode !== 'self_pickup') {
      throw new Error('multi daily stamp failed');
    }
    await prisma.orderItem.deleteMany({ where: { orderId: { in: rows.map((r) => r.id) } } });
    await prisma.order.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  }

  console.log('\nALL CHECKOUT STAMP CHECKS PASSED\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
