// GET /api/v1/vendor/price-lists/workspace/export — CSV of full matrix

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { exportWorkspaceCsv } from '@/modules/pricing/pricelist-workspace.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.view');
    const vendorId = await resolveVendorId(ctx, req);
    const params = req.nextUrl.searchParams;
    const csv = await exportWorkspaceCsv({
      vendorId,
      search: params.get('search')?.trim() || undefined,
      categoryId: params.get('categoryId') || undefined,
      brandId: params.get('brandId') || undefined,
      collectionId: params.get('collectionId') || undefined,
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="pricelist-workspace.csv"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
