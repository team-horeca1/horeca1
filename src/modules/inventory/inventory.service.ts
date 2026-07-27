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
  if (oldValue === newValue) return;
  const db = tx ?? prisma;
  await db.inventoryLog.create({
    data: { inventoryId, vendorId, field, oldValue, newValue, reason, changedBy },
  });
}

function invKey(productId: string, outletId: string) {
  return { productId_outletId: { productId, outletId } };
}

async function maybeEmitLowStock(opts: {
  productId: string;
  vendorId: string;
  qtyAvailable: number;
  qtyReserved: number;
  lowStockThreshold: number;
}) {
  const sellable = opts.qtyAvailable - opts.qtyReserved;
  if (sellable <= opts.lowStockThreshold) {
    emitEvent('StockUpdated', {
      productId: opts.productId,
      vendorId: opts.vendorId,
      qtyAvailable: sellable,
      lowStockThreshold: opts.lowStockThreshold,
    });
  }
}

async function maybeAutoDisableOos(
  productId: string,
  vendorId: string,
  sellable: number,
  tx?: TxClient,
) {
  if (sellable > 0) return;
  const db = tx ?? prisma;
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { autoDisableOos: true },
  });
  if (!vendor?.autoDisableOos) return;
  const total = await db.inventory.aggregate({
    where: { productId },
    _sum: { qtyAvailable: true, qtyReserved: true },
  });
  const totalAvail = (total._sum.qtyAvailable ?? 0) - (total._sum.qtyReserved ?? 0);
  if (totalAvail <= 0) {
    await db.product.update({ where: { id: productId }, data: { isActive: false } });
  }
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

  async getHistory(opts: {
    vendorId: string;
    inventoryId?: string;
    productId?: string;
    outletId?: string;
    limit?: number;
  }) {
    const { vendorId, inventoryId, productId, outletId, limit = 50 } = opts;
    const where: {
      vendorId: string;
      inventoryId?: string;
    } = { vendorId };

    if (inventoryId) {
      where.inventoryId = inventoryId;
    } else if (productId || outletId) {
      const inv = await prisma.inventory.findFirst({
        where: {
          vendorId,
          ...(productId ? { productId } : {}),
          ...(outletId ? { outletId } : {}),
        },
        select: { id: true },
      });
      if (!inv) return [];
      where.inventoryId = inv.id;
    }

    return prisma.inventoryLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
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
    reason = 'manual_update',
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
        await logInventoryChange(inv.id, vendorId, field, oldVal, val, reason, changedBy);
      }
    }

    if (data.qtyAvailable !== undefined) {
      const sellable = data.qtyAvailable - inv.qtyReserved;
      await maybeEmitLowStock({
        productId,
        vendorId,
        qtyAvailable: data.qtyAvailable,
        qtyReserved: inv.qtyReserved,
        lowStockThreshold: inv.lowStockThreshold,
      });
      await maybeAutoDisableOos(productId, vendorId, sellable);
    }

    return inv;
  }

  /** Physical count → set qtyAvailable to counted value with stock_take reason. */
  async stockTake(opts: {
    productId: string;
    vendorId: string;
    outletId: string;
    physicalCount: number;
    changedBy?: string;
    notes?: string;
  }) {
    const { productId, vendorId, outletId, physicalCount, changedBy, notes } = opts;
    if (physicalCount < 0 || !Number.isInteger(physicalCount)) {
      throw Errors.badRequest('Physical count must be a non-negative integer');
    }

    const before = await prisma.inventory.findUnique({
      where: invKey(productId, outletId),
    });
    if (!before || before.vendorId !== vendorId) throw Errors.notFound('Inventory');

    const systemQty = before.qtyAvailable;
    const variance = physicalCount - systemQty;
    const reasonRaw = notes?.trim()
      ? `stock_take: ${notes.trim()}`
      : `stock_take: variance ${variance >= 0 ? '+' : ''}${variance}`;
    const reason = reasonRaw.slice(0, 200);

    const inv = await this.updateStock(
      productId,
      vendorId,
      outletId,
      { qtyAvailable: physicalCount },
      changedBy,
      reason,
    );

    return {
      inventory: inv,
      systemQty,
      physicalCount,
      variance,
    };
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
    changedBy?: string,
  ) {
    const db = tx || prisma;
    for (const item of items) {
      const before = await db.inventory.findUnique({
        where: invKey(item.productId, outletId),
        select: {
          id: true,
          vendorId: true,
          qtyAvailable: true,
          qtyReserved: true,
          lowStockThreshold: true,
          product: { select: { name: true } },
        },
      });

      const updated = await db.$executeRaw`
        UPDATE inventory
        SET qty_reserved = qty_reserved + ${item.quantity},
            updated_at = NOW()
        WHERE product_id = ${item.productId}::uuid
          AND outlet_id = ${outletId}::uuid
          AND qty_available - qty_reserved >= ${item.quantity}
      `;
      if (Number(updated) === 0) {
        const available = before ? Math.max(0, before.qtyAvailable - before.qtyReserved) : 0;
        const name = before?.product?.name ?? 'Item';
        throw Errors.outOfStock(name, available);
      }

      if (before) {
        const newReserved = before.qtyReserved + item.quantity;
        await logInventoryChange(
          before.id,
          before.vendorId,
          'qtyReserved',
          before.qtyReserved,
          newReserved,
          'order_reserve',
          changedBy,
          tx,
        );
        await maybeEmitLowStock({
          productId: item.productId,
          vendorId: before.vendorId,
          qtyAvailable: before.qtyAvailable,
          qtyReserved: newReserved,
          lowStockThreshold: before.lowStockThreshold,
        });
      }
    }
  }

  async releaseStock(
    items: Array<{ productId: string; quantity: number }>,
    outletId: string,
    tx?: TxClient,
    changedBy?: string,
  ) {
    const db = tx || prisma;
    for (const item of items) {
      const before = await db.inventory.findUnique({
        where: invKey(item.productId, outletId),
        select: {
          id: true,
          vendorId: true,
          qtyReserved: true,
        },
      });

      await db.$executeRaw`
        UPDATE inventory
        SET qty_reserved = GREATEST(0, qty_reserved - ${item.quantity}),
            updated_at = NOW()
        WHERE product_id = ${item.productId}::uuid
          AND outlet_id = ${outletId}::uuid
      `;

      if (before) {
        const newReserved = Math.max(0, before.qtyReserved - item.quantity);
        await logInventoryChange(
          before.id,
          before.vendorId,
          'qtyReserved',
          before.qtyReserved,
          newReserved,
          'order_release',
          changedBy,
          tx,
        );
      }
    }
  }

  async finalizeStock(
    items: Array<{ productId: string; quantity: number }>,
    outletId: string,
    tx?: TxClient,
    changedBy?: string,
  ) {
    const db = tx || prisma;
    for (const item of items) {
      const before = await db.inventory.findUnique({
        where: invKey(item.productId, outletId),
        select: {
          id: true,
          vendorId: true,
          qtyAvailable: true,
          qtyReserved: true,
          lowStockThreshold: true,
        },
      });

      await db.inventory.update({
        where: invKey(item.productId, outletId),
        data: {
          qtyAvailable: { decrement: item.quantity },
          qtyReserved: { decrement: item.quantity },
        },
      });

      if (before) {
        const newAvailable = before.qtyAvailable - item.quantity;
        const newReserved = before.qtyReserved - item.quantity;
        await logInventoryChange(
          before.id,
          before.vendorId,
          'qtyAvailable',
          before.qtyAvailable,
          newAvailable,
          'order_finalize',
          changedBy,
          tx,
        );
        await logInventoryChange(
          before.id,
          before.vendorId,
          'qtyReserved',
          before.qtyReserved,
          newReserved,
          'order_finalize',
          changedBy,
          tx,
        );
        await maybeEmitLowStock({
          productId: item.productId,
          vendorId: before.vendorId,
          qtyAvailable: newAvailable,
          qtyReserved: newReserved,
          lowStockThreshold: before.lowStockThreshold,
        });
        await maybeAutoDisableOos(
          item.productId,
          before.vendorId,
          newAvailable - newReserved,
          tx,
        );
      }
    }
  }

  async bulkUpdateStock(
    vendorId: string,
    outletId: string,
    items: Array<{ productId: string; qtyAvailable: number }>,
    changedBy?: string,
  ) {
    const ids = items.map((i) => i.productId);
    const owned = await prisma.inventory.findMany({
      where: { productId: { in: ids }, vendorId, outletId },
      select: { id: true, productId: true, qtyAvailable: true, qtyReserved: true, lowStockThreshold: true },
    });
    const ownedMap = new Map(owned.map((r) => [r.productId, r]));
    const invalid = ids.filter((id) => !ownedMap.has(id));
    if (invalid.length > 0) {
      throw new Error(`Products not owned by this vendor at this outlet: ${invalid.join(', ')}`);
    }

    return prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of items) {
        const before = ownedMap.get(item.productId)!;
        const inv = await tx.inventory.update({
          where: invKey(item.productId, outletId),
          data: { qtyAvailable: item.qtyAvailable },
        });
        await logInventoryChange(
          before.id,
          vendorId,
          'qtyAvailable',
          before.qtyAvailable,
          item.qtyAvailable,
          'bulk_update',
          changedBy,
          tx,
        );
        await maybeEmitLowStock({
          productId: item.productId,
          vendorId,
          qtyAvailable: item.qtyAvailable,
          qtyReserved: before.qtyReserved,
          lowStockThreshold: before.lowStockThreshold,
        });
        results.push(inv);
      }
      return results;
    });
  }

  async bulkAdjustStock(opts: {
    productIds: string[];
    outletId?: string;
    mode?: 'set' | 'increase' | 'decrease';
    value?: number;
    lowStockThreshold?: number;
    scopeVendorId?: string | null;
    changedBy?: string;
  }): Promise<{ updated: number; skipped: number }> {
    const { productIds, outletId, mode, value, lowStockThreshold, scopeVendorId, changedBy } = opts;

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
      select: {
        id: true,
        productId: true,
        outletId: true,
        qtyAvailable: true,
        qtyReserved: true,
        lowStockThreshold: true,
      },
    });
    const rowsByProduct = new Map<string, typeof existing>();
    for (const row of existing) {
      const list = rowsByProduct.get(row.productId) ?? [];
      list.push(row);
      rowsByProduct.set(row.productId, list);
    }

    type Planned = {
      productId: string;
      vendorId: string;
      outletId: string;
      inventoryId?: string;
      nextQty?: number;
      prevQty: number;
      nextThreshold?: number;
      prevThreshold: number;
      qtyReserved: number;
    };

    const planned: Planned[] = [];
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

      for (const row of targetRows.length ? targetRows : [{
        id: undefined as string | undefined,
        productId: pid,
        outletId: outletId!,
        qtyAvailable: 0,
        qtyReserved: 0,
        lowStockThreshold: 10,
      }]) {
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

        if (nextQty === undefined && lowStockThreshold === undefined) {
          skipped++;
          continue;
        }

        planned.push({
          productId: pid,
          vendorId,
          outletId: oid,
          inventoryId: row.id,
          nextQty,
          prevQty: current,
          nextThreshold: lowStockThreshold,
          prevThreshold: row.lowStockThreshold ?? 10,
          qtyReserved: row.qtyReserved ?? 0,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const p of planned) {
        const inv = await tx.inventory.upsert({
          where: invKey(p.productId, p.outletId),
          create: {
            productId: p.productId,
            vendorId: p.vendorId,
            outletId: p.outletId,
            qtyAvailable: p.nextQty ?? 0,
            lowStockThreshold: p.nextThreshold ?? 10,
          },
          update: {
            ...(p.nextQty !== undefined && { qtyAvailable: p.nextQty }),
            ...(p.nextThreshold !== undefined && { lowStockThreshold: p.nextThreshold }),
          },
        });

        if (p.nextQty !== undefined) {
          await logInventoryChange(
            inv.id,
            p.vendorId,
            'qtyAvailable',
            p.prevQty,
            p.nextQty,
            'bulk_adjust',
            changedBy,
            tx,
          );
          await maybeEmitLowStock({
            productId: p.productId,
            vendorId: p.vendorId,
            qtyAvailable: p.nextQty,
            qtyReserved: p.qtyReserved,
            lowStockThreshold: p.nextThreshold ?? p.prevThreshold,
          });
        }
        if (p.nextThreshold !== undefined && p.nextThreshold !== p.prevThreshold) {
          await logInventoryChange(
            inv.id,
            p.vendorId,
            'lowStockThreshold',
            p.prevThreshold,
            p.nextThreshold,
            'bulk_adjust',
            changedBy,
            tx,
          );
        }
      }
    });

    return { updated: planned.length, skipped };
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
        const fromBefore = await tx.inventory.findUnique({
          where: invKey(item.productId, opts.fromOutletId),
          select: { id: true, qtyAvailable: true },
        });
        await tx.inventory.update({
          where: invKey(item.productId, opts.fromOutletId),
          data: { qtyAvailable: { decrement: item.quantity } },
        });
        if (fromBefore) {
          await logInventoryChange(
            fromBefore.id,
            opts.vendorId,
            'qtyAvailable',
            fromBefore.qtyAvailable,
            fromBefore.qtyAvailable - item.quantity,
            'stock_transfer_out',
            opts.createdBy,
            tx,
          );
        }

        const toBefore = await tx.inventory.findUnique({
          where: invKey(item.productId, opts.toOutletId),
          select: { id: true, qtyAvailable: true },
        });
        const toInv = await tx.inventory.upsert({
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
        await logInventoryChange(
          toInv.id,
          opts.vendorId,
          'qtyAvailable',
          toBefore?.qtyAvailable ?? 0,
          (toBefore?.qtyAvailable ?? 0) + item.quantity,
          'stock_transfer_in',
          opts.createdBy,
          tx,
        );
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
    changedBy?: string;
  }): Promise<{
    matched: number;
    updated: number;
    skipped: number;
    errors: Array<{ sku: string; error: string }>;
  }> {
    const { vendorId, businessAccountId, defaultOutletId, multiWarehouse, items, changedBy } = opts;

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
    const updates: Array<{
      sku: string;
      productId: string;
      outletId: string;
      qtyAvailable: number;
      lowStockThreshold?: number;
    }> = [];

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
        sku: item.sku,
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

    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        const before = await tx.inventory.findUnique({
          where: invKey(u.productId, u.outletId),
          select: { id: true, qtyAvailable: true, qtyReserved: true, lowStockThreshold: true },
        });
        const inv = await tx.inventory.update({
          where: invKey(u.productId, u.outletId),
          data: {
            qtyAvailable: u.qtyAvailable,
            ...(u.lowStockThreshold !== undefined && { lowStockThreshold: u.lowStockThreshold }),
          },
        });
        if (before) {
          await logInventoryChange(
            before.id,
            vendorId,
            'qtyAvailable',
            before.qtyAvailable,
            u.qtyAvailable,
            'sku_import',
            changedBy,
            tx,
          );
          if (
            u.lowStockThreshold !== undefined &&
            u.lowStockThreshold !== before.lowStockThreshold
          ) {
            await logInventoryChange(
              before.id,
              vendorId,
              'lowStockThreshold',
              before.lowStockThreshold,
              u.lowStockThreshold,
              'sku_import',
              changedBy,
              tx,
            );
          }
          await maybeEmitLowStock({
            productId: u.productId,
            vendorId,
            qtyAvailable: u.qtyAvailable,
            qtyReserved: before.qtyReserved,
            lowStockThreshold: u.lowStockThreshold ?? before.lowStockThreshold,
          });
        } else {
          await logInventoryChange(
            inv.id,
            vendorId,
            'qtyAvailable',
            0,
            u.qtyAvailable,
            'sku_import',
            changedBy,
            tx,
          );
        }
      }
    });

    return {
      matched: updates.length,
      updated: updates.length,
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
