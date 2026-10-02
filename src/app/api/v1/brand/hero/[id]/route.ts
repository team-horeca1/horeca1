import { brandOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { pageHeroItemHandlers } from '@/modules/homepage/page-hero.http';

const handlers = pageHeroItemHandlers(async (req, ctx) => {
  requirePermission(ctx, 'settings.edit');
  const { brandId } = await resolveBrandContext(ctx, req);
  return { brandId };
});

export const PATCH = brandOnly(handlers.PATCH);
export const DELETE = brandOnly(handlers.DELETE);
