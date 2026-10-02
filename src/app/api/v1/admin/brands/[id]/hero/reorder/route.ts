import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors } from '@/middleware/errorHandler';
import { pageHeroReorderHandler } from '@/modules/homepage/page-hero.http';
import { brandPageHeroOwner } from '@/modules/homepage/page-hero.service';

export const PATCH = adminOnly(
  pageHeroReorderHandler(async (req, ctx) => {
    requirePermission(ctx, 'brands.edit');
    const parts = req.nextUrl.pathname.split('/');
    const i = parts.indexOf('brands');
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (!id) throw Errors.badRequest('Missing brand id');
    return brandPageHeroOwner(id);
  }),
);
