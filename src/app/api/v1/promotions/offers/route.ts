// GET /api/v1/promotions/offers?vendorId= — Live coupons + store offers
// WHY: Powers /deals and the vendor-store Deals sheet. Platform coupons always
//      included; vendor-scoped rows only for the requested vendor (or every
//      catalog-visible vendor when vendorId is omitted).
// PROTECTED: Must be logged in

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { checkRateLimit } from '@/lib/rateLimit';
import { getDeliveryGeo } from '@/lib/deliveryLocation';
import { resolveStorefrontContext } from '@/lib/resolveStorefrontContext';
import { promotionService } from '@/modules/promotion/promotion.service';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const querySchema = z.object({
  vendorId: z.string().uuid().optional(),
});

async function resolvePincode(userId: string, ctx: Parameters<typeof resolveStorefrontContext>[0]) {
  const geo = await getDeliveryGeo(userId);
  if (geo?.pincode && /^\d{6}$/.test(geo.pincode)) return geo.pincode;
  try {
    const storefront = await resolveStorefrontContext(ctx);
    const outlet = await prisma.outlet.findFirst({
      where: { id: storefront.outletId, businessAccountId: storefront.businessAccountId },
      select: { pincode: true },
    });
    return outlet?.pincode && /^\d{6}$/.test(outlet.pincode) ? outlet.pincode : null;
  } catch {
    return null;
  }
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { allowed } = await checkRateLimit(`promo-offers:${ctx.userId}`, 60, 60_000); // eslint-disable-line no-restricted-syntax -- rate-limit the real admin
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute.' } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const parsed = querySchema.parse({
      vendorId: req.nextUrl.searchParams.get('vendorId') || undefined,
    });
    const pincode = await resolvePincode(effectiveCustomerUserId(ctx), ctx);
    const data = await promotionService.listPublicOffers({
      userId: effectiveCustomerUserId(ctx),
      vendorId: parsed.vendorId ?? null,
      pincode,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});
