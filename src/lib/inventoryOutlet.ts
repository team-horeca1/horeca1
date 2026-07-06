/**
 * Helpers for per-outlet inventory rows (multi-warehouse).
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export async function getPrimaryOutletIdForVendor(vendorId: string): Promise<string> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { businessAccountId: true },
  });
  if (!vendor) throw new Error('Vendor not found');
  const ba = await prisma.businessAccount.findUnique({
    where: { id: vendor.businessAccountId },
    select: { primaryOutletId: true },
  });
  if (ba?.primaryOutletId) return ba.primaryOutletId;
  const first = await prisma.outlet.findFirst({
    where: { businessAccountId: vendor.businessAccountId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!first) throw new Error('Vendor has no outlet');
  return first.id;
}

export async function getVendorOutletIds(
  businessAccountId: string,
  db: Db = prisma,
): Promise<string[]> {
  const rows = await db.outlet.findMany({
    where: { businessAccountId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Ensure an inventory row exists for product at each active outlet (qty 0 if new). */
export async function ensureInventoryForAllOutlets(
  productId: string,
  vendorId: string,
  businessAccountId: string,
  opts?: { initialQty?: number; lowStockThreshold?: number },
  db: Db = prisma,
): Promise<void> {
  const outletIds = await getVendorOutletIds(businessAccountId, db);
  for (const outletId of outletIds) {
    await db.inventory.upsert({
      where: { productId_outletId: { productId, outletId } },
      create: {
        productId,
        vendorId,
        outletId,
        qtyAvailable: opts?.initialQty ?? 0,
        lowStockThreshold: opts?.lowStockThreshold ?? 10,
      },
      update: {},
    });
  }
}

/** When multi-warehouse is enabled, clone zero-qty rows for outlets missing inventory. */
export async function seedInventoryRowsForMultiWarehouse(
  vendorId: string,
  businessAccountId: string,
): Promise<{ created: number }> {
  const outletIds = await getVendorOutletIds(businessAccountId);
  const products = await prisma.product.findMany({
    where: { vendorId },
    select: { id: true },
  });

  let created = 0;
  await prisma.$transaction(async (tx) => {
    for (const product of products) {
      for (const outletId of outletIds) {
        const existing = await tx.inventory.findUnique({
          where: { productId_outletId: { productId: product.id, outletId } },
        });
        if (!existing) {
          await tx.inventory.create({
            data: {
              productId: product.id,
              vendorId,
              outletId,
              qtyAvailable: 0,
              lowStockThreshold: 10,
            },
          });
          created++;
        }
      }
    }
  });
  return { created };
}

/**
 * Ensure every catalog product has an inventory row at this warehouse (qty 0 if new).
 * Called when a warehouse is added or when loading inventory for a warehouse.
 */
export async function ensureInventoryRowsForOutlet(
  vendorId: string,
  outletId: string,
  db: Db = prisma,
): Promise<number> {
  const products = await db.product.findMany({
    where: { vendorId },
    select: { id: true },
  });

  let created = 0;
  for (const product of products) {
    const existing = await db.inventory.findUnique({
      where: { productId_outletId: { productId: product.id, outletId } },
    });
    if (!existing) {
      await db.inventory.create({
        data: {
          productId: product.id,
          vendorId,
          outletId,
          qtyAvailable: 0,
          lowStockThreshold: 10,
        },
      });
      created++;
    }
  }
  return created;
}
