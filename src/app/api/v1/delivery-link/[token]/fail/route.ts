// POST /api/v1/delivery-link/:token/fail — fixed fail reasons → attempt failed

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';
import { deliveryLinkService } from '@/modules/fulfillment/delivery-link.service';
import {
  deliveryLinkFailSchema,
  deliveryLinkTokenParamSchema,
} from '@/modules/fulfillment/delivery-link.validator';

function extractToken(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../delivery-link/:token/fail
  return segments[segments.length - 2]!;
}

async function postHandler(req: NextRequest) {
  try {
    const token = deliveryLinkTokenParamSchema.parse(extractToken(req));
    const body = deliveryLinkFailSchema.parse(await req.json());
    const data = await deliveryLinkService.fail(
      token,
      body.failedReason,
      body.failedReasonOther,
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRateLimit(postHandler, 'mutation');
