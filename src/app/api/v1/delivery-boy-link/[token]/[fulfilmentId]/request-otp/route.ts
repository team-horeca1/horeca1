// POST /api/v1/delivery-boy-link/:token/:fulfilmentId/request-otp

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';
import { deliveryLinkService } from '@/modules/fulfillment/delivery-link.service';
import { deliveryLinkTokenParamSchema } from '@/modules/fulfillment/delivery-link.validator';

const fulfilmentIdSchema = z.string().uuid();

function extractParams(req: NextRequest): { token: string; fulfilmentId: string } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../delivery-boy-link/:token/:fulfilmentId/request-otp
  return {
    token: segments[segments.length - 3]!,
    fulfilmentId: segments[segments.length - 2]!,
  };
}

async function postHandler(req: NextRequest) {
  try {
    const raw = extractParams(req);
    const token = deliveryLinkTokenParamSchema.parse(raw.token);
    const fulfilmentId = fulfilmentIdSchema.parse(raw.fulfilmentId);
    const data = await deliveryLinkService.requestOtpViaBoy(token, fulfilmentId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRateLimit(postHandler, 'auth');
