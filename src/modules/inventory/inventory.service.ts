import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/events/emitter';
import { Errors } from '@/middleware/errorHandler';
import { ensureInventoryRowsForOutlet } from '@/lib/inventoryOutlet';
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

function invKey(productId: string, outletId: string) {
  return { productId_outletId: { productId, outletId } };
}

export class InventoryService {
  async getStock(productId: string, outletId?: string) {
    if (outletId) {
      const inv = await prisma.inventory.findUnique({
        where: invKey(productId, outletId),
      });
      if (!inv) throw Errors.notFound('Inventory');
      return inv;
    }
    const rows = await prisma.inventory.findMany({ where: { productId } });
    const agg = rows.reduce(
      (acc, r) => ({
        qtyAvailable: acc.qtyAvailable + r.qtyAvailable,
        qtyReserved: acc.qtyReserved + r.qtyReserved,
        qtyInTransit: acc.qtyInTransit + r.qtyInTransit,
        qtyDamaged: acc.qtyDamaged + r.qtyDamaged,
        qtyReturned: acc.qtyReturned + r.qtyReturned,
        lowStockThreshold: Math.min(acc.lowStockThreshold, r.lowStockThreshold),
      }),
      { qtyAvailable: 0, qtyReserved: 0, qtyInTransit: 0, qtyDamaged: 0, qtyReturned: 0, lowStockThreshold: 10 },
    );
    if (rows.length === 0) throw Errors.notFound('Inventory');
    return { productId, ...agg, id: rows[0].id, vendorId: rows[0].vendorId, outletId: rows[0].outletId };
  }

  async updateStock(
    productId: string,
    vendorId: string,
    outletId: string,
    data: {
      qtyAvailable?: number;
      qtyInTransit?: number;
      qtyDamaged?: number;
      qtyReturned?: number;
      lowStockThreshold?: number;
    },
    changedBy?: string,
  ) {
    const before = await prisma.inventory.findUnique({
      where: invKey(productId, outletId),
    });
    if (!before || before.vendorId !== vendorId) throw Errors.notFound('Inventory');

    const inv = await prisma.inventory.update({
      where: invKey(productId, outletId),
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
        const total = await prisma.inventory.aggregate({
          where: { productId },
          _sum: { qtyAvailable: true, qtyReserved: true },
        });
        const totalAvail = (total._sum.qtyAvailable ?? 0) - (total._sum.qtyReserved ?? 0);
        if (totalAvail <= 0) {
          await prisma.product.update({ where: { id: productId }, data: { isActive: false } });
        }
      }
    }

    return inv;
  }

