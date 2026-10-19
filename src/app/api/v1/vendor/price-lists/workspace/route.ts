// GET   /api/v1/vendor/price-lists/workspace — matrix + baseVersion
// PATCH /api/v1/vendor/price-lists/workspace — publish draft (version check + guardrails)

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId, resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import {
  getLatestPublishId,
  publishWorkspace,
} from '@/modules/pricing/pricelist-workspace.service';

const NOT_TOMBSTONED = { slug: { not: { startsWith: '_deleted_' } } } as const;

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'priceLists.view');
    const vendorId = await resolveVendorId(ctx, req);
    const params = req.nextUrl.searchParams;
    const search = params.get('search')?.trim() || undefined;
    const categoryId = params.get('categoryId') || undefined;
    const brandId = params.get('brandId') || undefined;
    const collectionId = params.get('collectionId') || undefined;
    const listId = params.get('listId') || undefined;
    const cursor = params.get('cursor') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 50, 200);

    const [priceLists, baseVersion] = await Promise.all([
      prisma.priceList.findMany({
        where: {
          vendorId,
          isActive: true,
          ...(listId ? { id: listId } : {}),
        },
        select: {
          id: true,
          name: true,
          discountPercent: true,
          floorPercentOfBase: true,
          assignments: { select: { type: true } },
          _count: {
            select: {
              items: true,
              assignments: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      getLatestPublishId(vendorId),
    ]);

    // Per-list cell counts (priced / excluded / locked / scheduled)
    const listIds = priceLists.map((l) => l.id);
    const itemAgg = listIds.length
      ? await prisma.priceListItem.groupBy({
          by: ['priceListId', 'isExcluded', 'isLocked'],
          where: { priceListId: { in: listIds } },
          _count: { _all: true },
        })
      : [];
    const scheduledCounts = listIds.length
      ? await prisma.priceListItem.groupBy({
          by: ['priceListId'],
          where: {
            priceListId: { in: listIds },
            scheduledPrice: { not: null },
            scheduledFrom: { not: null },
          },
          _count: { _all: true },
        })
      : [];

    const countsByList = new Map<string, { priced: number; excluded: number; locked: number; scheduled: number }>();
    for (const id of listIds) {
      countsByList.set(id, { priced: 0, excluded: 0, locked: 0, scheduled: 0 });
    }
    for (const row of itemAgg) {
      const c = countsByList.get(row.priceListId)!;
      if (row.isExcluded) c.excluded += row._count._all;
      else c.priced += row._count._all;
      if (row.isLocked) c.locked += row._count._all;
    }
    for (const row of scheduledCounts) {
      const c = countsByList.get(row.priceListId);
      if (c) c.scheduled = row._count._all;
    }

    const where: Prisma.ProductWhereInput = {
      vendorId,
      isActive: true,
      approvalStatus: 'approved',
      listingStatus: 'submitted',
      ...NOT_TOMBSTONED,
      ...(categoryId ? { categoryId } : {}),
      ...(brandId
        ? { brandMappings: { some: { brandId, status: { in: ['verified', 'auto_mapped'] } } } }
        : {}),
      ...(collectionId
        ? { collectionProducts: { some: { collectionId } } }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { sku: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const products = await prisma.product.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, sku: true, unit: true, packSize: true,
        basePrice: true, taxPercent: true, originalPrice: true,
        priceListItems: {
          where: {
            priceList: {
              vendorId,
              isActive: true,
              ...(listId ? { id: listId } : {}),
            },
          },
          select: {
            priceListId: true,
            customPrice: true,
            pricingType: true,
            discountPercent: true,
            isLocked: true,
            isExcluded: true,
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
      isExcluded: boolean;
      pricingType: string | null;
      discountPercent: number | null;
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
        if (!it.isExcluded) {
          if (it.customPrice != null) price = Number(it.customPrice);
          else if (it.discountPercent != null) {
            price = Math.round(Number(p.basePrice) * (1 - Number(it.discountPercent) / 100) * 100) / 100;
          }
        }
        cells[it.priceListId] = {
          price,
          isLocked: it.isLocked,
          isExcluded: it.isExcluded,
          pricingType: it.pricingType,
          discountPercent: it.discountPercent != null ? Number(it.discountPercent) : null,
          validFrom: it.validFrom ? it.validFrom.toISOString() : null,
          validTo: it.validTo ? it.validTo.toISOString() : null,
          note: it.note,
          scheduledPrice: it.scheduledPrice != null ? Number(it.scheduledPrice) : null,
          scheduledFrom: it.scheduledFrom ? it.scheduledFrom.toISOString() : null,
          scheduledTo: it.scheduledTo ? it.scheduledTo.toISOString() : null,
          history: Array.isArray(it.history) ? it.history : [],
        };
      }
      for (const pl of priceLists) {
        if (!cells[pl.id]) cells[pl.id] = null;
      }
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        packSize: p.packSize,
        basePrice: Number(p.basePrice),
        taxPercent: Number(p.taxPercent),
        mrp: p.originalPrice != null ? Number(p.originalPrice) : null,
        cells,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        baseVersion,
        priceLists: priceLists.map((l) => ({
          id: l.id,
          name: l.name,
          discountPercent: Number(l.discountPercent),
          floorPercentOfBase: l.floorPercentOfBase != null ? Number(l.floorPercentOfBase) : null,
          counts: countsByList.get(l.id) ?? { priced: 0, excluded: 0, locked: 0, scheduled: 0 },
          assignmentSummary: l.assignments.reduce<Record<string, number>>((acc, a) => {
            acc[a.type] = (acc[a.type] ?? 0) + 1;
            return acc;
          }, {}),
          assignmentCount: l._count.assignments,
        })),
        products: rows,
        pagination: { nextCursor: hasMore ? rows[rows.length - 1]?.id : null, hasMore },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const patchSchema = z.object({
  baseVersion: z.string().uuid().nullable(),
  acknowledgeWarnings: z.boolean().optional(),
  cells: z.array(z.object({
    priceListId: z.string().uuid(),
    productId: z.string().uuid(),
    customPrice: z.number().nonnegative().nullable().optional(),
    isExcluded: z.boolean().optional(),
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
    const body = patchSchema.parse(await req.json());

    const result = await publishWorkspace({
      vendorId,
      actorId: ctx.userId,
      baseVersion: body.baseVersion,
      cells: body.cells,
      acknowledgeWarnings: body.acknowledgeWarnings,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
