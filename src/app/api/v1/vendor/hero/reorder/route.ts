import { vendorOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { pageHeroReorderHandler } from '@/modules/homepage/page-hero.http';

export const PATCH = vendorOnly(
  pageHeroReorderHandler(async (req, ctx) => {
    requirePermission(ctx, 'settings.edit');
    const { vendorId } = await resolveVendorContext(ctx, req);
    return { vendorId };
  }),
);
