import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors } from '@/middleware/errorHandler';
import { pageHeroCollectionHandlers } from '@/modules/homepage/page-hero.http';
import { vendorPageHeroOwner } from '@/modules/homepage/page-hero.service';

function vendorIdFromPath(pathname: string): string {
  const parts = pathname.split('/');
  const i = parts.indexOf('vendors');
  const id = i >= 0 ? parts[i + 1] : undefined;
  if (!id) throw Errors.badRequest('Missing vendor id');
  return id;
}

const handlers = pageHeroCollectionHandlers(async (req, ctx) => {
  requirePermission(ctx, req.method === 'GET' ? 'vendors.view' : 'vendors.edit');
  return vendorPageHeroOwner(vendorIdFromPath(req.nextUrl.pathname));
});

export const GET = adminOnly(handlers.GET);
export const POST = adminOnly(handlers.POST);
