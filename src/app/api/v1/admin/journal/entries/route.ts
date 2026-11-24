import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { listJournalEntries } from '@/modules/ledger/adminRead';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'ledger.view');
    const url = new URL(req.url);
    const search = url.searchParams.get('search')?.trim() || undefined;
    const eventType = url.searchParams.get('eventType')?.trim() || undefined;
    const entries = await listJournalEntries({ search, eventType, limit: 100 });
    return NextResponse.json({ success: true, data: { entries } });
  } catch (error) {
    return errorResponse(error);
  }
});
