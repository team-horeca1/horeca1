// POST /api/v1/return-pickup-link/:token/fail — fixed fail reasons (stay pickup_scheduled)

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';
import { returnPickupLinkService } from '@/modules/return/return-pickup-link.service';
import {
  returnPickupLinkFailSchema,
  returnPickupLinkTokenParamSchema,
} from '@/modules/return/return.validator';

function extractToken(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../return-pickup-link/:token/fail
  return segments[segments.length - 2]!;
}

async function postHandler(req: NextRequest) {
  try {
    const token = returnPickupLinkTokenParamSchema.parse(extractToken(req));
    const body = returnPickupLinkFailSchema.parse(await req.json());
    const data = await returnPickupLinkService.fail(
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
