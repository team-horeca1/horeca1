// POST /api/v1/vendor/products/bulk-import — Import products from a validated CSV payload
// WHY: Vendors migrating from another system or managing 200+ SKUs via spreadsheet need
//      a way to upsert products in bulk without using the UI form one at a time.
//
// Upsert logic: if a product with the same SKU already exists for this vendor, update its
// basePrice, packSize, unit, and active status. Otherwise create a new product.
//
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { resolveVendorOutletContext } from '@/lib/resolveVendorOutletContext';
import { requirePermission } from '@/lib/permissions/engine';

const rowSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(100).optional().nullable(),
  basePrice: z.number().positive(),
  packSize: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  hsn: z.string().optional().nullable(),
  taxPercent: z.number().min(0).max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  stock: z.number().int().min(0).optional().nullable(),
  moq: z.number().int().positive().optional().nullable(),
});

const importSchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
  defaultCategoryId: z.string().uuid().optional(),
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    const outletCtx = await resolveVendorOutletContext(ctx, req);
    requirePermission(ctx, 'products.edit');

    const { rows, defaultCategoryId } = importSchema.parse(await req.json());

    // Clean up rows and auto-generate SKUs if missing
    const processedRows = rows.map((r, i) => {
      const sku = r.sku?.trim() || `SKU-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1000)}`;
      return { ...r, sku };
    });

    // Fetch all existing vendor products by SKU for upsert lookup
    const existingBySku = new Map(
      (await prisma.product.findMany({
        where: { vendorId, sku: { in: processedRows.map(r => r.sku) } },
        select: { id: true, sku: true },
      })).map(p => [p.sku!, p.id]),
    );

    // Fetch all active categories to match category name/slug to ID
    const categories = await prisma.category.findMany({
      where: { isActive: true, approvalStatus: 'approved' },
      select: { id: true, name: true, slug: true },
    });

    const catMap = new Map<string, string>();
    for (const cat of categories) {
      catMap.set(cat.name.toLowerCase().trim(), cat.id);
      catMap.set(cat.slug.toLowerCase().trim(), cat.id);
    }

    const { created, updated } = await prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (const row of processedRows) {
        const existingId = existingBySku.get(row.sku);
        const resolvedCategoryId = row.category 
          ? (catMap.get(row.category.toLowerCase().trim()) ?? defaultCategoryId ?? null) 
          : (defaultCategoryId ?? null);

        if (existingId) {
          // Update product fields
          await tx.product.update({
            where: { id: existingId },
            data: {
              name: row.name,
              basePrice: row.basePrice,
              packSize: row.packSize || undefined,
              unit: row.unit || undefined,
              hsn: row.hsn || undefined,
              taxPercent: row.taxPercent !== null && row.taxPercent !== undefined ? row.taxPercent : undefined,
              description: row.description || undefined,
              brand: row.brand || undefined,
              minOrderQty: row.moq || undefined,
              categoryId: resolvedCategoryId || undefined,
            },
          });

          // Update stock if specified
          if (row.stock !== null && row.stock !== undefined) {
            await tx.inventory.update({
              where: { productId_outletId: { productId: existingId, outletId: outletCtx.outletId } },
              data: { qtyAvailable: row.stock },
            });
          }

          // Link category in the join table
          if (resolvedCategoryId) {
            await tx.productCategory.upsert({
              where: { productId_categoryId: { productId: existingId, categoryId: resolvedCategoryId } },
              create: { productId: existingId, categoryId: resolvedCategoryId, isPrimary: true },
              update: { isPrimary: true },
            });
          }

          updatedCount++;
        } else {
          // Create product
          const slug = `${row.sku.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
          const product = await tx.product.create({
            data: {
              name: row.name,
              slug,
              sku: row.sku,
              vendorId,
              basePrice: row.basePrice,
              packSize: row.packSize || null,
              unit: row.unit || null,
              hsn: row.hsn || null,
              taxPercent: row.taxPercent ?? 0,
              description: row.description || null,
              brand: row.brand || null,
              minOrderQty: row.moq ?? 1,
              categoryId: resolvedCategoryId,
              approvalStatus: 'pending',
            },
          });

          // Initialize inventory row
          await tx.inventory.create({
            data: {
              vendorId,
              productId: product.id,
              outletId: outletCtx.outletId,
              qtyAvailable: row.stock ?? 0,
              qtyReserved: 0,
              lowStockThreshold: 10,
            },
          });

          // Link category in the join table
          if (resolvedCategoryId) {
            await tx.productCategory.create({
              data: {
                productId: product.id,
                categoryId: resolvedCategoryId,
                isPrimary: true,
              },
            });
          }

          createdCount++;
        }
      }

      return { created: createdCount, updated: updatedCount };
    });

    return NextResponse.json({ success: true, created, updated, total: rows.length });
  } catch (error) {
    return errorResponse(error);
  }
});
