import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { Errors } from '@/middleware/errorHandler';
import { pageHeroItemHandlers } from '@/modules/homepage/page-hero.http';
import { brandPageHeroOwner } from '@/modules/homepage/page-hero.service';

function brandIdFromPath(pathname: string): string {
  const parts = pathname.split('/');
  const i = parts.indexOf('brands');
  const id = i >= 0 ? parts[i + 1] : undefined;
  if (!id) throw Errors.badRequest('Missing brand id');
  return id;
}

const handlers = pageHeroItemHandlers(async (req, ctx) => {
  requirePermission(ctx, 'brands.edit');
  return brandPageHeroOwner(brandIdFromPath(req.nextUrl.pathname));
});

export const PATCH = adminOnly(handlers.PATCH);
export const DELETE = adminOnly(handlers.DELETE);
