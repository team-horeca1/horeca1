import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/events/emitter';
import { Errors } from '@/middleware/errorHandler';
import type { PrismaClient } from '@prisma/client';

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

async function logInventoryChange(
  inventoryId: string,
  vendorId: string,
  field: string,
  oldValue: number,
  newValue: number,
  reason?: string,
  changedBy?: string,
  tx?: TxClient,
) {
  const db = tx ?? prisma;
  await db.inventoryLog.create({
    data: { inventoryId, vendorId, field, oldValue, newValue, reason, changedBy },
  });
}

export class InventoryService {
  async getStock(productId: string) {
    const inv = await prisma.inventory.findUnique({ where: { productId } });
    if (!inv) throw Errors.notFound('Inventory');
    return inv;
  }

  async updateStock(
    productId: string,
    vendorId: string,
    data: {
      qtyAvailable?: number;
      qtyInTransit?: number;
      qtyDamaged?: number;
      qtyReturned?: number;
      lowStockThreshold?: number;
    },
    changedBy?: string,
  ) {
    const before = await prisma.inventory.findUnique({ where: { productId } });
    if (!before || before.vendorId !== vendorId) throw Errors.notFound('Inventory');

    const inv = await prisma.inventory.update({
      where: { productId },
      data,
    });

    for (const [field, val] of Object.entries(data)) {
      if (val === undefined) continue;
      const oldVal = Number((before as Record<string, unknown>)[field] ?? 0);
      if (oldVal !== val) {
        await logInventoryChange(inv.id, vendorId, field, oldVal, val, 'manual_update', changedBy);
      }
    }

    if (data.qtyAvailable !== undefined) {
      const available = data.qtyAvailable - inv.qtyReserved;
      if (available <= inv.lowStockThreshold) {
        emitEvent('StockUpdated', {
          productId,
          vendorId,
          qtyAvailable: data.qtyAvailable,
          lowStockThreshold: inv.lowStockThreshold,
        });
      }
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { autoDisableOos: true },
      });
      if (vendor?.autoDisableOos && available <= 0) {
        await prisma.product.update({ where: { id: productId }, data: { isActive: false } });
      }
    }

    return inv;
  }

  async bulkCheck(items: Array<{ productId: string; quantity: number }>, tx?: TxClient) {
    const db = tx || prisma;
    const ids = items.map(i => i.productId);
    // Single round-trip instead of N parallel findUnique calls (which all
    // hit the same Postgres connection pool and bottleneck on big carts)
    const [inventories, products] = await Promise.all([
      db.inventory.findMany({
        where: { productId: { in: ids } },
        select: { productId: true, qtyAvailable: true, qtyReserved: true },
      }),
      db.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
    ]);
    const invByProductId = new Map(inventories.map(inv => [inv.productId, inv]));
    const nameByProductId = new Map(products.map(p => [p.id, p.name]));
    return items.map(item => {
      const inv = invByProductId.get(item.productId);
      const available = inv ? inv.qtyAvailable - inv.qtyReserved : 0;
      return {
        productId: item.productId,
        productName: nameByProductId.get(item.productId) ?? 'Item',
        available: available >= item.quantity,
        qtyAvailable: available,
      };
    });
  }

  async reserveStock(items: Array<{ productId: string; quantity: number }>, tx?: TxClient) {
    const db = tx || prisma;
    for (const item of items) {
      await db.inventory.update({
        where: { productId: item.productId },
        data: { qtyReserved: { increment: item.quantity } },
      });
    }
  }

  async releaseStock(items: Array<{ productId: string; quantity: number }>, tx?: TxClient) {
    const db = tx || prisma;
    for (const item of items) {
      await db.inventory.update({
        where: { productId: item.productId },
        data: { qtyReserved: { decrement: item.quantity } },
      });
    }
  }

  // Called when an order is delivered: deduct the goods that left the warehouse
  // from both the available pool and the reserved pool.
  async finalizeStock(items: Array<{ productId: string; quantity: number }>, tx?: TxClient) {
    const db = tx || prisma;
    for (const item of items) {
      await db.inventory.update({
        where: { productId: item.productId },
        data: {
          qtyAvailable: { decrement: item.quantity },
          qtyReserved: { decrement: item.quantity },
        },
      });
    }
  }

  // Bulk stock update — set absolute qtyAvailable per product.
  // Validates each productId belongs to vendorId before writing.
  async bulkUpdateStock(
    vendorId: string,
    items: Array<{ productId: string; qtyAvailable: number }>,
  ) {
    const ids = items.map(i => i.productId);
    const owned = await prisma.inventory.findMany({
      where: { productId: { in: ids }, vendorId },
      select: { productId: true },
    });
    const ownedSet = new Set(owned.map(r => r.productId));
    const invalid = ids.filter(id => !ownedSet.has(id));
    if (invalid.length > 0) {
      throw new Error(`Products not owned by this vendor: ${invalid.join(', ')}`);
    }

    return prisma.$transaction(
      items.map(item =>
        prisma.inventory.update({
          where: { productId: item.productId },
          data: { qtyAvailable: item.qtyAvailable },
        }),
      ),
    );
  }

  // Bulk stock adjust for the Bulk Update Engine. Supports set / increase /
  // decrease against a list of products, plus an optional low-stock threshold.
  // Upserts the inventory row when a product doesn't have one yet (decrease
  // clamps at 0). Pass scopeVendorId for the vendor portal (enforces ownership);
  // omit it for admin (each row uses the product's own vendorId).
  async bulkAdjustStock(opts: {
    productIds: string[];
    mode?: 'set' | 'increase' | 'decrease';
    value?: number;
    lowStockThreshold?: number;
    scopeVendorId?: string | null;
  }): Promise<{ updated: number; skipped: number }> {
    const { productIds, mode, value, lowStockThreshold, scopeVendorId } = opts;

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, ...(scopeVendorId ? { vendorId: scopeVendorId } : {}) },
      select: { id: true, vendorId: true },
    });
    const productMap = new Map(products.map(p => [p.id, p.vendorId]));
    const missing = productIds.filter(id => !productMap.has(id));
    if (missing.length > 0) {
      throw new Error(`Products not found${scopeVendorId ? ' for this vendor' : ''}: ${missing.join(', ')}`);
    }

    // Current quantities so increase/decrease can be computed (and clamped).
    const existing = await prisma.inventory.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, qtyAvailable: true },
    });
    const qtyMap = new Map(existing.map(r => [r.productId, r.qtyAvailable]));

    const ops = [];
    let skipped = 0;
    for (const pid of productIds) {
      const vendorId = productMap.get(pid);
      // Catalog-level products (no vendor) can't track stock — skip them.
      if (!vendorId) { skipped++; continue; }

      const current = qtyMap.get(pid) ?? 0;
      let nextQty: number | undefined;
      if (value !== undefined && mode) {
        if (mode === 'set') nextQty = Math.max(0, value);
        else if (mode === 'increase') nextQty = current + value;
        else nextQty = Math.max(0, current - value); // decrease, clamped
      }

      const update: { qtyAvailable?: number; lowStockThreshold?: number } = {};
      if (nextQty !== undefined) update.qtyAvailable = nextQty;
      if (lowStockThreshold !== undefined) update.lowStockThreshold = lowStockThreshold;
      if (Object.keys(update).length === 0) { skipped++; continue; }

      ops.push(
        prisma.inventory.upsert({
          where: { productId: pid },
          create: {
            productId: pid,
            vendorId,
            qtyAvailable: nextQty ?? 0,
            lowStockThreshold: lowStockThreshold ?? 10,
          },
          update,
        }),
      );
    }

    await prisma.$transaction(ops);
    return { updated: ops.length, skipped };
  }
}
