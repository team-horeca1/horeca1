/**
 * PATCH /api/v1/admin/products/bulk-update
 * ────────────────────────────────────────
 * Admin version of the bulk product update — same engine as the vendor route
 * (shared schemas + math in bulk-update.shared) but cross-vendor: the filter
 * additionally accepts a vendorId scope (or null for catalog-level products).
 *
 * Query: ?mode=preview → dry-run, returns { matched, sample } without writing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { assertLeafCategory } from '@/modules/catalog/catalog.service';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import {
  filterSchemaBase, setSchemaBase,
  applyAdjustment, applyOfferPrice, round, buildPreviewSample,
} from '@/modules/catalog/bulk-update.shared';
import { resolveBulkProductFilter, buildSeasonalMetadataPatch } from '@/modules/catalog/bulk-filter';

// ── Schemas ─────────────────────────────────────────────────────────────

const filterSchema = filterSchemaBase
  .extend({ vendorId: z.string().uuid().nullable().optional() }) // null = catalog products
  .refine(
    (f) => !!(f.productIds || f.skus?.length || f.categoryId || f.brand || typeof f.isActive === 'boolean' || f.vendorId !== undefined),
    { message: 'Provide at least one filter criterion (productIds | skus | categoryId | brand | isActive | vendorId)' },
  );

const setSchema = setSchemaBase.refine(
  (s) => Object.keys(s).length > 0,
  { message: 'Provide at least one field in set' },
);

const bodySchema = z.object({
  filter: filterSchema,
  set: setSchema,
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.edit');
    const body = bodySchema.parse(await req.json());
    const isPreview = new URL(req.url).searchParams.get('mode') === 'preview';

    const vendorScope = body.filter.vendorId && typeof body.filter.vendorId === 'string'
      ? { vendorId: body.filter.vendorId }
      : undefined;
    const resolved = await resolveBulkProductFilter(body.filter, vendorScope);

    // Build the WHERE clause.
    const where: Record<string, unknown> = {};
    if (resolved.productIds) where.id = { in: resolved.productIds };
    if (resolved.categoryId) where.categoryId = resolved.categoryId;
    if (resolved.brand) where.brand = resolved.brand;
    if (typeof resolved.isActive === 'boolean') where.isActive = resolved.isActive;
    if (body.filter.vendorId !== undefined) where.vendorId = body.filter.vendorId; // can be null

    const offer = body.set.offer;
    const newCategoryIds = body.set.categoryIds;
    if (newCategoryIds) await assertLeafCategory(newCategoryIds);

    const matchedCount = await prisma.product.count({ where });

    // ── Preview (dry-run) ───────────────────────────────────────────────
    if (isPreview) {
      const sampleRows = await prisma.product.findMany({
        where,
        take: 8,
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, basePrice: true, originalPrice: true, taxPercent: true,
          promoPrice: true, promoStartTime: true, promoEndTime: true,
          isActive: true, creditEligible: true, isFeatured: true, minOrderQty: true,
        },
      });
      return NextResponse.json({
        success: true,
        data: { matched: matchedCount, sample: buildPreviewSample(sampleRows, body.set) },
      });
    }

    if (matchedCount === 0) {
      return NextResponse.json({ success: true, data: { matched: 0, updated: 0 } });
    }

    // Direct-field updates
    const direct: Record<string, unknown> = {};
    if (body.set.isActive        !== undefined) direct.isActive = body.set.isActive;
    if (body.set.minOrderQty     !== undefined) direct.minOrderQty = body.set.minOrderQty;
    if (body.set.taxPercent      !== undefined) direct.taxPercent = body.set.taxPercent;
    if (body.set.creditEligible  !== undefined) direct.creditEligible = body.set.creditEligible;
    if (body.set.isFeatured      !== undefined) direct.isFeatured = body.set.isFeatured;
    if (body.set.vegNonVeg       !== undefined) direct.vegNonVeg = body.set.vegNonVeg;
    if (body.set.storageType     !== undefined) direct.storageType = body.set.storageType;
    if (body.set.shelfLifeDays   !== undefined) direct.shelfLifeDays = body.set.shelfLifeDays;
    if (body.set.description     !== undefined) direct.description = body.set.description;
    if (body.set.brand           !== undefined) direct.brand = body.set.brand;
    if (body.set.countryOfOrigin !== undefined) direct.countryOfOrigin = body.set.countryOfOrigin;
    if (body.set.name            !== undefined) direct.name = body.set.name;
    if (body.set.sku             !== undefined) direct.sku = body.set.sku;
    if (body.set.hsn             !== undefined) direct.hsn = body.set.hsn;
    if (body.set.unit            !== undefined) direct.unit = body.set.unit;
    if (body.set.packSize        !== undefined) direct.packSize = body.set.packSize;
    if (body.set.barcode         !== undefined) direct.barcode = body.set.barcode;
    if (body.set.fssaiRef        !== undefined) direct.fssaiRef = body.set.fssaiRef;
    if (body.set.imageUrl        !== undefined) direct.imageUrl = body.set.imageUrl;
    if (body.set.tags            !== undefined) direct.tags = body.set.tags;
    if (body.set.aliasNames      !== undefined) direct.aliasNames = body.set.aliasNames;
    if (body.set.images          !== undefined) direct.images = body.set.images;
    if (body.set.clearPromo) {
      direct.promoPrice = null;
      direct.promoStartTime = null;
      direct.promoEndTime = null;
    }
    if (newCategoryIds) direct.categoryId = newCategoryIds[0];

    // Offer (deal price + daily window).
    if (offer) {
      if (offer.startTime !== undefined) direct.promoStartTime = offer.startTime;
      if (offer.endTime !== undefined) direct.promoEndTime = offer.endTime;
      if (offer.mode === 'clear') {
        direct.promoPrice = null;
        direct.promoStartTime = null;
        direct.promoEndTime = null;
      } else if (offer.mode === 'setPrice') {
        direct.promoPrice = round(offer.value ?? 0);
      }
    }

    const offerSlabPercent = !!(offer?.applyToSlabs && offer.mode === 'percentOff');
    const needSlabFetch = (body.set.applyToSlabs && body.set.basePrice) || offerSlabPercent;
    const needsRowFetch =
      body.set.basePrice || body.set.originalPrice || needSlabFetch || offer?.mode === 'percentOff';

    let updatedCount = 0;

    await prisma.$transaction(async (tx) => {
      // 1. Direct-field updateMany
      if (Object.keys(direct).length > 0) {
        const r = await tx.product.updateMany({ where, data: direct });
        updatedCount = Math.max(updatedCount, r.count);
      }

      // 1b. Replace the multi-category join rows for every matched product.
      if (newCategoryIds) {
        const matched = await tx.product.findMany({ where, select: { id: true } });
        for (const { id } of matched) {
          await tx.productCategory.deleteMany({ where: { productId: id } });
          await tx.productCategory.createMany({
            data: newCategoryIds.map((cid, idx) => ({ productId: id, categoryId: cid, isPrimary: idx === 0 })),
            skipDuplicates: true,
          });
        }
        updatedCount = Math.max(updatedCount, matched.length);
      }

      // 1c. Constant slab promo writes (setPrice / clear).
      if (offer?.applyToSlabs && (offer.mode === 'setPrice' || offer.mode === 'clear')) {
        await tx.priceSlab.updateMany({
          where: { product: where },
          data: { promoPrice: offer.mode === 'clear' ? null : round(offer.value ?? 0) },
        });
      }

      // 2. Per-row adjustments (price, MRP, percentOff offer + its slabs).
      if (needsRowFetch) {
        const products = await tx.product.findMany({
          where,
          select: {
            id: true,
            basePrice: true,
            originalPrice: true,
            ...(needSlabFetch ? { priceSlabs: { select: { id: true, price: true } } } : {}),
          },
        });
        for (const p of products) {
          const update: Record<string, unknown> = {};
          if (body.set.basePrice) {
            update.basePrice = applyAdjustment(Number(p.basePrice), body.set.basePrice);
          }
          if (body.set.originalPrice) {
            const current = p.originalPrice ? Number(p.originalPrice) : Number(p.basePrice);
            update.originalPrice = applyAdjustment(current, body.set.originalPrice);
          }
          if (offer?.mode === 'percentOff') {
            update.promoPrice = applyOfferPrice(Number(p.basePrice), offer.value ?? 0);
          }
          if (Object.keys(update).length > 0) {
            await tx.product.update({ where: { id: p.id }, data: update });
          }
          if ('priceSlabs' in p && Array.isArray(p.priceSlabs)) {
            for (const slab of p.priceSlabs) {
              const slabData: Record<string, unknown> = {};
              if (body.set.applyToSlabs && body.set.basePrice) {
                slabData.price = applyAdjustment(Number(slab.price), body.set.basePrice);
              }
              if (offerSlabPercent) {
                slabData.promoPrice = applyOfferPrice(Number(slab.price), offer!.value ?? 0);
              }
              if (Object.keys(slabData).length > 0) {
                await tx.priceSlab.update({ where: { id: slab.id }, data: slabData });
              }
            }
          }
        }
        updatedCount = Math.max(updatedCount, products.length);
      }

      if (body.set.seasonalOffFrom || body.set.seasonalOffTo) {
        const matched = await tx.product.findMany({ where, select: { id: true, metadata: true } });
        for (const p of matched) {
          const patch = buildSeasonalMetadataPatch(p.metadata, body.set.seasonalOffFrom, body.set.seasonalOffTo);
          await tx.product.update({ where: { id: p.id }, data: patch });
        }
        updatedCount = Math.max(updatedCount, matched.length);
      }
    });

    void logAction(ctx, req, {
      action: AUDIT_ACTIONS.productBulkUpdate,
      entity: 'product',
      metadata: {
        scope: 'admin',
        vendorId: body.filter.vendorId ?? null,
        matched: matchedCount,
        updated: updatedCount,
        setKeys: Object.keys(body.set),
      },
    });

    return NextResponse.json({ success: true, data: { matched: matchedCount, updated: updatedCount } });
  } catch (err) {
    return errorResponse(err instanceof z.ZodError ? Errors.badRequest(err.issues[0]?.message ?? 'Invalid input') : err);
  }
});
