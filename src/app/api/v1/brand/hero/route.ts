import { brandOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveBrandContext } from '@/lib/resolveBrandId';
import { pageHeroCollectionHandlers } from '@/modules/homepage/page-hero.http';

const handlers = pageHeroCollectionHandlers(async (req, ctx) => {
  requirePermission(ctx, req.method === 'GET' ? 'settings.view' : 'settings.edit');
  const { brandId } = await resolveBrandContext(ctx, req);
  return { brandId };
});

export const GET = brandOnly(handlers.GET);
export const POST = brandOnly(handlers.POST);
