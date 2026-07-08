import { eventBus } from './emitter';
import { prisma } from '@/lib/prisma';
import { SMS_TEMPLATES } from '@/lib/providers/smsTemplates';
import type { NotificationService } from '@/modules/notification/notification.service';

let notificationsPromise: Promise<NotificationService> | null = null;
function getNotifications(): Promise<NotificationService> {
  if (!notificationsPromise) {
    notificationsPromise = import('@/modules/notification/notification.service').then(
      ({ NotificationService }) => new NotificationService(),
    );
  }
  return notificationsPromise;
}

// Idempotency lives on globalThis (not a module-scoped boolean): the bus is a
// process-wide singleton, so its listeners must be registered exactly once even
// if Next.js evaluates this module in more than one bundle. A module-local flag
// would not be shared across those instances and could double-subscribe.
const globalForListeners = globalThis as unknown as { eventListenersRegistered?: boolean };

/**
 * Register all event listeners for the HoReCa1 event bus.
 * Call once on application startup (e.g. from instrumentation.ts).
 * Guarded against duplicate registration (e.g. during hot reload).
 */
export function registerEventListeners(): void {
  if (globalForListeners.eventListenersRegistered) {
    console.log('[Events] Listeners already registered, skipping');
    return;
  }
  globalForListeners.eventListenersRegistered = true;
  // ── Order lifecycle ─────────────────────────────────────────────

  eventBus.on('OrderCreated', async (payload) => {
    try {
      const [notifications, { orderService }] = await Promise.all([
        getNotifications(),
        import('@/modules/order/order.service'),
      ]);
      // Vendor's owning user gets the in-app + email alert
      const vendor = await prisma.vendor.findUnique({
        where: { id: payload.vendorId },
        select: { userId: true },
      });
      const vendorUserId = vendor?.userId ?? payload.vendorId;

      const { otp } = await orderService.issueDeliveryOtp(payload.orderId, payload.vendorId, {
        emitEvent: false,
      });

      await Promise.all([
        notifications.send({
          userId: vendorUserId,
          type: 'order',
          channel: 'in_app',
          title: 'New Order Received',
          body: `Order #${payload.orderNumber} has been placed (₹${payload.totalAmount.toLocaleString('en-IN')}).`,
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
        notifications.send({
          userId: vendorUserId,
          type: 'order',
          channel: 'email',
          title: `New order ${payload.orderNumber}`,
          body: `A new order worth ₹${payload.totalAmount.toLocaleString('en-IN')} has been placed. Log into HoReCa Hub to confirm and fulfill it.`,
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
        notifications.send({
          userId: vendorUserId,
          type: 'order',
          channel: 'sms',
          title: 'New Order Received',
          body: `New order ${payload.orderNumber} from Horeca1.`,
          smsTemplateId: SMS_TEMPLATES.orderConfirmVendor,
          smsVariables: { number: payload.orderNumber },
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
        notifications.send({
          userId: payload.userId,
          type: 'order',
          channel: 'in_app',
          title: 'Order Placed',
          body: `Order ${payload.orderNumber} placed (₹${payload.totalAmount.toLocaleString('en-IN')}). We'll notify you once the vendor confirms.`,
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
        notifications.send({
          userId: payload.userId,
          type: 'order',
          channel: 'email',
          title: `Order ${payload.orderNumber} placed`,
          body: `Thank you for your order. Total: ₹${payload.totalAmount.toLocaleString('en-IN')}. We'll notify you once the vendor confirms.`,
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
        notifications.send({
          userId: payload.userId,
          type: 'order',
          channel: 'sms',
          title: 'Order Confirmation',
          body: `Order ${payload.orderNumber} confirmed. OTP: ${otp}`,
          smsTemplateId: SMS_TEMPLATES.orderConfirmCustomer,
          smsVariables: { var1: payload.orderNumber, var2: otp },
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
      ]);
    } catch (error) {
      console.error('[Events] OrderCreated listener failed:', error);
    }
  });

  eventBus.on('OrderConfirmed', async (payload) => {
    try {
      const notifications = await getNotifications();
      await Promise.all([
        notifications.send({
          userId: payload.userId,
          type: 'order',
          channel: 'in_app',
          title: 'Order Confirmed',
          body: `Your order ${payload.orderId} has been confirmed by the vendor.`,
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
        notifications.send({
          userId: payload.userId,
          type: 'order',
          channel: 'email',
          title: 'Order confirmed',
          body: `Your order ${payload.orderId} has been confirmed. You'll receive another update once it's out for delivery.`,
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
      ]);
    } catch (error) {
      console.error('[Events] OrderConfirmed listener failed:', error);
    }
  });

  eventBus.on('OrderShipped', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId,
        type: 'order',
        channel: 'in_app',
        title: 'Order Out for Delivery',
        body: `Your order ${payload.orderId} is out for delivery.`,
        referenceId: payload.orderId,
        referenceType: 'order',
      });
    } catch (error) {
      console.error('[Events] OrderShipped listener failed:', error);
    }
  });

  eventBus.on('OrderDelivered', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId,
        type: 'order',
        channel: 'in_app',
        title: 'Order Delivered',
        body: `Your order ${payload.orderId} has been delivered. Thank you for your purchase!`,
        referenceId: payload.orderId,
        referenceType: 'order',
      });
      // Credit unlock: a delivered order may push the customer over the
      // "X successful orders" threshold → auto-provision their H1 wallet.
      const { creditWalletService } = await import('@/modules/credit/creditWallet.service');
      await creditWalletService.maybeAutoUnlockH1Wallet(payload.userId).catch(() => {});
    } catch (error) {
      console.error('[Events] OrderDelivered listener failed:', error);
    }
  });

  // B-4: previously these transitions emitted events with no listener, so the
  // customer was never told. Each now sends an in-app update.
  eventBus.on('OrderProcessing', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId, type: 'order', channel: 'in_app',
        title: 'Order Being Packed',
        body: `Your order ${payload.orderId} is being packed.`,
        referenceId: payload.orderId, referenceType: 'order',
      });
    } catch (error) { console.error('[Events] OrderProcessing listener failed:', error); }
  });

  eventBus.on('OrderReadyForDispatch', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId, type: 'order', channel: 'in_app',
        title: 'Order Ready for Dispatch',
        body: `Your order ${payload.orderId} is packed and awaiting pickup.`,
        referenceId: payload.orderId, referenceType: 'order',
      });
    } catch (error) { console.error('[Events] OrderReadyForDispatch listener failed:', error); }
  });

  eventBus.on('OrderPartiallyDelivered', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId, type: 'order', channel: 'in_app',
        title: 'Order Partially Delivered',
        body: `Part of your order ${payload.orderId} has been delivered; the balance is on its way.`,
        referenceId: payload.orderId, referenceType: 'order',
      });
    } catch (error) { console.error('[Events] OrderPartiallyDelivered listener failed:', error); }
  });

  eventBus.on('OrderReturned', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId, type: 'order', channel: 'in_app',
        title: 'Order Returned',
        body: `Your order ${payload.orderId} has been marked as returned.`,
        referenceId: payload.orderId, referenceType: 'order',
      });
    } catch (error) { console.error('[Events] OrderReturned listener failed:', error); }
  });

  eventBus.on('OrderCancelled', async (payload) => {
    try {
      const notifications = await getNotifications();
      const reasonSuffix = payload.reason ? ` Reason: ${payload.reason}` : '';

      // Notify customer
      await notifications.send({
        userId: payload.userId,
        type: 'order',
        channel: 'in_app',
        title: 'Order Cancelled',
        body: `Your order ${payload.orderId} has been cancelled.${reasonSuffix}`,
        referenceId: payload.orderId,
        referenceType: 'order',
      });

      // Notify vendor
      await notifications.send({
        userId: payload.vendorId,
        type: 'order',
        channel: 'in_app',
        title: 'Order Cancelled',
        body: `Order ${payload.orderId} has been cancelled.${reasonSuffix}`,
        referenceId: payload.orderId,
        referenceType: 'order',
      });
    } catch (error) {
      console.error('[Events] OrderCancelled listener failed:', error);
    }
  });

  eventBus.on('OrderDeliveryOtp', async (payload) => {
    try {
      const notifications = await getNotifications();
      const body = `Your delivery code for order ${payload.orderNumber} is ${payload.otp}. Share it with the delivery agent only when you receive your order.`;
      await Promise.all([
        notifications.send({
          userId: payload.userId,
          type: 'order',
          channel: 'sms',
          title: 'Delivery code',
          body,
          smsTemplateId: SMS_TEMPLATES.orderConfirmCustomer,
          smsVariables: { var1: payload.orderNumber, var2: payload.otp },
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
        notifications.send({
          userId: payload.userId,
          type: 'order',
          channel: 'email',
          title: `Delivery code for order ${payload.orderNumber}`,
          body,
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
        notifications.send({
          userId: payload.userId,
          type: 'order',
          channel: 'in_app',
          title: 'Delivery code',
          body: `Your delivery code is ${payload.otp}. Share it with the agent at handover.`,
          referenceId: payload.orderId,
          referenceType: 'order',
        }),
      ]);
    } catch (error) {
      console.error('[Events] OrderDeliveryOtp listener failed:', error);
    }
  });

  // ── Payments ────────────────────────────────────────────────────

  eventBus.on('PaymentReceived', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.vendorId,
        type: 'payment',
        channel: 'in_app',
        title: 'Payment Received',
        body: `Payment of ₹${payload.amount.toLocaleString('en-IN')} received for order ${payload.orderId}.`,
        referenceId: payload.paymentId,
        referenceType: 'payment',
      });
    } catch (error) {
      console.error('[Events] PaymentReceived listener failed:', error);
    }
  });

  eventBus.on('PaymentFailed', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId,
        type: 'payment',
        channel: 'in_app',
        title: 'Payment Failed',
        body: `Payment for order ${payload.orderId} failed. ${payload.reason}`,
        referenceId: payload.orderId,
        referenceType: 'payment',
      });
    } catch (error) {
      console.error('[Events] PaymentFailed listener failed:', error);
    }
  });

  // ── User / Vendor onboarding ────────────────────────────────────

  eventBus.on('UserRegistered', async (payload) => {
    try {
      console.log(`[Listener] UserRegistered — ${payload.email} (role: ${payload.role})`);

      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId,
        type: 'account',
        channel: 'in_app',
        title: 'Welcome to HoReCa Hub!',
        body: 'Your account has been created. Start exploring vendors and place your first order.',
        referenceId: payload.userId,
        referenceType: 'user',
      });
    } catch (error) {
      console.error('[Events] UserRegistered listener failed:', error);
    }
  });

  eventBus.on('VendorOnboarded', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId,
        type: 'account',
        channel: 'in_app',
        title: 'Vendor Verified',
        body: `Congratulations! "${payload.businessName}" has been verified and is now live on HoReCa Hub.`,
        referenceId: payload.vendorId,
        referenceType: 'vendor',
      });
    } catch (error) {
      console.error('[Events] VendorOnboarded listener failed:', error);
    }
  });

  // ── Credit ──────────────────────────────────────────────────────

  eventBus.on('CreditApplied', async (payload) => {
    try {
      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.userId,
        type: 'credit',
        channel: 'in_app',
        title: 'Credit Applied',
        body: `₹${payload.amount.toLocaleString('en-IN')} credit has been applied to order ${payload.orderId}.`,
        referenceId: payload.creditAccountId,
        referenceType: 'credit',
      });
    } catch (error) {
      console.error('[Events] CreditApplied listener failed:', error);
    }
  });

  // ── Inventory ───────────────────────────────────────────────────

  eventBus.on('StockUpdated', async (payload) => {
    try {
      if (payload.qtyAvailable > payload.lowStockThreshold) return;

      const notifications = await getNotifications();
      await notifications.send({
        userId: payload.vendorId,
        type: 'inventory',
        channel: 'in_app',
        title: 'Low Stock Alert',
        body: `Product ${payload.productId} is running low — only ${payload.qtyAvailable} units left (threshold: ${payload.lowStockThreshold}).`,
        referenceId: payload.productId,
        referenceType: 'product',
      });
    } catch (error) {
      console.error('[Events] StockUpdated listener failed:', error);
    }
  });

  // ── Approval: Products ─────────────────────────────────────────

  eventBus.on('ProductSubmitted', async (payload) => {
    try {
      const notifications = await getNotifications();
      const admins = await prisma.user.findMany({ where: { role: 'admin' } });
      await Promise.all(
        admins.map((admin) =>
          notifications.send({
            userId: admin.id,
            type: 'approval',
            channel: 'in_app',
            title: 'New Product Pending Approval',
            body: `New product pending approval: ${payload.productName}`,
            referenceId: payload.productId,
            referenceType: 'product',
          })
        )
      );
    } catch (error) {
      console.error('[Events] ProductSubmitted listener failed:', error);
    }
  });

  eventBus.on('ProductApproved', async (payload) => {
    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: payload.vendorId },
        select: { userId: true },
      });
      if (vendor) {
        const notifications = await getNotifications();
        await notifications.send({
          userId: vendor.userId,
          type: 'approval',
          channel: 'in_app',
          title: 'Product Approved',
          body: `Your product '${payload.productName}' has been approved`,
          referenceId: payload.productId,
          referenceType: 'product',
        });
      }
    } catch (error) {
      console.error('[Events] ProductApproved listener failed:', error);
    }
  });

  // ProductRejected — sent directly from approval API routes via sendProductRejectedNotifications().

  eventBus.on('ProductEditSubmitted', async (payload) => {
    try {
      const notifications = await getNotifications();
      const admins = await prisma.user.findMany({ where: { role: 'admin' } });
      await Promise.all(
        admins.map((admin) =>
          notifications.send({
            userId: admin.id,
            type: 'approval',
            channel: 'in_app',
            title: 'Product Edit Pending Review',
            body: `Material edit pending approval: ${payload.productName}`,
            referenceId: payload.productId,
            referenceType: 'product',
          }),
        ),
      );
    } catch (error) {
      console.error('[Events] ProductEditSubmitted listener failed:', error);
    }
  });

  eventBus.on('ProductEditApproved', async (payload) => {
    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: payload.vendorId },
        select: { userId: true },
      });
      if (vendor) {
        const notifications = await getNotifications();
        await notifications.send({
          userId: vendor.userId,
          type: 'approval',
          channel: 'in_app',
          title: 'Product Edit Approved',
          body: `Your edit to '${payload.productName}' has been approved`,
          referenceId: payload.productId,
          referenceType: 'product',
        });
      }
    } catch (error) {
      console.error('[Events] ProductEditApproved listener failed:', error);
    }
  });

  eventBus.on('ProductEditRejected', async (payload) => {
    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: payload.vendorId },
        select: { userId: true },
      });
      if (vendor) {
        const notifications = await getNotifications();
        await notifications.send({
          userId: vendor.userId,
          type: 'approval',
          channel: 'in_app',
          title: 'Product Edit Rejected',
          body: payload.reason
            ? `Your edit to '${payload.productName}' was rejected: ${payload.reason}`
            : `Your edit to '${payload.productName}' was rejected — live listing unchanged`,
          referenceId: payload.productId,
          referenceType: 'product',
        });
      }
    } catch (error) {
      console.error('[Events] ProductEditRejected listener failed:', error);
    }
  });

  eventBus.on('MasterProductSyncedToVendor', async (payload) => {
    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: payload.vendorId },
        select: { userId: true },
      });
      if (vendor) {
        const notifications = await getNotifications();
        await notifications.send({
          userId: vendor.userId,
          type: 'catalog',
          channel: 'in_app',
          title: 'Catalog Item Updated',
          body: `Admin updated the master catalog entry for '${payload.productName}'. Your listing was synced.`,
          referenceId: payload.productId,
          referenceType: 'product',
        });
      }
    } catch (error) {
      console.error('[Events] MasterProductSyncedToVendor listener failed:', error);
    }
  });

  // ── Approval: Categories ──────────────────────────────────────

  eventBus.on('CategorySuggested', async (payload) => {
    try {
      const notifications = await getNotifications();
      const admins = await prisma.user.findMany({ where: { role: 'admin' } });
      await Promise.all(
        admins.map((admin) =>
          notifications.send({
            userId: admin.id,
            type: 'approval',
            channel: 'in_app',
            title: 'New Category Suggestion',
            body: `New category suggestion: ${payload.categoryName}`,
            referenceId: payload.categoryId,
            referenceType: 'category',
          })
        )
      );
    } catch (error) {
      console.error('[Events] CategorySuggested listener failed:', error);
    }
  });

  eventBus.on('CategoryApproved', async (payload) => {
    try {
      if (payload.suggestedBy) {
        const notifications = await getNotifications();
        await notifications.send({
          userId: payload.suggestedBy,
          type: 'approval',
          channel: 'in_app',
          title: 'Category Approved',
          body: `Category '${payload.categoryName}' has been approved`,
          referenceId: payload.categoryId,
          referenceType: 'category',
        });
      }
    } catch (error) {
      console.error('[Events] CategoryApproved listener failed:', error);
    }
  });

  eventBus.on('CategoryRejected', async (payload) => {
    try {
      if (payload.suggestedBy) {
        const reasonSuffix = payload.reason ? `: ${payload.reason}` : '';
        const notifications = await getNotifications();
        await notifications.send({
          userId: payload.suggestedBy,
          type: 'approval',
          channel: 'in_app',
          title: 'Category Rejected',
          body: `Category '${payload.categoryName}' was rejected${reasonSuffix}`,
          referenceId: payload.categoryId,
          referenceType: 'category',
        });
      }
    } catch (error) {
      console.error('[Events] CategoryRejected listener failed:', error);
    }
  });

  // ── Approval: Brands ──────────────────────────────────────────

  eventBus.on('BrandSuggested', async (payload) => {
    try {
      const notifications = await getNotifications();
      const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
      await Promise.all(
        admins.map((admin) =>
          notifications.send({
            userId: admin.id,
            type: 'approval',
            channel: 'in_app',
            title: 'New Brand Pending Approval',
            body: `New brand pending approval: ${payload.brandName}`,
            referenceId: payload.brandId,
            referenceType: 'brand',
          })
        )
      );
    } catch (error) {
      console.error('[Events] BrandSuggested listener failed:', error);
    }
  });

  eventBus.on('BrandApproved', async (payload) => {
    try {
      const brand = await prisma.brand.findUnique({
        where: { id: payload.brandId },
        select: { userId: true },
      });
      if (!brand?.userId) return;
      const notifications = await getNotifications();
      await Promise.all([
        notifications.send({
          userId: brand.userId,
          type: 'approval',
          channel: 'in_app',
          title: 'Brand Approved',
          body: `Congratulations! "${payload.brandName}" has been approved and your brand portal is now unlocked.`,
          referenceId: payload.brandId,
          referenceType: 'brand',
        }),
        notifications.send({
          userId: brand.userId,
          type: 'approval',
          channel: 'email',
          title: `Horeca1: Brand approved — ${payload.brandName}`,
          body: `Your brand "${payload.brandName}" has been approved. Log into the brand portal to manage your products and distributor mappings.`,
          referenceId: payload.brandId,
          referenceType: 'brand',
        }),
      ]);
    } catch (error) {
      console.error('[Events] BrandApproved listener failed:', error);
    }
  });

  eventBus.on('BrandRejected', async (payload) => {
    try {
      const brand = await prisma.brand.findUnique({
        where: { id: payload.brandId },
        select: { userId: true },
      });
      if (!brand?.userId) return;
      const reasonSuffix = payload.reason?.trim() ? ` Reason: ${payload.reason.trim()}` : '';
      const notifications = await getNotifications();
      await Promise.all([
        notifications.send({
          userId: brand.userId,
          type: 'approval',
          channel: 'in_app',
          title: 'Brand Application Rejected',
          body: `Your brand application for "${payload.brandName}" was not approved.${reasonSuffix} Please contact support if you believe this is an error.`,
          referenceId: payload.brandId,
          referenceType: 'brand',
        }),
        notifications.send({
          userId: brand.userId,
          type: 'approval',
          channel: 'email',
          title: `Horeca1: Brand application update — ${payload.brandName}`,
          body: `Your brand application for "${payload.brandName}" was not approved.${reasonSuffix}`,
          referenceId: payload.brandId,
          referenceType: 'brand',
        }),
      ]);
    } catch (error) {
      console.error('[Events] BrandRejected listener failed:', error);
    }
  });

  console.log('[Events] All event listeners registered');
}
