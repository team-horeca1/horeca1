import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { renderRegistrationExport } from '@/modules/registration/registrationExport';
import {
  registrationExportPermission,
  type RegistrationExportKind,
} from '@/modules/registration/registrationExportFormat';

function kindFromParam(value: string | null): RegistrationExportKind | null {
  if (value === 'customer' || value === 'vendor' || value === 'brand') return value;
  return null;
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    const kind = kindFromParam(req.nextUrl.searchParams.get('kind'));
    if (!kind) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'kind must be customer, vendor, or brand' } },
        { status: 400 },
      );
    }
    requirePermission(ctx, registrationExportPermission(kind));
    const format = req.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
    const file = await renderRegistrationExport(kind, format);
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
