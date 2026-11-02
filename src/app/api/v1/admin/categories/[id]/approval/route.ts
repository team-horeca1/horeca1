// PATCH /api/v1/admin/categories/:id/approval — Approve or reject a vendor-suggested category
// WHY: Vendors can suggest new categories; admin reviews and approves or rejects
//      before they become available in the marketplace taxonomy.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { emitEvent } from '@/events/emitter';
import { requirePermission } from '@/lib/permissions/engine';
import { invalidateCatalogCaches } from '@/lib/catalogCache';

// Helper: extract the [id] segment from /api/v1/admin/categories/{id}/approval
function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  // segments: [..., 'categories', '{id}', 'approval']
  return segments[segments.length - 2];
}

const approvalSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().optional(),
});

// PATCH — approve or reject a vendor-suggested category
export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.approve');
    const id = extractId(req);
    const body = await req.json();
    const { action, note } = approvalSchema.parse(body);

    // Verify category exists
    const existing = await prisma.category.findUnique({
      where: { id },
      select: { id: true, name: true, suggestedBy: true },
    });
    if (!existing) throw Errors.notFound('Category');

    if (action === 'approve') {
      const category = await prisma.category.update({
        where: { id },
        data: {
          approvalStatus: 'approved',
          approvedBy: ctx.userId,
          approvedAt: new Date(),
          approvalNote: note ?? null,
          isActive: true,
        },
      });

      emitEvent('CategoryApproved', {
        categoryId: id,
        categoryName: existing.name,
        approvedBy: ctx.userId,
        suggestedBy: existing.suggestedBy ?? undefined,
      });

      await invalidateCatalogCaches();

      return NextResponse.json({ success: true, data: category });
    }

    // action === 'reject'
    const category = await prisma.category.update({
      where: { id },
      data: {
        approvalStatus: 'rejected',
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        approvalNote: note ?? null,
      },
    });

    emitEvent('CategoryRejected', {
      categoryId: id,
      categoryName: existing.name,
      rejectedBy: ctx.userId,
      suggestedBy: existing.suggestedBy ?? undefined,
      reason: note,
    });

    await invalidateCatalogCaches();

    return NextResponse.json({ success: true, data: category });
  } catch (error) {
    return errorResponse(error);
  }
});
