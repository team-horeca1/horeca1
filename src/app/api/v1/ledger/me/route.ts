import { NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';
import { customerWalletStatement, customerCreditStatement } from '@/modules/ledger/read';

export const GET = withAuth(async (_req, ctx) => {
  try {
    const userId = effectiveCustomerUserId(ctx);
    const [wallet, credit] = await Promise.all([
      customerWalletStatement(userId),
      customerCreditStatement(userId),
    ]);
    return NextResponse.json({ success: true, data: { wallet, credit } });
  } catch (error) {
    return errorResponse(error);
  }
});
