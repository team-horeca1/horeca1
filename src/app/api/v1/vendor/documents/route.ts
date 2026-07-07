// GET  /api/v1/vendor/documents — List vendor's uploaded documents
// POST /api/v1/vendor/documents — Upload a new document (ImageKit URL submitted by client)
// WHY: Admin needs to verify FSSAI license, GST cert, PAN, bank proof before approving vendor.
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';

const DOC_TYPES = ['fssai', 'gst', 'pan', 'bank_proof', 'other'] as const;

const uploadSchema = z.object({
  type: z.enum(DOC_TYPES),
  fileUrl: z.string().url('Must be a valid URL'),
  fileName: z.string().min(1),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.view');
    const vendorId = await resolveVendorId(ctx, req);

    const documents = await prisma.vendorDocument.findMany({
      where: { vendorId },
      orderBy: { uploadedAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit');
    const vendorId = await resolveVendorId(ctx, req);

    const body = await req.json();
    const data = uploadSchema.parse(body);

    const document = await prisma.vendorDocument.create({
      data: {
        vendorId,
        type: data.type,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
      },
    });

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
