// POST /api/v1/delivery-boy-link/:token/:fulfilmentId/complete

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';
import { deliveryLinkService } from '@/modules/fulfillment/delivery-link.service';
import {
  deliveryLinkCompleteSchema,
  deliveryLinkTokenParamSchema,
} from '@/modules/fulfillment/delivery-link.validator';

const fulfilmentIdSchema = z.string().uuid();

function extractParams(req: NextRequest): { token: string; fulfilmentId: string } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
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
    const body = deliveryLinkCompleteSchema.parse(await req.json());
    const data = await deliveryLinkService.completeViaBoy(token, fulfilmentId, body.otp);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRateLimit(postHandler, 'auth');
