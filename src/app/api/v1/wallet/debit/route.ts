// POST /api/v1/wallet/debit — manual credit debit (admin/ops adjustment). Admin only.
// NOTE: the real checkout debit happens server-side inside the order transaction
// (see order flow), NOT via this public-ish endpoint.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';

const schema = z.object({
  userId: z.string().uuid(),
  vendorId: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  orderId: z.string().min(1),
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const { userId, vendorId, amount, orderId } = schema.parse(await req.json());
    const wallet = await creditWalletService.debitWallet(userId, vendorId ?? null, amount, orderId);
    return NextResponse.json({ success: true, data: wallet });
  } catch (error) {
    return errorResponse(error);
  }
});
