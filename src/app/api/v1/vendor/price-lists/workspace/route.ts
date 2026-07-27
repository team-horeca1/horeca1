// GET   /api/v1/vendor/price-lists/workspace — matrix of products × price lists
// PATCH /api/v1/vendor/price-lists/workspace — upsert/clear price cells
//
// Powers the Smart Pricelist Workspace (Google-Sheets-style grid). Rows are the
// vendor's products, columns are their price lists. A cell holds the explicit
// PriceListItem.customPrice for that (product, list); empty = falls back to the
// list's global discount or the product base price (resolved on the client for
// display, never persisted). Column formulas are computed client-side and sent
// here as final per-cell prices — the brief stores final prices, not formulas.

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId, resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { logPriceHistory, type PriceHistoryEntry } from '@/lib/priceHistory';

const NOT_TOMBSTONED = { slug: { not: { startsWith: '_deleted_' } } } as const;

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const vendorId = await resolveVendorId(ctx, req);
    const params = req.nextUrl.searchParams;
    const search = params.get('search')?.trim() || undefined;
    const categoryId = params.get('categoryId') || undefined;
    const brandId = params.get('brandId') || undefined;
    const collectionId = params.get('collectionId') || undefined;
    const cursor = params.get('cursor') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 50, 200);

    const priceLists = await prisma.priceList.findMany({
      where: { vendorId, isActive: true },
      select: { id: true, name: true, discountPercent: true },
      orderBy: { createdAt: 'asc' },
    });

    const where: Prisma.ProductWhereInput = {
      vendorId,
      isActive: true,
      ...NOT_TOMBSTONED,
      ...(categoryId ? { categoryId } : {}),
      // Brand filter: product is mapped to this brand via a verified or
      // auto-mapped BrandProductMapping row.
      ...(brandId
        ? { brandMappings: { some: { brandId, status: { in: ['verified', 'auto_mapped'] } } } }
        : {}),
      // Collection filter: product belongs to this collection via the
      // CollectionProduct join.
      ...(collectionId
        ? { collectionProducts: { some: { collectionId } } }
        : {}),
      ...(search
        ? { OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
          ] }
        : {}),
    };

    const products = await prisma.product.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, sku: true, unit: true, packSize: true,
        basePrice: true, taxPercent: true,
        priceListItems: {
          where: { priceList: { vendorId, isActive: true } },
          select: {
            priceListId: true,
            customPrice: true,
            pricingType: true,
            discountPercent: true,
            isLocked: true,
            validFrom: true,
            validTo: true,
            note: true,
            scheduledPrice: true,
            scheduledFrom: true,
            scheduledTo: true,
            history: true,
          },
        },
      },
    });

    const hasMore = products.length > limit;
    if (hasMore) products.pop();

    type CellData = {
      price: number | null;
      isLocked: boolean;
      validFrom: string | null;
      validTo: string | null;
      note: string | null;
      scheduledPrice: number | null;
      scheduledFrom: string | null;
      scheduledTo: string | null;
      history: unknown[];
    };

    const rows = products.map((p) => {
      const cells: Record<string, CellData | null> = {};
      for (const it of p.priceListItems) {
        let price: number | null = null;
        if (it.customPrice != null) {
          price = Number(it.customPrice);
        } else if (it.discountPercent != null) {
          price = Math.round(Number(p.basePrice) * (1 - Number(it.discountPercent) / 100) * 100) / 100;
        }

        cells[it.priceListId] = {
          price,
          isLocked: it.isLocked,
          validFrom: it.validFrom ? it.validFrom.toISOString() : null,
          validTo: it.validTo ? it.validTo.toISOString() : null,
          note: it.note,
          scheduledPrice: it.scheduledPrice != null ? Number(it.scheduledPrice) : null,
          scheduledFrom: it.scheduledFrom ? it.scheduledFrom.toISOString() : null,
          scheduledTo: it.scheduledTo ? it.scheduledTo.toISOString() : null,
          history: Array.isArray(it.history) ? it.history : [],
        };
      }

      // Populate empty fallback cells for missing price lists
      for (const pl of priceLists) {
        if (!cells[pl.id]) {
          cells[pl.id] = null;
        }
      }

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        packSize: p.packSize,
        basePrice: Number(p.basePrice),
        taxPercent: Number(p.taxPercent),
        cells,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        priceLists: priceLists.map((l) => ({ id: l.id, name: l.name, discountPercent: Number(l.discountPercent) })),
        products: rows,
        pagination: { nextCursor: hasMore ? rows[rows.length - 1]?.id : null, hasMore },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const patchSchema = z.object({
  cells: z.array(z.object({
    priceListId: z.string().uuid(),
    productId: z.string().uuid(),
    customPrice: z.number().nonnegative().nullable().optional(),
    isLocked: z.boolean().optional(),
    validFrom: z.string().nullable().optional(),
    validTo: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    scheduledPrice: z.number().nonnegative().nullable().optional(),
    scheduledFrom: z.string().nullable().optional(),
    scheduledTo: z.string().nullable().optional(),
  })).min(1).max(2000),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'priceLists.edit');
    const { cells } = patchSchema.parse(await req.json());

    // Authorize every referenced list + product against this vendor in two
    // bulk queries so a forged id can't touch another vendor's data.
    const listIds = [...new Set(cells.map((c) => c.priceListId))];
    const productIds = [...new Set(cells.map((c) => c.productId))];
    const [validLists, validProducts] = await Promise.all([
      prisma.priceList.findMany({ where: { id: { in: listIds }, vendorId }, select: { id: true } }),
      prisma.product.findMany({ where: { id: { in: productIds }, vendorId }, select: { id: true } }),
    ]);
    const okList = new Set(validLists.map((l) => l.id));
    const okProduct = new Set(validProducts.map((p) => p.id));

    // Fetch existing items to compare values for recording price changes history
    const existingItems = await prisma.priceListItem.findMany({
      where: {
        priceListId: { in: listIds },
        productId: { in: productIds },
      },
      select: {
        priceListId: true,
        productId: true,
        customPrice: true,
        history: true,
      },
    });

    let upserted = 0, cleared = 0, skipped = 0;
    const priceHistoryEntries: PriceHistoryEntry[] = [];
    await prisma.$transaction(async (tx) => {
      for (const c of cells) {
        if (!okList.has(c.priceListId) || !okProduct.has(c.productId)) { skipped++; continue; }

        // If everything is blank / reset, delete the row.
        const shouldDelete = c.customPrice === null &&
                             !c.isLocked &&
                             !c.validFrom && !c.validTo &&
                             !c.note &&
                             c.scheduledPrice === null;

        if (shouldDelete) {
          const existing = existingItems.find(item => item.priceListId === c.priceListId && item.productId === c.productId);
          const oldPrice = existing?.customPrice != null ? Number(existing.customPrice) : null;
          if (oldPrice !== null) {
            priceHistoryEntries.push({
              vendorId,
              productId: c.productId,
              priceListId: c.priceListId,
              field: 'customPrice',
              oldValue: oldPrice,
              newValue: null,
              source: 'pricelist',
              changedBy: ctx.userId,
            });
          }
          const res = await tx.priceListItem.deleteMany({ where: { priceListId: c.priceListId, productId: c.productId } });
          cleared += res.count;
        } else {
          const existing = existingItems.find(item => item.priceListId === c.priceListId && item.productId === c.productId);
          let history = existing?.history && Array.isArray(existing.history) ? [...existing.history] : [];
          
          const oldPrice = existing?.customPrice != null ? Number(existing.customPrice) : null;
          const newPrice = c.customPrice !== undefined ? c.customPrice : oldPrice;

          if (oldPrice !== newPrice) {
            history.unshift({
              date: new Date().toISOString(),
              action: oldPrice === null ? 'Price created' : 'Price updated',
              oldPrice,
              newPrice,
              user: 'Vendor (Self)',
            });
            priceHistoryEntries.push({
              vendorId,
              productId: c.productId,
              priceListId: c.priceListId,
              field: 'customPrice',
              oldValue: oldPrice,
              newValue: newPrice,
              source: 'pricelist',
              changedBy: ctx.userId,
            });
          }

          if (history.length > 50) {
            history = history.slice(0, 50);
          }

          const parsedValidFrom = c.validFrom ? new Date(c.validFrom) : null;
          const parsedValidTo = c.validTo ? new Date(c.validTo) : null;
          const parsedScheduledFrom = c.scheduledFrom ? new Date(c.scheduledFrom) : null;
          const parsedScheduledTo = c.scheduledTo ? new Date(c.scheduledTo) : null;

          await tx.priceListItem.upsert({
            where: { priceListId_productId: { priceListId: c.priceListId, productId: c.productId } },
            create: {
              priceListId: c.priceListId,
              productId: c.productId,
              customPrice: c.customPrice ?? null,
              pricingType: 'fixed',
              isLocked: c.isLocked ?? false,
              validFrom: parsedValidFrom,
              validTo: parsedValidTo,
              note: c.note ?? null,
              scheduledPrice: c.scheduledPrice ?? null,
              scheduledFrom: parsedScheduledFrom,
              scheduledTo: parsedScheduledTo,
              history: history,
            },
            update: {
              ...(c.customPrice !== undefined && { customPrice: c.customPrice }),
              pricingType: 'fixed',
              ...(c.isLocked !== undefined && { isLocked: c.isLocked }),
              ...(c.validFrom !== undefined && { validFrom: parsedValidFrom }),
              ...(c.validTo !== undefined && { validTo: parsedValidTo }),
              ...(c.note !== undefined && { note: c.note }),
              ...(c.scheduledPrice !== undefined && { scheduledPrice: c.scheduledPrice }),
              ...(c.scheduledFrom !== undefined && { scheduledFrom: parsedScheduledFrom }),
              ...(c.scheduledTo !== undefined && { scheduledTo: parsedScheduledTo }),
              history: history,
            },
          });
          upserted++;
        }
      }

      if (priceHistoryEntries.length > 0) {
        await logPriceHistory(priceHistoryEntries, tx);
      }
    });

    return NextResponse.json({ success: true, data: { upserted, cleared, skipped } });
  } catch (error) {
    return errorResponse(error);
  }
});

