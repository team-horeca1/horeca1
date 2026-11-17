// POST /api/v1/admin/settlements/cron — weekly vendor settlement batching
// curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost/api/v1/admin/settlements/cron
import { NextRequest, NextResponse } from 'next/server';
import { vendorSettlementService } from '@/modules/vendor/vendorSettlement.service';
import { runWeeklyFinanceDrafts } from '@/modules/finance/supplierSettlement.service';
import { errorResponse } from '@/middleware/errorHandler';

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret');
    if (!secret || provided !== secret) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    const financeDrafts = await runWeeklyFinanceDrafts();
    const result = await vendorSettlementService.runWeeklySettlements();
    return NextResponse.json({ success: true, data: { ...result, financeDrafts } });
  } catch (error) {
    return errorResponse(error);
  }
}
