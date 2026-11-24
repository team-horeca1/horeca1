import { NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { ledgerBooks } from '@/modules/ledger/adminRead';

export const GET = adminOnly(async (_req, ctx) => {
  try {
    requirePermission(ctx, 'ledger.view');
    const books = await ledgerBooks();
    return NextResponse.json({ success: true, data: books });
  } catch (error) {
    return errorResponse(error);
  }
});
