import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { buildDifferenceReport } from '@/modules/ledger/diff';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'ledger.view');
    const report = await buildDifferenceReport();
    const url = new URL(req.url);
    if (url.searchParams.get('format') === 'csv') {
      const lines = ['kind,id,expected,actual,difference,likely cause'];
      for (const row of report.orders) {
        lines.push(['order', row.id, row.expected, row.actual, row.difference, row.likelyCause].join(','));
      }
      for (const row of report.customers) {
        lines.push(['customer', row.id, row.expected, row.actual, row.difference, row.likelyCause].join(','));
      }
      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ledger-differences.csv"',
        },
      });
    }
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return errorResponse(error);
  }
});
