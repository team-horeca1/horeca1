// PATCH /api/v1/admin/master-products/:id/approval — Approve or reject a pending master catalog entry.
// PROTECTED: Admin only.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { emitEvent } from '@/events/emitter';
import { requirePermission } from '@/lib/permissions/engine';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { syncProductToBrand } from '@/modules/brand/brand.service';
import {
  brandMasterFieldsFromSubmitDetails,
  readBrandSubmitDetails,
} from '@/modules/brand/brand.validator';
import { sendProductRejectedNotifications } from '@/lib/productRejectionNotifications';
import { validateMasterSku } from '@/lib/sku';

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 2];
}

function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const approvalSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    note: z.string().optional(),
    /** Finalize catalog SKU on approve (optional when SKU was set at submission). */
    catalogSku: z.string().min(2).max(40).optional(),
  })
  .refine((d) => d.action !== 'reject' || (d.note?.trim().length ?? 0) > 0, {
    message: 'Rejection reason is required',
    path: ['note'],
  });

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.approve');
    const id = extractId(req);
    const { action, note, catalogSku } = approvalSchema.parse(await req.json());

    const existing = await prisma.masterProduct.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        brand: true,
        categoryId: true,
        imageUrl: true,
        packSize: true,
        uom: true,
        sku: true,
        suggestedBy: true,
        metadata: true,
      },
    });
    if (!existing) throw Errors.notFound('Master product');

    if (action === 'approve') {
      let finalSku = existing.sku;
      if (catalogSku?.trim()) {
        const skuCheck = validateMasterSku(catalogSku);
        if (!skuCheck.ok) throw Errors.badRequest(skuCheck.message);
        const taken = await prisma.masterProduct.findFirst({
          where: {
            sku: { equals: skuCheck.normalized, mode: 'insensitive' },
            id: { not: id },
          },
          select: { id: true },
        });
        if (taken) throw Errors.conflict(`SKU "${skuCheck.normalized}" is already in use`);
        finalSku = skuCheck.normalized;
      }

      const master = await prisma.masterProduct.update({
        where: { id },
        data: {
          sku: finalSku,
          approvalStatus: 'approved',
          approvedBy: ctx.userId,
          approvedAt: new Date(),
          approvalNote: note ?? null,
          isActive: true,
        },
      });

      // If brand user suggested this master, auto-create their BrandMasterProduct link.
      if (existing.suggestedBy) {
        const metaBrandId =
          existing.metadata &&
          typeof existing.metadata === 'object' &&
          !Array.isArray(existing.metadata) &&
          typeof (existing.metadata as Record<string, unknown>).brandId === 'string'
            ? ((existing.metadata as Record<string, unknown>).brandId as string)
            : null;

        const brand = metaBrandId
          ? await prisma.brand.findUnique({ where: { id: metaBrandId }, select: { id: true } })
          : await prisma.brand.findFirst({
              where: { userId: existing.suggestedBy },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            });
        if (brand) {
          const slug = slugify(existing.name);
          const detailFields = brandMasterFieldsFromSubmitDetails(
            readBrandSubmitDetails(existing.metadata),
          );
          const createData = {
            brandId: brand.id,
            masterProductId: master.id,
            name: existing.name,
            slug,
            sku: finalSku,
            categoryId: existing.categoryId,
            categoryIds: [existing.categoryId],
            imageUrl: existing.imageUrl,
            packSize: existing.packSize,
            unit: existing.uom,
            ...detailFields,
          };
          const updateData = {
            masterProductId: master.id,
            sku: finalSku,
            ...(existing.packSize ? { packSize: existing.packSize } : {}),
            ...(existing.uom ? { unit: existing.uom } : {}),
            ...detailFields,
            isActive: true,
          };

          // Identity-first: masterProductId / sku before brandId_slug so a
          // renamed submission updates the existing brand catalog row.
          const byMaster = await prisma.brandMasterProduct.findFirst({
            where: { brandId: brand.id, masterProductId: master.id },
            select: { id: true },
          });
          const bySku =
            !byMaster && finalSku
              ? await prisma.brandMasterProduct.findFirst({
                  where: {
                    brandId: brand.id,
                    sku: { equals: finalSku, mode: 'insensitive' },
                  },
                  select: { id: true },
                })
              : null;
          const existingBmp = byMaster ?? bySku;

          if (existingBmp) {
            await prisma.brandMasterProduct.update({
              where: { id: existingBmp.id },
              data: updateData,
            });
          } else {
            await prisma.brandMasterProduct.upsert({
              where: { brandId_slug: { brandId: brand.id, slug } },
              create: createData,
              update: updateData,
            });
          }
        }
      }

      syncProductToBrand(
        master.brand,
        master.name,
        master.categoryId,
        master.imageUrl,
        master.packSize,
        master.uom,
        master.sku,
        master.id,
      ).catch(console.error);

      emitEvent('ProductApproved', {
        productId: id,
        vendorId: '',
        productName: existing.name,
        approvedBy: ctx.userId,
      });

      logAction(ctx, req, {
        action: AUDIT_ACTIONS.productApprove,
        entity: 'MasterProduct',
        entityId: id,
        after: { approvalStatus: 'approved', note: note ?? null },
        metadata: { productName: existing.name, sku: existing.sku },
      });

      return NextResponse.json({ success: true, data: master });
    }

    const master = await prisma.masterProduct.update({
      where: { id },
      data: {
        approvalStatus: 'rejected',
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        approvalNote: note ?? null,
      },
    });

    await sendProductRejectedNotifications({
      productId: id,
      productName: existing.name,
      reason: note,
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.productReject,
      entity: 'MasterProduct',
      entityId: id,
      after: { approvalStatus: 'rejected', note: note ?? null },
      metadata: { productName: existing.name, sku: existing.sku },
    });

    return NextResponse.json({ success: true, data: master });
  } catch (error) {
    return errorResponse(error);
  }
});
