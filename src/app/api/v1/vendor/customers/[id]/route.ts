// PATCH  /api/v1/vendor/customers/:id — Update customer mapping (status, price list, etc.)
// DELETE /api/v1/vendor/customers/:id — Remove customer mapping
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';

function extractId(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

const patchSchema = z.object({
  status: z.enum(['active', 'blocked', 'suspended']).optional(),
  priceListId: z.string().uuid().nullable().optional(),
  territory: z.string().max(100).nullable().optional(),
  salesExecutive: z.string().max(100).optional().nullable(),
  salespersonId: z.string().uuid().nullable().optional(),
  deliveryRoute: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
  paymentTerms: z.string().max(50).nullable().optional(),
  allowedPaymentModes: z.array(z.enum(['cod', 'prepaid', 'credit', 'cheque', 'discco', 'online'])).optional(),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.vendorCustomer.findFirst({ where: { id, vendorId } });
    if (!existing) throw Errors.notFound('Customer mapping');

    const updated = await prisma.vendorCustomer.update({
      where: { id },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.priceListId !== undefined && { priceListId: body.priceListId }),
        ...(body.territory !== undefined && { territory: body.territory }),
        ...(body.salesExecutive !== undefined && { salesExecutive: body.salesExecutive }),
        ...(body.salespersonId !== undefined && { salespersonId: body.salespersonId }),
        ...(body.deliveryRoute !== undefined && { deliveryRoute: body.deliveryRoute }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.paymentTerms !== undefined && { paymentTerms: body.paymentTerms }),
        ...(body.allowedPaymentModes !== undefined && { allowedPaymentModes: body.allowedPaymentModes }),
      },
      include: {
        user: { select: { id: true, fullName: true, businessName: true, email: true } },
        priceList: { select: { id: true, name: true } },
        salesperson: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);

    const existing = await prisma.vendorCustomer.findFirst({ where: { id, vendorId } });
    if (!existing) throw Errors.notFound('Customer mapping');

    await prisma.vendorCustomer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
