// PATCH /api/v1/admin/products/:id/approval — Approve or reject a product
// WHY: Admin moderation workflow — vendors submit products, admin reviews and
//      approves or rejects them before they appear on the marketplace.
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { emitEvent } from '@/events/emitter';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { syncProductToBrand } from '@/modules/brand/brand.service';
import { sendProductRejectedNotifications } from '@/lib/productRejectionNotifications';
import {
  applyMasterLinkToVendorProduct,
  resolveMasterForVendorApproval,
  CatalogService,
} from '@/modules/catalog/catalog.service';
import { transitionProductApproval } from '@/modules/catalog/approval-state.service';

// Helper: extract the [id] segment from /api/v1/admin/products/{id}/approval
function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  // segments: [..., 'products', '{id}', 'approval']
  return segments[segments.length - 2];
}

const approvalSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    note: z.string().optional(),
    /** Admin-entered catalog SKU when approving a vendor listing without a master link. */
    catalogSku: z.string().min(2).max(40).optional(),
    /** Link to an existing approved master instead of creating one. */
    masterProductId: z.string().uuid().optional(),
    /** Required when linking to an existing master whose name differs from the listing. */
    confirmLink: z.boolean().optional(),
  })
  .refine((d) => d.action !== 'reject' || (d.note?.trim().length ?? 0) > 0, {
    message: 'Rejection reason is required',
    path: ['note'],
  });

// PATCH — approve or reject a product
export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.approve');
    const id = extractId(req);
    const body = await req.json();
    const { action, note, catalogSku, masterProductId, confirmLink } = approvalSchema.parse(body);

    // Verify product exists
    const existing = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        vendorId: true,
        name: true,
        brand: true,
        categoryId: true,
        imageUrl: true,
        unit: true,
        packSize: true,
        vendorSku: true,
        sku: true,
        masterProductId: true,
        categoryLinks: { select: { categoryId: true } },
      },
    });
    if (!existing) throw Errors.notFound('Product');
    if (!existing.vendorId) throw Errors.badRequest('Catalog-only products use the master product approval flow.');

    const currentProduct = await prisma.product.findUnique({
      where: { id },
      select: { approvalStatus: true },
    });

    // Pending material edit — approve/reject the queued changes only
    if (currentProduct?.approvalStatus === 'pending_edit') {
      const catalogService = new CatalogService();
      if (action === 'approve') {
        await catalogService.applyPendingProductEdit(id, ctx.userId);
        const product = await prisma.product.findUnique({ where: { id } });
        logAction(ctx, req, {
          action: AUDIT_ACTIONS.productApprove,
          entity: 'Product',
          entityId: id,
          after: { approvalStatus: 'approved', pendingEdit: 'applied' },
          metadata: { vendorId: existing.vendorId, productName: existing.name },
        });
        return NextResponse.json({ success: true, data: product });
      }
      await catalogService.rejectPendingProductEdit(id, ctx.userId, note);
      const product = await prisma.product.findUnique({ where: { id } });
      logAction(ctx, req, {
        action: AUDIT_ACTIONS.productReject,
        entity: 'Product',
        entityId: id,
        after: { approvalStatus: 'approved', pendingEdit: 'rejected' },
        metadata: { vendorId: existing.vendorId, productName: existing.name },
      });
      return NextResponse.json({ success: true, data: product });
    }

    if (action === 'approve') {
      // Gate: a product can only be approved once its brand AND category are
      // approved too. New (vendor-suggested) brands/categories must clear the
      // approvals queue first. A legacy text-only brand with no Brand record
      // doesn't block — there's nothing tracked to gate on.
      const refs = await prisma.product.findUnique({
        where: { id },
        select: {
          brand: true,
          category: { select: { name: true, approvalStatus: true } },
          categoryLinks: { select: { category: { select: { name: true, approvalStatus: true } } } },
        },
      });

      const blockers: string[] = [];

      if (refs?.brand) {
        const brand = await prisma.brand.findFirst({
          where: { name: { equals: refs.brand.trim(), mode: 'insensitive' } },
          select: { name: true, approvalStatus: true },
        });
        if (brand && brand.approvalStatus !== 'approved') {
          blockers.push(`Brand "${brand.name}" (${brand.approvalStatus})`);
        }
      }

      const seenCat = new Set<string>();
      const catRefs = [
        ...(refs?.category ? [refs.category] : []),
        ...(refs?.categoryLinks.map(pc => pc.category) ?? []),
      ];
      for (const c of catRefs) {
        if (!c || seenCat.has(c.name)) continue;
        seenCat.add(c.name);
        if (c.approvalStatus !== 'approved') {
          blockers.push(`Category "${c.name}" (${c.approvalStatus})`);
        }
      }

      if (blockers.length > 0) {
        throw Errors.badRequest(
          `Cannot approve "${existing.name}" yet — approve these first: ${blockers.join(', ')}.`
        );
      }

      const categoryIds =
        existing.categoryLinks.length > 0
          ? existing.categoryLinks.map((c) => c.categoryId)
          : existing.categoryId
            ? [existing.categoryId]
            : [];

      const resolvedMasterId = await resolveMasterForVendorApproval({
        product: { ...existing, vendorId: existing.vendorId },
        adminUserId: ctx.userId,
        catalogSku,
        masterProductId,
        categoryIds,
        confirmLink,
      });

      await applyMasterLinkToVendorProduct(id, existing.vendorId, resolvedMasterId);

      const product = await transitionProductApproval(id, 'approved', ctx.userId, {
        data: {
          approvedBy: ctx.userId,
          approvedAt: new Date(),
          approvalNote: note ?? null,
          masterProductId: resolvedMasterId,
        },
        source: 'admin_edit',
      });

      if (existing.vendorId) {
        emitEvent('ProductApproved', {
          productId: id,
          vendorId: existing.vendorId,
          productName: existing.name,
          approvedBy: ctx.userId,
        });
      }

      logAction(ctx, req, {
        action: AUDIT_ACTIONS.productApprove,
        entity: 'Product',
        entityId: id,
        after: { approvalStatus: 'approved', note: note ?? null },
        metadata: { vendorId: existing.vendorId, productName: existing.name },
      });

      if (product.brand) {
        syncProductToBrand(
          product.brand,
          product.name,
          product.categoryId,
          product.imageUrl,
          product.packSize ?? undefined,
          product.unit ?? undefined,
          product.sku ?? undefined,
          product.masterProductId || undefined,
          product.id,
        ).catch(console.error);
      }

      return NextResponse.json({ success: true, data: product });
    }

    // action === 'reject'
    const product = await transitionProductApproval(id, 'rejected', ctx.userId, {
      data: {
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        approvalNote: note ?? null,
      },
      source: 'admin_edit',
    });

    await sendProductRejectedNotifications({
      productId: id,
      vendorId: existing.vendorId,
      productName: existing.name,
      reason: note,
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.productReject,
      entity: 'Product',
      entityId: id,
      after: { approvalStatus: 'rejected', note: note ?? null },
      metadata: { vendorId: existing.vendorId, productName: existing.name },
    });

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    return errorResponse(error);
  }
});
