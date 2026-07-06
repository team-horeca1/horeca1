// GET   /api/v1/inventory/:productId — Get stock info for a product
// PATCH /api/v1/inventory/:productId — Update stock level (vendor only)

import { NextRequest, NextResponse } from 'next/server';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { updateStockSchema } from '@/modules/inventory/inventory.validator';
import { withRole } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { prisma } from '@/lib/prisma';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { getPrimaryOutletIdForVendor } from '@/lib/inventoryOutlet';

const inventoryService = new InventoryService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    const outletId = req.nextUrl.searchParams.get('outletId') ?? undefined;
    const stock = await inventoryService.getStock(productId, outletId);
    return NextResponse.json({ success: true, data: stock });
  } catch (error) {
    return errorResponse(error);
  }
}

export const PATCH = withRole(['vendor', 'admin'], async (req: NextRequest, ctx) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const productId = segments[segments.length - 1];

    const body = await req.json();
    const { outletId: bodyOutletId, ...stockFields } = updateStockSchema.parse(body);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { vendorId: true },
    });
    if (!product?.vendorId) throw Errors.notFound('Product');

    let vendorId = product.vendorId;
    if (ctx.role === 'vendor') {
      const v = await resolveVendorContext(ctx, req);
      if (v.vendorId !== vendorId) throw Errors.forbidden('Not your product');
      vendorId = v.vendorId;
    }

    const outletId = bodyOutletId ?? (await getPrimaryOutletIdForVendor(vendorId));
    const stock = await inventoryService.updateStock(productId, vendorId, outletId, stockFields, ctx.userId);
    return NextResponse.json({ success: true, data: stock });
  } catch (error) {
    return errorResponse(error);
  }
});
