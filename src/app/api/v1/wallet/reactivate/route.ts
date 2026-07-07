// POST /api/v1/wallet/reactivate — admin reactivates a blacklisted wallet (allowed
// even with dues; audited). Admin only.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';

const schema = z.object({
  walletId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const { walletId, reason } = schema.parse(await req.json());
    const wallet = await creditWalletService.reactivateWallet(walletId, ctx.userId, reason);
    return NextResponse.json({ success: true, data: wallet });
  } catch (error) {
    return errorResponse(error);
  }
});
