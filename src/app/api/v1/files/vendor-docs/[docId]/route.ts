// GET /api/v1/files/vendor-docs/<docId>.<ext>
// Streams a vendor KYC document from local disk. AUTHENTICATED: only an admin
// or the vendor that owns the document may fetch it. This is the access gate
// that lets us keep PAN / cheque / GST off public ImageKit urls.

import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { prisma } from '@/lib/prisma';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { parseServeSegment, readVendorDoc, mimeForExt } from '@/lib/vendorDocStorage';

export const runtime = 'nodejs';

export const GET = withRole(['admin', 'vendor'], async (req: NextRequest, ctx) => {
  try {
    const segment = req.nextUrl.pathname.split('/').pop() ?? '';
    const parsed = parseServeSegment(segment);
    if (!parsed) throw Errors.badRequest('Invalid document reference');

    const doc = await prisma.vendorDocument.findUnique({
      where: { id: parsed.docId },
      select: { id: true, vendorId: true, fileName: true },
    });
    if (!doc) throw Errors.notFound('Document');

    // Vendors may only read their own documents; admins need vendors.view.
    if (ctx.role === 'admin') {
      requirePermission(ctx, 'vendors.view');
    } else {
      const { vendorId } = await resolveVendorContext(ctx, req);
      if (vendorId !== doc.vendorId) throw Errors.forbidden();
    }

    const buffer = await readVendorDoc(doc.vendorId, doc.id, parsed.ext);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': mimeForExt(parsed.ext),
        'Content-Length': String(buffer.length),
        // inline so the admin review popup can render it in an <img>/<iframe>
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName)}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (error) {
    // A missing file on disk (e.g. volume not mounted) surfaces as ENOENT — map
    // to 404 rather than a 500 so the UI shows "not found" cleanly.
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return errorResponse(Errors.notFound('Document file'));
    }
    return errorResponse(error);
  }
});
