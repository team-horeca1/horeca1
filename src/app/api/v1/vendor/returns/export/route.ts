// GET /api/v1/vendor/returns/export — Full CSV of filtered returns (not page-only)

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { returnService } from '@/modules/return/return.service';
import { reportReturnsQuerySchema } from '@/modules/return/return.validator';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'returns.view');

    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const filters = reportReturnsQuerySchema.parse(raw);

    const csv = await returnService.exportCsv(vendorId, filters);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="returns-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
