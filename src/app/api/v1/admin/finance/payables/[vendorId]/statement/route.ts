import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { getSupplierPayableDetail, statementCsv } from '@/modules/finance/supplierPayable.service';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.view');
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    const vendorId = parts[parts.length - 2] ?? '';
    const detail = await getSupplierPayableDetail(vendorId);
    const csv = statementCsv(detail);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="supplier-payables-${vendorId.slice(0, 8)}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
