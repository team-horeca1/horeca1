import { brandOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { pageHeroReorderHandler } from '@/modules/homepage/page-hero.http';

export const PATCH = brandOnly(
  pageHeroReorderHandler(async (req, ctx) => {
    requirePermission(ctx, 'settings.edit');
    const { brandId } = await resolveBrandContext(ctx, req);
    return { brandId };
  }),
);
