import { vendorOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { pageHeroItemHandlers } from '@/modules/homepage/page-hero.http';

const handlers = pageHeroItemHandlers(async (req, ctx) => {
  requirePermission(ctx, 'settings.edit');
  const { vendorId } = await resolveVendorContext(ctx, req);
  return { vendorId };
});

export const PATCH = vendorOnly(handlers.PATCH);
export const DELETE = vendorOnly(handlers.DELETE);
