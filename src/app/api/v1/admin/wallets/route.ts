import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { adminWalletDetail, adminWalletSummary, listAdminWallets } from '@/modules/ledger/adminRead';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'ledger.view');
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    if (userId) {
      try {
        const data = await adminWalletDetail(userId);
        return NextResponse.json({ success: true, data });
      } catch {
        throw Errors.notFound('Customer wallet');
      }
    }
    const search = url.searchParams.get('search')?.trim() || undefined;
    const [wallets, summary] = await Promise.all([listAdminWallets(search), adminWalletSummary()]);
    return NextResponse.json({ success: true, data: { wallets, summary } });
  } catch (error) {
    return errorResponse(error);
  }
});