  async bulkCheck(
    items: Array<{ productId: string; quantity: number }>,
    outletId: string,
    tx?: TxClient,
  ) {
    const db = tx || prisma;
    const ids = items.map((i) => i.productId);
    const [inventories, products] = await Promise.all([
      db.inventory.findMany({
        where: { productId: { in: ids }, outletId },
        select: { productId: true, qtyAvailable: true, qtyReserved: true },
      }),
      db.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
    ]);
    const invByProductId = new Map(inventories.map((inv) => [inv.productId, inv]));
    const nameByProductId = new Map(products.map((p) => [p.id, p.name]));
    return items.map((item) => {
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

  async reserveStock(
    items: Array<{ productId: string; quantity: number }>,
    outletId: string,
    tx?: TxClient,
  ) {
    const db = tx || prisma;
    for (const item of items) {
      // Atomic guard: only reserve when net available covers the qty.
      // Prevents oversell under concurrent checkouts (check-then-increment race).
      const updated = await db.$executeRaw`
        UPDATE inventory
        SET qty_reserved = qty_reserved + ${item.quantity},
            updated_at = NOW()
        WHERE product_id = ${item.productId}::uuid
          AND outlet_id = ${outletId}::uuid
          AND qty_available - qty_reserved >= ${item.quantity}
      `;
      if (Number(updated) === 0) {
        const inv = await db.inventory.findUnique({
          where: invKey(item.productId, outletId),
          select: {
            qtyAvailable: true,
            qtyReserved: true,
            product: { select: { name: true } },
          },
        });
        const available = inv ? Math.max(0, inv.qtyAvailable - inv.qtyReserved) : 0;
        const name = (inv as { product?: { name?: string } } | null)?.product?.name ?? 'Item';
        throw Errors.outOfStock(name, available);
      }
    }
  }

  async releaseStock(
    items: Array<{ productId: string; quantity: number }>,
    outletId: string,
    tx?: TxClient,
  ) {
    const db = tx || prisma;
    for (const item of items) {
      // Never drive qtyReserved below zero (double-cancel / over-release).
      await db.$executeRaw`
        UPDATE inventory
        SET qty_reserved = GREATEST(0, qty_reserved - ${item.quantity}),
            updated_at = NOW()
        WHERE product_id = ${item.productId}::uuid
          AND outlet_id = ${outletId}::uuid
      `;
    }
  }

  async finalizeStock(
    items: Array<{ productId: string; quantity: number }>,
    outletId: string,
    tx?: TxClient,
  ) {
    const db = tx || prisma;
    for (const item of items) {
      await db.inventory.update({
        where: invKey(item.productId, outletId),
        data: {
          qtyAvailable: { decrement: item.quantity },
          qtyReserved: { decrement: item.quantity },
        },
      });
    }
  }

  async bulkUpdateStock(
    vendorId: string,
    outletId: string,
    items: Array<{ productId: string; qtyAvailable: number }>,
  ) {
    const ids = items.map((i) => i.productId);
    const owned = await prisma.inventory.findMany({
      where: { productId: { in: ids }, vendorId, outletId },
      select: { productId: true },
    });
    const ownedSet = new Set(owned.map((r) => r.productId));
    const invalid = ids.filter((id) => !ownedSet.has(id));
    if (invalid.length > 0) {
      throw new Error(`Products not owned by this vendor at this outlet: ${invalid.join(', ')}`);
    }

    return prisma.$transaction(
      items.map((item) =>
        prisma.inventory.update({
          where: invKey(item.productId, outletId),
          data: { qtyAvailable: item.qtyAvailable },
        }),
      ),
    );
  }

  async bulkAdjustStock(opts: {
    productIds: string[];
    outletId?: string;
    mode?: 'set' | 'increase' | 'decrease';
    value?: number;
    lowStockThreshold?: number;
    scopeVendorId?: string | null;
  }): Promise<{ updated: number; skipped: number }> {
    const { productIds, outletId, mode, value, lowStockThreshold, scopeVendorId } = opts;

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, ...(scopeVendorId ? { vendorId: scopeVendorId } : {}) },
      select: { id: true, vendorId: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p.vendorId]));
    const missing = productIds.filter((id) => !productMap.has(id));
    if (missing.length > 0) {
      throw new Error(`Products not found${scopeVendorId ? ' for this vendor' : ''}: ${missing.join(', ')}`);
    }

    const existing = await prisma.inventory.findMany({
      where: {
        productId: { in: productIds },
        ...(outletId ? { outletId } : {}),
      },
      select: { productId: true, outletId: true, qtyAvailable: true },
    });
    const rowsByProduct = new Map<string, typeof existing>();
    for (const row of existing) {
      const list = rowsByProduct.get(row.productId) ?? [];
      list.push(row);
      rowsByProduct.set(row.productId, list);
    }

    const ops = [];
    let skipped = 0;
    for (const pid of productIds) {
      const vendorId = productMap.get(pid);
      if (!vendorId) {
        skipped++;
        continue;
      }

      const targetRows = outletId
        ? existing.filter((r) => r.productId === pid && r.outletId === outletId)
        : rowsByProduct.get(pid) ?? [];

      if (targetRows.length === 0 && outletId) {
        skipped++;
        continue;
      }

      for (const row of targetRows.length ? targetRows : [{ productId: pid, outletId: outletId!, qtyAvailable: 0 }]) {
        const oid = row.outletId ?? outletId;
        if (!oid) {
          skipped++;
          continue;
        }
        const current = row.qtyAvailable ?? 0;
        let nextQty: number | undefined;
        if (value !== undefined && mode) {
          if (mode === 'set') nextQty = Math.max(0, value);
          else if (mode === 'increase') nextQty = current + value;
          else nextQty = Math.max(0, current - value);
        }

        const update: { qtyAvailable?: number; lowStockThreshold?: number } = {};
        if (nextQty !== undefined) update.qtyAvailable = nextQty;
        if (lowStockThreshold !== undefined) update.lowStockThreshold = lowStockThreshold;
        if (Object.keys(update).length === 0) {
          skipped++;
          continue;
        }

        ops.push(
          prisma.inventory.upsert({
            where: invKey(pid, oid),
            create: {
              productId: pid,
              vendorId,
              outletId: oid,
              qtyAvailable: nextQty ?? 0,
              lowStockThreshold: lowStockThreshold ?? 10,
            },
            update,
          }),
        );
      }
    }

    await prisma.$transaction(ops);
    return { updated: ops.length, skipped };
  }

