/**
 * POST /api/v1/account/[id]/become-vendor
 *
 * In-place upgrade mixed a restaurant (buyer) with a supplier on the same
 * BusinessAccount. Create a separate supplier business instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { errorResponse, Errors } from '@/middleware/errorHandler';

export const POST = withAuth(async (_req: NextRequest, _ctx) => {
  try {
    throw Errors.conflict(
      'Create a new supplier business under this login instead of turning a restaurant into a supplier. Open My Businesses → Add supplier.',
    );
  } catch (err) {
    return errorResponse(err);
  }
});
