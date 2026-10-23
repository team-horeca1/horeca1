import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { hasPermission, requireAnyPermissionInline } from '@/lib/permissions/engine';
import { loadAffiliateOverview, loadAffiliateRegistrations } from '@/modules/registration/registrationExport';
import type { RegistrationExportKind } from '@/modules/registration/registrationExportFormat';
import type { AuthContext } from '@/middleware/auth';

export function affiliateKindsFor(ctx: AuthContext): RegistrationExportKind[] {
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
    const kinds = requested ? [requested] : allowed;
    const code = req.nextUrl.searchParams.get('code');
    const filters = {
      kinds,
      code,
      from: req.nextUrl.searchParams.get('from'),
      to: req.nextUrl.searchParams.get('to'),
      search: req.nextUrl.searchParams.get('q'),
    };
    if (code) {
      const rows = await loadAffiliateRegistrations(filters);
      return NextResponse.json({
        success: true,
        data: {
          code: rows[0]?.referralCode ?? code.toUpperCase(),
          rows: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        },
      });
    }
    const overview = await loadAffiliateOverview(kinds);
    return NextResponse.json({ success: true, data: overview });
  } catch (error) {
    return errorResponse(error);
  }
});