  async transferStock(opts: {
    vendorId: string;
    fromOutletId: string;
    toOutletId: string;
    items: Array<{ productId: string; quantity: number }>;
    createdBy?: string;
    notes?: string;
  }) {
    if (opts.fromOutletId === opts.toOutletId) {
      throw Errors.badRequest('Source and destination outlets must differ');
    }

    return prisma.$transaction(async (tx) => {
      for (const item of opts.items) {
        const check = await this.bulkCheck([item], opts.fromOutletId, tx);
        if (!check[0]?.available) {
          throw Errors.outOfStock(check[0]?.productName ?? 'Item', check[0]?.qtyAvailable ?? 0);
        }
      }

      const transfer = await tx.stockTransfer.create({
        data: {
          vendorId: opts.vendorId,
          fromOutletId: opts.fromOutletId,
          toOutletId: opts.toOutletId,
          status: 'completed',
          items: opts.items,
          notes: opts.notes,
          createdBy: opts.createdBy,
          completedAt: new Date(),
        },
      });

      for (const item of opts.items) {
        await tx.inventory.update({
          where: invKey(item.productId, opts.fromOutletId),
          data: { qtyAvailable: { decrement: item.quantity } },
        });
        await tx.inventory.upsert({
          where: invKey(item.productId, opts.toOutletId),
          create: {
            productId: item.productId,
            vendorId: opts.vendorId,
            outletId: opts.toOutletId,
            qtyAvailable: item.quantity,
            lowStockThreshold: 10,
          },
          update: { qtyAvailable: { increment: item.quantity } },
        });
      }

      return transfer;
    });
  }

  async bulkUpdateStockBySku(opts: {
    vendorId: string;
    businessAccountId: string;
    defaultOutletId: string;
    multiWarehouse: boolean;
    items: Array<{
      sku: string;
      qtyAvailable: number;
      lowStockThreshold?: number;
      warehousePincode?: string;
    }>;
  }): Promise<{
    matched: number;
    updated: number;
    skipped: number;
    errors: Array<{ sku: string; error: string }>;
  }> {
    const { vendorId, businessAccountId, defaultOutletId, multiWarehouse, items } = opts;

    const products = await prisma.product.findMany({
      where: { vendorId },
      select: { id: true, sku: true, vendorSku: true },
    });

    const skuToProduct = new Map<string, { id: string }>();
    for (const p of products) {
      if (p.sku) skuToProduct.set(p.sku.toLowerCase(), { id: p.id });
      if (p.vendorSku) skuToProduct.set(p.vendorSku.toLowerCase(), { id: p.id });
    }

    const outlets = await prisma.outlet.findMany({
      where: { businessAccountId, isActive: true },
      select: { id: true, pincode: true },
    });
    const pincodeToOutlet = new Map(
      outlets.filter((o) => o.pincode).map((o) => [o.pincode!.trim(), o.id]),
    );

    const errors: Array<{ sku: string; error: string }> = [];
    const updates: Array<{ productId: string; outletId: string; qtyAvailable: number; lowStockThreshold?: number }> = [];

    for (const item of items) {
      const product = skuToProduct.get(item.sku.toLowerCase());
      if (!product) {
        errors.push({ sku: item.sku, error: 'SKU not found for your catalog' });
        continue;
      }

      let outletId = defaultOutletId;
      if (multiWarehouse && item.warehousePincode?.trim()) {
        const resolved = pincodeToOutlet.get(item.warehousePincode.trim());
        if (!resolved) {
          errors.push({ sku: item.sku, error: `Unknown warehouse pincode: ${item.warehousePincode}` });
          continue;
        }
        outletId = resolved;
      }

      updates.push({
        productId: product.id,
        outletId,
        qtyAvailable: item.qtyAvailable,
        ...(item.lowStockThreshold !== undefined && { lowStockThreshold: item.lowStockThreshold }),
      });
    }

    if (updates.length === 0) {
      return { matched: 0, updated: 0, skipped: items.length, errors };
    }

    const outletIds = [...new Set(updates.map((u) => u.outletId))];
    for (const oid of outletIds) {
      await ensureInventoryRowsForOutlet(vendorId, oid);
    }

    let updated = 0;
    await prisma.$transaction(
      updates.map((u) =>
        prisma.inventory.update({
          where: invKey(u.productId, u.outletId),
          data: {
            qtyAvailable: u.qtyAvailable,
            ...(u.lowStockThreshold !== undefined && { lowStockThreshold: u.lowStockThreshold }),
          },
        }),
      ),
    );
    updated = updates.length;

    return {
      matched: updates.length,
      updated,
      skipped: items.length - updates.length,
      errors,
    };
  }

  async getConsolidated(vendorId: string, accessibleOutletIds: string[]) {
    const where: { vendorId: string; outletId?: { in: string[] } } = { vendorId };
    if (accessibleOutletIds.length > 0) {
      where.outletId = { in: accessibleOutletIds };
    }

    const rows = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: { id: true, name: true, sku: true, unit: true, imageUrl: true, isActive: true },
        },
        outlet: { select: { id: true, name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { outlet: { name: 'asc' } }],
    });

    return rows.map((item) => ({
      ...item,
      isLowStock: item.qtyAvailable - item.qtyReserved <= item.lowStockThreshold,
    }));
  }
}
