import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors } from '@/middleware/errorHandler';
import { pageHeroReorderHandler } from '@/modules/homepage/page-hero.http';
import { vendorPageHeroOwner } from '@/modules/homepage/page-hero.service';

export const PATCH = adminOnly(
  pageHeroReorderHandler(async (req, ctx) => {
    requirePermission(ctx, 'vendors.edit');
    const parts = req.nextUrl.pathname.split('/');
    const i = parts.indexOf('vendors');
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (!id) throw Errors.badRequest('Missing vendor id');
    return vendorPageHeroOwner(id);
  }),
);
