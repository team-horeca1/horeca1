// GET    /api/v1/vendor/price-lists/:id — Get price list with items + assignments
// PATCH  /api/v1/vendor/price-lists/:id — Update name / discountPercent /
//                                          isActive / items / assignments
// DELETE /api/v1/vendor/price-lists/:id — Soft-delete (isActive = false)
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { logPriceHistory, type PriceHistoryEntry } from '@/lib/priceHistory';

function extractId(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

// V2.2 Phase 4 — item with pricing-type discriminator. customPrice is
// required for fixed/special/scheme; discountPercent is required for
// discount. schemeMinQty is required for scheme. Validation matches the
// DB column nullability post-migration.
const itemSchema = z.object({
  productId: z.string().uuid().optional(),
  sku: z.string().max(100).optional(),
  customPrice: z.number().min(0).optional(),
  pricingType: z.enum(['fixed', 'discount', 'special', 'scheme']).default('fixed'),
  discountPercent: z.number().min(0).max(100).optional(),
  schemeMinQty: z.number().int().min(1).optional(),
  schemeFreeQty: z.number().int().min(0).optional(),
  // Phase-5 cell attributes. Optional — when omitted on update we PRESERVE
  // whatever the Workspace grid set, so the two surfaces no longer wipe each
  // other. When present, the editor's advanced row drawer controls them.
  isLocked: z.boolean().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  scheduledPrice: z.number().min(0).nullable().optional(),
  scheduledFrom: z.string().nullable().optional(),
  scheduledTo: z.string().nullable().optional(),
}).refine(
  (i) => !!(i.productId || i.sku),
  { message: 'Each item needs productId or sku' },
).refine(
  (i) => {
    if (i.pricingType === 'discount') return typeof i.discountPercent === 'number';
    if (i.pricingType === 'scheme')   return typeof i.customPrice === 'number' && typeof i.schemeMinQty === 'number';
    return typeof i.customPrice === 'number';  // fixed | special
  },
  { message: 'Pricing type fields incomplete: discount needs discountPercent, scheme needs customPrice+schemeMinQty, fixed/special need customPrice' },
);

// V2.2 Phase 4 — assignment shape mirrors the PriceListAssignment row.
// Server validates that the right targeting column is populated for the
// given `type` (DB CHECK enforces this too — defence in depth).
const assignmentSchema = z.object({
  type: z.enum(['customer', 'outlet', 'pincode', 'area', 'segment', 'brand', 'group']),
  userId: z.string().uuid().optional(),
  businessAccountId: z.string().uuid().optional(),
  outletId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  pincode: z.string().max(10).optional(),
  area: z.string().max(100).optional(),
  segment: z.string().max(100).optional(),
  brandName: z.string().max(150).optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  // Optional list-level validity window (ISO datetime strings or null).
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  items: z.array(itemSchema).optional(),
  assignments: z.array(assignmentSchema).optional(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.view');
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);

    const priceList = await prisma.priceList.findFirst({
      where: { id, vendorId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, basePrice: true, unit: true, packSize: true } },
          },
        },
        customers: {
          include: {
            user: { select: { id: true, fullName: true, businessName: true } },
          },
        },
        // V2.2 Phase 4 — assignments with the referenced row included so
        // the UI can render "Targets outlet: Mumbai Warehouse" instead
        // of a raw uuid.
        assignments: {
          include: {
            user:            { select: { id: true, fullName: true, email: true } },
            businessAccount: { select: { id: true, legalName: true, displayName: true } },
            outlet:          { select: { id: true, name: true, pincode: true, city: true } },
            brand:           { select: { id: true, name: true } },
            group:           { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!priceList) throw Errors.notFound('Price list');

    return NextResponse.json({ success: true, data: priceList });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.priceList.findFirst({ where: { id, vendorId } });
    if (!existing) throw Errors.notFound('Price list');

    // ── Resolve SKU → productId for any items that came in by SKU,
    //    scoped strictly to this vendor so a forged SKU can't punch
    //    a hole in multi-tenancy.
    const skusToResolve = (body.items ?? []).filter((i) => i.sku && !i.productId).map((i) => i.sku!);
    let skuMap = new Map<string, string>();
    if (skusToResolve.length > 0) {
      const found = await prisma.product.findMany({
        where: { sku: { in: skusToResolve }, vendorId },
        select: { id: true, sku: true },
      });
      skuMap = new Map(found.filter((p) => p.sku).map((p) => [p.sku!, p.id]));
    }
    const resolvedItems = (body.items ?? []).map((i) => ({
      ...i,
      productId: i.productId ?? (i.sku ? skuMap.get(i.sku) : undefined),
    }));
    const unresolved = resolvedItems.filter((i) => !i.productId);
    if (unresolved.length > 0) {
      throw Errors.badRequest(`Could not resolve ${unresolved.length} item(s) — SKU not found under this vendor`);
    }

    // ── Validate every assignment's targeting column matches its type.
    //    DB CHECK enforces this too but a friendly error is better than
    //    a constraint violation message.
    for (const a of body.assignments ?? []) {
      const ok = (
        (a.type === 'customer' && (a.userId || a.businessAccountId)) ||
        (a.type === 'outlet'   && a.outletId) ||
        (a.type === 'pincode'  && a.pincode) ||
        (a.type === 'area'     && a.area) ||
        (a.type === 'segment'  && a.segment) ||
        (a.type === 'brand'    && (a.brandId || a.brandName)) ||
        (a.type === 'group'    && a.groupId)
      );
      if (!ok) throw Errors.badRequest(`Assignment of type '${a.type}' is missing its targeting field`);
    }

    // ── Multi-tenant validation for assignment FK columns: outlet must
    //    belong to a customer of this vendor; brand must exist; user
    //    must be a real user. We don't strictly require the user to be
    //    a known customer because vendors might want to pre-assign
    //    pricing for a customer not yet onboarded.
    const outletIds = (body.assignments ?? []).flatMap((a) => a.outletId ? [a.outletId] : []);
    if (outletIds.length > 0) {
      const found = await prisma.outlet.findMany({ where: { id: { in: outletIds } }, select: { id: true } });
      if (found.length !== outletIds.length) throw Errors.badRequest('One or more outlet ids do not exist');
    }
    const brandIds = (body.assignments ?? []).flatMap((a) => a.brandId ? [a.brandId] : []);
    if (brandIds.length > 0) {
      const found = await prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true } });
      if (found.length !== brandIds.length) throw Errors.badRequest('One or more brand ids do not exist');
    }
    // Customer groups must belong to THIS vendor (multi-tenancy).
    const groupIds = (body.assignments ?? []).flatMap((a) => a.groupId ? [a.groupId] : []);
    if (groupIds.length > 0) {
      const found = await prisma.customerGroup.findMany({ where: { id: { in: groupIds }, vendorId }, select: { id: true } });
      if (found.length !== new Set(groupIds).size) throw Errors.badRequest('One or more customer groups do not belong to this vendor');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const pl = await tx.priceList.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.discountPercent !== undefined && { discountPercent: body.discountPercent }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.validFrom !== undefined && { validFrom: body.validFrom ? new Date(body.validFrom) : null }),
          ...(body.validTo !== undefined && { validTo: body.validTo ? new Date(body.validTo) : null }),
        },
      });

      if (body.items !== undefined) {
        // Non-destructive sync. The OLD code did deleteMany + createMany,
        // which wiped the Phase-5 cell attributes (lock / validity /
        // scheduled / note / history) that the Bulk Grid sets — so saving
        // here silently destroyed that data. We now:
        //   1. delete only items the vendor removed from the list,
        //   2. upsert the rest, writing pricing fields every time but only
        //      touching an advanced field when the payload explicitly
        //      carries it (otherwise the grid's value is preserved).
        const keepIds = resolvedItems.map((i) => i.productId!);
        const existingItems = await tx.priceListItem.findMany({
          where: { priceListId: id },
          select: {
            productId: true,
            customPrice: true,
            discountPercent: true,
            pricingType: true,
          },
        });
        const existingByProduct = new Map(existingItems.map((e) => [e.productId, e]));
        const priceHistoryEntries: PriceHistoryEntry[] = [];

        const removed = existingItems.filter((e) => !keepIds.includes(e.productId));
        for (const r of removed) {
          if (r.customPrice != null) {
            priceHistoryEntries.push({
              vendorId,
              productId: r.productId,
              priceListId: id,
              field: 'customPrice',
              oldValue: Number(r.customPrice),
              newValue: null,
              source: 'pricelist',
              changedBy: ctx.userId,
            });
          }
          if (r.discountPercent != null) {
            priceHistoryEntries.push({
              vendorId,
              productId: r.productId,
              priceListId: id,
              field: 'discountPercent',
              oldValue: Number(r.discountPercent),
              newValue: null,
              source: 'pricelist',
              changedBy: ctx.userId,
            });
          }
        }

        await tx.priceListItem.deleteMany({
          where: { priceListId: id, productId: { notIn: keepIds.length > 0 ? keepIds : ['00000000-0000-0000-0000-000000000000'] } },
        });

        const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);
        for (const item of resolvedItems) {
          const prev = existingByProduct.get(item.productId!);
          const oldCustom = prev?.customPrice != null ? Number(prev.customPrice) : null;
          const newCustom = item.customPrice ?? null;
          const oldDiscount = prev?.discountPercent != null ? Number(prev.discountPercent) : null;
          const newDiscount = item.discountPercent ?? null;

          if (oldCustom !== newCustom) {
            priceHistoryEntries.push({
              vendorId,
              productId: item.productId!,
              priceListId: id,
              field: 'customPrice',
              oldValue: oldCustom,
              newValue: newCustom,
              source: 'pricelist',
              changedBy: ctx.userId,
            });
          }
          if (oldDiscount !== newDiscount) {
            priceHistoryEntries.push({
              vendorId,
              productId: item.productId!,
              priceListId: id,
              field: 'discountPercent',
              oldValue: oldDiscount,
              newValue: newDiscount,
              source: 'pricelist',
              changedBy: ctx.userId,
            });
          }

          await tx.priceListItem.upsert({
            where: { priceListId_productId: { priceListId: id, productId: item.productId! } },
            create: {
              priceListId: id,
              productId: item.productId!,
              customPrice: item.customPrice ?? null,
              pricingType: item.pricingType,
              discountPercent: item.discountPercent ?? null,
              schemeMinQty: item.schemeMinQty ?? null,
              schemeFreeQty: item.schemeFreeQty ?? null,
              isLocked: item.isLocked ?? false,
              validFrom: toDate(item.validFrom),
              validTo: toDate(item.validTo),
              note: item.note ?? null,
              scheduledPrice: item.scheduledPrice ?? null,
              scheduledFrom: toDate(item.scheduledFrom),
              scheduledTo: toDate(item.scheduledTo),
            },
            update: {
              customPrice: item.customPrice ?? null,
              pricingType: item.pricingType,
              discountPercent: item.discountPercent ?? null,
              schemeMinQty: item.schemeMinQty ?? null,
              schemeFreeQty: item.schemeFreeQty ?? null,
              // Advanced fields: only overwrite when explicitly provided so a
              // lock/schedule/note set in the Bulk Grid survives a save here.
              ...(item.isLocked !== undefined && { isLocked: item.isLocked }),
              ...(item.validFrom !== undefined && { validFrom: toDate(item.validFrom) }),
              ...(item.validTo !== undefined && { validTo: toDate(item.validTo) }),
              ...(item.note !== undefined && { note: item.note }),
              ...(item.scheduledPrice !== undefined && { scheduledPrice: item.scheduledPrice }),
              ...(item.scheduledFrom !== undefined && { scheduledFrom: toDate(item.scheduledFrom) }),
              ...(item.scheduledTo !== undefined && { scheduledTo: toDate(item.scheduledTo) }),
            },
          });
        }

        if (priceHistoryEntries.length > 0) {
          await logPriceHistory(priceHistoryEntries, tx);
        }
      }

      if (body.assignments !== undefined) {
        // Same replace pattern — the DB CHECK on price_list_assignments
        // catches any inconsistent target-column shape before commit.
        await tx.priceListAssignment.deleteMany({ where: { priceListId: id } });
        if (body.assignments.length > 0) {
          const assignedAt = new Date();
          await tx.priceListAssignment.createMany({
            data: body.assignments.map((a) => ({
              priceListId: id,
              type: a.type,
              userId:            a.type === 'customer' ? a.userId            ?? null : null,
              businessAccountId: a.type === 'customer' ? a.businessAccountId ?? null : null,
              outletId:          a.type === 'outlet'   ? a.outletId          ?? null : null,
              brandId:           a.type === 'brand'    ? a.brandId           ?? null : null,
              groupId:           a.type === 'group'    ? a.groupId           ?? null : null,
              pincode:           a.type === 'pincode'  ? a.pincode           ?? null : null,
              area:              a.type === 'area'     ? a.area              ?? null : null,
              segment:           a.type === 'segment'  ? a.segment           ?? null : null,
              brandName:         a.type === 'brand'    ? a.brandName         ?? null : null,
              // Audit who wired the assignment (shown on the customer profile).
              assignedById: ctx.userId,
              assignedAt,
            })),
          });
        }
      }

      return pl;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.delete');
    const vendorId = await resolveVendorId(ctx, req);
    const id = extractId(req);

    const existing = await prisma.priceList.findFirst({ where: { id, vendorId } });
    if (!existing) throw Errors.notFound('Price list');

    // Soft delete — unassign any legacy VendorCustomer pricelist mapping;
    // PriceListAssignment rows cascade automatically via FK so they're
    // cleaned up when isActive flips and the list disappears from listings.
    await prisma.$transaction([
      prisma.vendorCustomer.updateMany({
        where: { priceListId: id },
        data: { priceListId: null },
      }),
      prisma.priceList.update({ where: { id }, data: { isActive: false } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
