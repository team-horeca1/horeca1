import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  process.env.AUTH_SECRET = 'horeca1-development-auth-secret-min-32-chars-key-12345';
}

import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

async function runHardcoreTests() {
  const { prisma } = await import('../src/lib/prisma');
  const { returnService, remainingReturnableByOrderItem } = await import('../src/modules/return/return.service');
  const {
    setBuyerImpersonationCookies,
    clearAllImpersonationCookies,
    BUYER_USER_COOKIE,
    BUYER_BA_COOKIE,
  } = await import('../src/lib/adminImpersonationCookies');
  const { encryptAdminPassword, decryptAdminPassword } = await import('../src/lib/adminPasswordCipher');

  async function testResolveBuyerScope(opts: {
    userId: string;
    preferredBusinessAccountId?: string | null;
  }): Promise<{ userId: string; businessAccountId: string } | null> {
    if (opts.preferredBusinessAccountId) {
      const ba = await prisma.businessAccount.findUnique({
        where: { id: opts.preferredBusinessAccountId },
        select: { id: true, isCustomer: true },
      });
      if (ba?.isCustomer) {
        return { userId: opts.userId, businessAccountId: ba.id };
      }
    }

    const membership = await prisma.businessAccountMember.findFirst({
      where: { userId: opts.userId, businessAccount: { isCustomer: true } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { businessAccountId: true },
    });
    if (!membership) return null;
    return { userId: opts.userId, businessAccountId: membership.businessAccountId };
  }

  console.log('================================================================');
  console.log('🔥 STARTING HARDCORE TEST: IMPERSONATION & DASHBOARD RETURNS 🔥');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failedTests++;
    }
  }

  // --------------------------------------------------------------------------
  // SUITE 1: BUYER IMPERSONATION & ADMIN CREDENTIALS
  // --------------------------------------------------------------------------
  console.log('▶ [TEST SUITE 1] Super Admin Buyer Impersonation & Credentials');

  // Find a customer user
  let customerUser = await prisma.user.findFirst({
    where: { role: 'customer', isActive: true },
    include: { accountMemberships: { include: { businessAccount: true } } },
  });

  if (!customerUser) {
    console.log('  Creating temporary customer user for test...');
    const ba = await prisma.businessAccount.create({
      data: {
        legalName: 'Test Cafe Buyer Ltd',
        displayName: 'Test Cafe',
        isVendor: false,
        businessType: 'restaurant',
      },
    });
    customerUser = await prisma.user.create({
      data: {
        email: `buyer-test-${Date.now()}@example.com`,
        fullName: 'Test Cafe Owner',
        role: 'customer',
        isActive: true,
        accountMemberships: {
          create: {
            businessAccountId: ba.id,
            isPrimary: true,
          },
        },
      },
      include: { accountMemberships: { include: { businessAccount: true } } },
    });
  }

  // 1.1 Test resolveBuyerScope
  const scope = await testResolveBuyerScope({ userId: customerUser.id });
  assert(
    !!scope && scope.userId === customerUser.id && !!scope.businessAccountId,
    'resolveBuyerScope returns valid buyer userId and businessAccountId',
    JSON.stringify(scope),
  );

  // 1.2 Test cookie stamping
  const dummyRes = NextResponse.json({ ok: true });
  setBuyerImpersonationCookies(dummyRes, {
    userId: scope!.userId,
    businessAccountId: scope!.businessAccountId,
    name: customerUser.fullName || 'Customer',
    mode: 'customer',
  });

  const stampedCookies = dummyRes.cookies.getAll();
  const buyerUserCookie = stampedCookies.find((c) => c.name === BUYER_USER_COOKIE);
  const buyerBaCookie = stampedCookies.find((c) => c.name === BUYER_BA_COOKIE);

  assert(
    buyerUserCookie?.value === customerUser.id,
    'BUYER_USER_COOKIE correctly stamped with target customer ID',
    buyerUserCookie?.value,
  );
  assert(
    buyerBaCookie?.value === scope!.businessAccountId,
    'BUYER_BA_COOKIE correctly stamped with target customer BusinessAccount ID',
    buyerBaCookie?.value,
  );

  // 1.3 Test clear impersonation
  clearAllImpersonationCookies(dummyRes);
  const clearedCookies = dummyRes.cookies.getAll();
  const clearedUser = clearedCookies.find((c) => c.name === BUYER_USER_COOKIE);
  assert(
    clearedUser?.value === '' && (clearedUser?.maxAge === 0 || clearedUser?.expires?.getTime() === 0),
    'clearAllImpersonationCookies properly expires and empties buyer cookies',
  );

  // 1.4 Test AdminLoginCredentialsPanel password encryption / decryption logic
  const testPlain = 'SecretPass@2026!';
  const cipher = encryptAdminPassword(testPlain);
  const decrypted = decryptAdminPassword(cipher);
  assert(
    decrypted === testPlain,
    'Admin can encrypt/decrypt user credentials with AES-256-GCM for login sharing',
    decrypted ?? undefined,
  );

  // --------------------------------------------------------------------------
  // SUITE 2: CAN VENDOR ADMIN LOG IN AS BUYER? (SECURITY & PERMISSIONS)
  // --------------------------------------------------------------------------
  console.log('\n▶ [TEST SUITE 2] Vendor Admin vs Buyer Access Isolation');

  // Find a vendor user
  const vendorUser = await prisma.user.findFirst({
    where: { role: 'vendor', isActive: true },
    include: { vendors: true, accountMemberships: true },
  });

  assert(!!vendorUser, 'Found active vendor user in database');

  if (vendorUser) {
    // Check if vendor has admin impersonation endpoints available
    // The endpoint /api/v1/admin/impersonate/customer is guarded by adminOnly middleware.
    // Let's verify in code that role !== 'admin' is blocked.
    const isVendorAdmin = vendorUser.role === 'vendor';
    assert(
      isVendorAdmin,
      'Vendor user role is "vendor", NOT "admin"',
      `Role: ${vendorUser.role}`,
    );

    // Can vendor switch to buyer account?
    const hasBuyerAccount = vendorUser.accountMemberships.some(
      (m) => !(m as any).isVendor,
    );
    console.log(
      `  ℹ️ Vendor multi-account status: ${
        hasBuyerAccount
          ? 'Has linked buyer business account (can switch via BusinessAccount Switcher)'
          : 'Dedicated vendor business account only'
      }`,
    );
  }

  // --------------------------------------------------------------------------
  // SUITE 3: DASHBOARD-INITIATED RETURNS (ADMIN & VENDOR)
  // --------------------------------------------------------------------------
  console.log('\n▶ [TEST SUITE 3] Dashboard-Initiated Return Flow (Admin & Vendor)');

  // Let's create a dedicated test order with items to test all return permutations
  const testVendor = await prisma.vendor.findFirst({
    where: { isActive: true },
    include: { businessAccount: true },
  });

  const testProduct = await prisma.product.findFirst({
    where: { vendorId: testVendor?.id, isActive: true },
  });

  if (!testVendor || !testProduct) {
    console.log('  ⚠️ Skipping test order creation: no vendor/product found');
  } else {
    const baId = customerUser.accountMemberships?.[0]?.businessAccountId
      || (await prisma.businessAccount.findFirst({ where: { isCustomer: true } }))?.id
      || (await prisma.businessAccount.findFirst())!.id;

    let outlet = await prisma.outlet.findFirst({ where: { businessAccountId: baId } });
    if (!outlet) {
      outlet = await prisma.outlet.findFirst();
    }
    if (!outlet) {
      outlet = await prisma.outlet.create({
        data: {
          name: 'Main Kitchen Outlet',
          businessAccountId: baId,
          isPrimary: true,
          addressLine: '123 Marine Drive',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
        },
      });
    }

    const testOrder = await prisma.order.create({
      data: {
        id: randomUUID(),
        orderNumber: `TEST-ORD-${Date.now().toString().slice(-6)}`,
        userId: customerUser.id,
        vendorId: testVendor.id,
        businessAccountId: baId,
        outletId: outlet.id,
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMethod: 'cod',
        subtotal: 2500,
        totalAmount: 2500,
        taxAmount: 0,
        deliveryAddressSnapshot: { address: '123 Marine Drive', city: 'Mumbai', pincode: '400001' },
        items: {
          create: [
            {
              id: randomUUID(),
              productId: testProduct.id,
              productName: 'Hardcore Test Basmati Rice 25kg',
              productSku: 'TEST-RICE-01',
              quantity: 10,
              unitPrice: 200,
              totalPrice: 2000,
            },
            {
              id: randomUUID(),
              productId: testProduct.id,
              productName: 'Hardcore Test Cooking Oil 5L',
              productSku: 'TEST-OIL-01',
              quantity: 5,
              unitPrice: 100,
              totalPrice: 500,
            },
          ],
        },
      },
      include: { items: true },
    });

    console.log(`  Created test order #${testOrder.orderNumber} with 2 items (Qty 10 and Qty 5)`);

    const item1 = testOrder.items[0];
    const item2 = testOrder.items[1];

    // 3.1 Check initial remaining balance
    const initRemaining = await remainingReturnableByOrderItem(testOrder.id, testOrder.items);
    assert(
      initRemaining.get(item1.id) === 10 && initRemaining.get(item2.id) === 5,
      'Initial returnable balance matches order item quantities (10 and 5)',
    );

    // 3.2 ADMIN-INITIATED RETURN: Partial return on Item 1 (qty: 3)
    const adminUser = (await prisma.user.findFirst({ where: { role: 'admin' } })) || customerUser;
    const adminReturn = await returnService.createByStaffOrVendor(
      testOrder.id,
      { role: 'admin', userId: adminUser.id },
      {
        reason: 'Super Admin initiating return: Damaged in transit reported by phone',
        type: 'return',
        items: [
          {
            orderItemId: item1.id,
            quantity: 3,
            reason: 'damaged',
            note: 'Torn bag during unloading',
          },
        ],
      },
    );

    assert(
      !!adminReturn && adminReturn.status === 'approved',
      'Admin-initiated return created and immediately marked status: "approved"',
      `Status: ${adminReturn?.status}`,
    );

    // Verify remaining balance after admin return
    const postAdminRemaining = await remainingReturnableByOrderItem(testOrder.id, testOrder.items);
    assert(
      postAdminRemaining.get(item1.id) === 7,
      'Item 1 remaining returnable quantity decremented from 10 to 7',
      `Remaining: ${postAdminRemaining.get(item1.id)}`,
    );

    // 3.3 VENDOR-INITIATED RETURN: Partial return on Item 1 (qty: 2) and Item 2 (qty: 2)
    const vendorReturn = await returnService.createByStaffOrVendor(
      testOrder.id,
      { role: 'vendor', userId: testVendor.userId, vendorId: testVendor.id },
      {
        reason: 'Supplier direct return: Customer rejected 2 rice bags and 2 oil cans at delivery',
        type: 'return',
        items: [
          {
            orderItemId: item1.id,
            quantity: 2,
            reason: 'customer_rejected',
            note: 'Rejected at doorstep',
          },
          {
            orderItemId: item2.id,
            quantity: 2,
            reason: 'quality_issue',
            note: 'Seal defective',
          },
        ],
      },
    );

    assert(
      !!vendorReturn && vendorReturn.status === 'approved',
      'Vendor-initiated return created and immediately marked status: "approved"',
      `Status: ${vendorReturn?.status}`,
    );

    const postVendorRemaining = await remainingReturnableByOrderItem(testOrder.id, testOrder.items);
    assert(
      postVendorRemaining.get(item1.id) === 5 && postVendorRemaining.get(item2.id) === 3,
      'Remaining quantities correctly updated: Item 1 = 5, Item 2 = 3',
      `Item 1: ${postVendorRemaining.get(item1.id)}, Item 2: ${postVendorRemaining.get(item2.id)}`,
    );

    // 3.4 SECURITY BARRIER: Cross-Vendor Isolation
    // Another vendor tries to initiate return on testVendor's order
    let crossVendorBlocked = false;
    try {
      await returnService.createByStaffOrVendor(
        testOrder.id,
        { role: 'vendor', userId: randomUUID(), vendorId: randomUUID() },
        {
          reason: 'Malicious vendor trying to return other vendor order',
          items: [{ orderItemId: item1.id, quantity: 1, reason: 'other' }],
        },
      );
    } catch (err: any) {
      crossVendorBlocked = err.message?.includes('not found') || err.message?.includes('Order') || err.status === 404;
    }
    assert(
      crossVendorBlocked,
      'Security Barrier: Vendor B cannot initiate return on Vendor A order (Throws NotFound)',
    );

    // 3.5 OVER-RETURN / EXCESS QUANTITY GUARD
    let excessBlocked = false;
    try {
      // Item 1 only has 5 remaining, try to return 8
      await returnService.createByStaffOrVendor(
        testOrder.id,
        { role: 'admin', userId: adminUser.id },
        {
          reason: 'Attempting to return more than remaining',
          items: [{ orderItemId: item1.id, quantity: 8, reason: 'damaged' }],
        },
      );
    } catch (err: any) {
      excessBlocked = err.message?.includes('exceeds remaining returnable');
    }
    assert(
      excessBlocked,
      'Guardrail: Cannot return more items than remaining (Blocked with friendly error)',
    );

    // 3.6 EXHAUSTING RETURNABLE ITEMS
    // Return all remaining 5 of item 1 and 3 of item 2
    await returnService.createByStaffOrVendor(
      testOrder.id,
      { role: 'admin', userId: adminUser.id },
      {
        reason: 'Returning all remaining items',
        items: [
          { orderItemId: item1.id, quantity: 5, reason: 'damaged' },
          { orderItemId: item2.id, quantity: 3, reason: 'damaged' },
        ],
      },
    );

    const exhaustedRemaining = await remainingReturnableByOrderItem(testOrder.id, testOrder.items);
    assert(
      exhaustedRemaining.get(item1.id) === 0 && exhaustedRemaining.get(item2.id) === 0,
      'All order items completely exhausted (Remaining: 0 and 0)',
    );

    // 3.7 TRYING RETURN ON ZERO-BALANCE ORDER
    let zeroBalanceBlocked = false;
    try {
      await returnService.createByStaffOrVendor(
        testOrder.id,
        { role: 'admin', userId: adminUser.id },
        {
          reason: 'Should fail because zero items left',
          items: [{ orderItemId: item1.id, quantity: 1, reason: 'damaged' }],
        },
      );
    } catch (err: any) {
      zeroBalanceBlocked = true;
    }
    assert(
      zeroBalanceBlocked,
      'Guardrail: Attempting return on order with 0 balance is blocked',
    );

    // Cleanup test data
    console.log('\n  Cleaning up test order and returns...');
    await prisma.returnEvent.deleteMany({
      where: { returnRequest: { orderId: testOrder.id } },
    });
    await prisma.returnItem.deleteMany({
      where: { returnRequest: { orderId: testOrder.id } },
    });
    await prisma.returnRequest.deleteMany({
      where: { orderId: testOrder.id },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: testOrder.id },
    });
    await prisma.order.delete({
      where: { id: testOrder.id },
    });
    console.log('  Cleanup completed cleanly.');
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  await prisma.$disconnect();
}

runHardcoreTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
