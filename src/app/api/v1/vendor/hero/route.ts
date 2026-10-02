import { vendorOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { pageHeroCollectionHandlers } from '@/modules/homepage/page-hero.http';

const handlers = pageHeroCollectionHandlers(async (req, ctx) => {
  requirePermission(ctx, req.method === 'GET' ? 'settings.view' : 'settings.edit');
  const { vendorId } = await resolveVendorContext(ctx, req);
  return { vendorId };
});

export const GET = vendorOnly(handlers.GET);
export const POST = vendorOnly(handlers.POST);
