// GET /api/v1/vendor/returns/:id/credit-note — Download credit note PDF

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { generateCreditNotePdf } from '@/lib/credit-note';

function extractReturnId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // .../returns/:id/credit-note
  const cnIdx = segments.lastIndexOf('credit-note');
  return segments[cnIdx - 1]!;
}

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'returns.view');

    const returnId = extractReturnId(req);
    const ret = await prisma.returnRequest.findFirst({
      where: { id: returnId, order: { vendorId } },
      select: { id: true, creditNoteNumber: true },
    });
    if (!ret) throw Errors.notFound('Return request');
    if (!ret.creditNoteNumber) {
      throw Errors.badRequest('Credit note has not been generated for this return');
    }

    const pdfBuffer = await generateCreditNotePdf(returnId);
    const filename = `${ret.creditNoteNumber}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
