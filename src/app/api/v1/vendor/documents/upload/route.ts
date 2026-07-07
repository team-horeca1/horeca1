// POST /api/v1/vendor/documents/upload
// Direct file upload (multipart) for a logged-in vendor's KYC documents. The
// file is written to the droplet's uploads volume and a VendorDocument row is
// created with status=pending. Replaces the old "paste an ImageKit URL" flow.
// PROTECTED: vendor (or admin acting on a vendor) only.

import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { withRateLimit } from '@/middleware/withRateLimit';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { resolveVendorId } from '@/lib/resolveVendorId';
import {
  MAX_DOC_BYTES,
  extForMime,
  newDocId,
  saveVendorDoc,
  serveUrl,
} from '@/lib/vendorDocStorage';

export const runtime = 'nodejs';

const DOC_TYPES = ['fssai', 'gst', 'pan', 'bank_proof', 'other'];

export const POST = withRateLimit(
  vendorOnly(async (req: NextRequest, ctx) => {
    try {
      requirePermission(ctx, 'settings.edit');
      const vendorId = await resolveVendorId(ctx, req);

      const form = await req.formData();
      const file = form.get('file');
      const type = String(form.get('type') ?? '');

      if (!(file instanceof File)) throw Errors.badRequest('No file provided');
      if (!DOC_TYPES.includes(type)) throw Errors.badRequest('Invalid document type');

      const ext = extForMime(file.type);
      if (!ext) throw Errors.badRequest('Unsupported file type. Allowed: PDF, JPG, PNG, WebP');
      if (file.size > MAX_DOC_BYTES) throw Errors.badRequest('File too large. Max size: 10MB');

      const docId = newDocId();
      const buffer = Buffer.from(await file.arrayBuffer());
      await saveVendorDoc(vendorId, docId, ext, buffer);

      const document = await prisma.vendorDocument.create({
        data: {
          id: docId,
          vendorId,
          type,
          fileUrl: serveUrl(docId, ext),
          fileName: file.name.slice(0, 255),
        },
      });

      return NextResponse.json({ success: true, data: document }, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  }),
  'upload',
);
