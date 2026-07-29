// PATCH /api/v1/vendor/cancel-requests/:id — Approve or reject customer cancel request

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { cancelRequestService } from '@/modules/order/cancel-request.service';

const schema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    vendorNote: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'rejected' && (val.vendorNote?.trim().length ?? 0) < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vendorNote'],
        message: 'A note to the customer (at least 10 characters) is required when declining.',
      });
    }
  });

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'orders.edit');
    const { vendorId } = await resolveVendorContext(ctx, req);
    const id = extractId(req);
    const body = schema.parse(await req.json());
    const data = await cancelRequestService.reviewCancelRequest(id, vendorId, ctx.userId, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});
