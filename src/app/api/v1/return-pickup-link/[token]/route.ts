// GET /api/v1/return-pickup-link/:token — public return pickup boy view (no auth)

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/middleware/errorHandler';
import { withRateLimit } from '@/middleware/withRateLimit';
import { returnPickupLinkService } from '@/modules/return/return-pickup-link.service';
import { returnPickupLinkTokenParamSchema } from '@/modules/return/return.validator';

function extractToken(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../return-pickup-link/:token
  return segments[segments.length - 1]!;
}

async function getHandler(req: NextRequest) {
  try {
    const token = returnPickupLinkTokenParamSchema.parse(extractToken(req));
    const data = await returnPickupLinkService.getPublicView(token);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRateLimit(getHandler, 'mutation');
