import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors } from '@/middleware/errorHandler';
import { pageHeroCollectionHandlers } from '@/modules/homepage/page-hero.http';
import { brandPageHeroOwner } from '@/modules/homepage/page-hero.service';

function brandIdFromPath(pathname: string): string {
  const parts = pathname.split('/');
  const i = parts.indexOf('brands');
  const id = i >= 0 ? parts[i + 1] : undefined;
  if (!id) throw Errors.badRequest('Missing brand id');
  return id;
}

const handlers = pageHeroCollectionHandlers(async (req, ctx) => {
  requirePermission(ctx, req.method === 'GET' ? 'brands.view' : 'brands.edit');
  return brandPageHeroOwner(brandIdFromPath(req.nextUrl.pathname));
});

export const GET = adminOnly(handlers.GET);
export const POST = adminOnly(handlers.POST);
