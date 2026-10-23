import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { hasPermission, requireAnyPermissionInline } from '@/lib/permissions/engine';
import { renderAffiliateExport } from '@/modules/registration/registrationExport';
import type { RegistrationExportKind } from '@/modules/registration/registrationExportFormat';
import type { AuthContext } from '@/middleware/auth';

function affiliateKindsFor(ctx: AuthContext): RegistrationExportKind[] {
  const kinds: RegistrationExportKind[] = [];
  if (hasPermission(ctx, 'customers.view')) kinds.push('customer');
  if (hasPermission(ctx, 'vendors.view')) kinds.push('vendor');
  if (hasPermission(ctx, 'brands.view')) kinds.push('brand');
  return kinds;
}

function kindParam(value: string | null): RegistrationExportKind | null {
  if (value === 'customer' || value === 'vendor' || value === 'brand') return value;
  return null;
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requireAnyPermissionInline(ctx, 'customers.view', 'vendors.view', 'brands.view');
    const allowed = affiliateKindsFor(ctx);
    const requested = kindParam(req.nextUrl.searchParams.get('kind'));
    if (requested && !allowed.includes(requested)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'You cannot view that account type' } },
        { status: 403 },
      );
    }
    const file = await renderAffiliateExport({
      kinds: requested ? [requested] : allowed,
      code: req.nextUrl.searchParams.get('code'),
      from: req.nextUrl.searchParams.get('from'),
      to: req.nextUrl.searchParams.get('to'),
      search: req.nextUrl.searchParams.get('q'),
    }, req.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv');
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
