// GET /api/v1/delivery-boy-link/:token — boy portal order list (public)

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';
import { deliveryLinkService } from '@/modules/fulfillment/delivery-link.service';
import { deliveryLinkTokenParamSchema } from '@/modules/fulfillment/delivery-link.validator';

function extractToken(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 1]!;
}

async function getHandler(req: NextRequest) {
  try {
    const token = deliveryLinkTokenParamSchema.parse(extractToken(req));
    const data = await deliveryLinkService.getBoyPortalList(token);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRateLimit(getHandler, 'mutation');
