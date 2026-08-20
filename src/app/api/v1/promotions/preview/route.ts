// POST /api/v1/promotions/preview — Preview auto vendor promotions (+ an
//      optional coupon) against the items the checkout is about to order.
// WHY: The checkout summary shows the Store Offer + coupon estimates before
//      placing the order. Driven by the client cart items (re-priced
//      server-side) so the preview matches what order.service.create computes.
//      The order transaction re-validates everything — this never reserves a
//      use. Rate-limited to stop coupon brute-forcing.
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { checkRateLimit } from '@/lib/rateLimit';
import { resolveStorefrontContext } from '@/lib/resolveStorefrontContext';
import { promotionService } from '@/modules/promotion/promotion.service';

const previewSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        vendorId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100000),
      }),
    )
    .max(500),
  code: z.string().min(3).max(40).optional(),
  useWallet: z.boolean().optional(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { allowed } = await checkRateLimit(`promo-preview:${ctx.userId}`, 30, 60000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute.' } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const storefrontCtx = await resolveStorefrontContext(ctx);

    const body = previewSchema.parse(await req.json());
    const result = await promotionService.previewPromotions({
      userId: ctx.userId,
      businessAccountId: storefrontCtx.businessAccountId,
      outletId: storefrontCtx.outletId,
      items: body.items,
      code: body.code ?? null,
      useWallet: body.useWallet ?? false,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
