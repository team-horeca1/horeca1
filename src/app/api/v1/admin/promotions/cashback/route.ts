// GET  /api/v1/admin/promotions/cashback — List all cashback campaigns
// POST /api/v1/admin/promotions/cashback — Create a PLATFORM campaign
// WHY: Promo Engine Phase 1 — cashback drives repeat purchase; admin owns
//      platform campaigns and oversees vendor ones.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { createCashbackCampaignSchema } from '@/modules/promotion/promotion.validator';
import { campaignCreateData } from '@/modules/promotion/promotion.mappers';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.view');
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope');

    const campaigns = await prisma.cashbackCampaign.findMany({
      where: {
        ...(scope === 'platform' ? { vendorId: null } : {}),
        ...(scope === 'vendor' ? { vendorId: { not: null } } : {}),
      },
      include: {
        vendor: { select: { id: true, businessName: true, displayName: true } },
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: campaigns });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'promotions.create');
    const body = createCashbackCampaignSchema.parse(await req.json());

    const campaign = await prisma.cashbackCampaign.create({
      data: campaignCreateData(body, null, ctx.userId),
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.cashbackCampaignCreate,
      entity: 'cashback_campaign',
      entityId: campaign.id,
      after: { name: campaign.name, cashbackType: campaign.cashbackType, cashbackValue: Number(campaign.cashbackValue) },
    });
    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
