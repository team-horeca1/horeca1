import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { OrderService } from '@/modules/order/order.service';
import type { PicklistItem, GrnItem } from './warehouse.validator';
import type { PicklistStatus, DispatchStatus, GoodsReceiptStatus, Prisma } from '@prisma/client';

const ACTIVE_PICKLIST_STATUSES: PicklistStatus[] = ['draft', 'printed', 'picked'];

const PICKLIST_TRANSITIONS: Record<PicklistStatus, PicklistStatus[]> = {
  draft: ['printed', 'picked', 'cancelled'],
  printed: ['picked', 'cancelled'],
  picked: ['cancelled'],
  cancelled: [],
};

const DISPATCH_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  pending: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const FULFILLABLE_ORDER_STATUSES = ['confirmed', 'processing', 'ready_for_dispatch'] as const;

function parsePicklistItems(items: Prisma.JsonValue): PicklistItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (i): i is PicklistItem =>
      typeof i === 'object' &&
      i !== null &&
      'productId' in i &&
      'productName' in i &&
      'qty' in i,
  );
}

function parseGrnItems(items: Prisma.JsonValue): GrnItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (i): i is GrnItem =>
      typeof i === 'object' && i !== null && 'productId' in i && 'qty' in i,
  );
}

export class WarehouseService {
  private orderService = new OrderService();

  async lookupOrders(vendorId: string, outletId: string | undefined, q: string, limit = 8) {
    return prisma.order.findMany({
      where: {
        vendorId,
        status: { in: [...FULFILLABLE_ORDER_STATUSES] },
        ...(outletId ? { fulfillmentOutletId: outletId } : {}),
        ...(q.length >= 2
          ? { orderNumber: { contains: q, mode: 'insensitive' } }
          : {}),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        user: { select: { fullName: true, businessName: true } },
      },
    });
  }

  async lookupProducts(vendorId: string, q: string, limit = 8) {
    if (q.length < 2) return [];
    return prisma.product.findMany({
      where: {
        vendorId,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: { id: true, name: true, sku: true, basePrice: true },
    });
  }

  async listPicklists(vendorId: string, outletId?: string) {
    const rows = await prisma.picklist.findMany({
      where: { vendorId, ...(outletId ? { outletId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { order: { select: { orderNumber: true, status: true } } },
    });
    return rows.map((r) => ({
      ...r,
      itemCount: parsePicklistItems(r.items).length,
      canDispatch: r.status === 'picked',
    }));
  }

  async getPicklist(vendorId: string, picklistId: string) {
    const row = await prisma.picklist.findFirst({
      where: { id: picklistId, vendorId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            user: { select: { fullName: true, businessName: true, phone: true } },
          },
        },
      },
    });
    if (!row) throw Errors.notFound('Picklist');
    return {
      ...row,
      items: parsePicklistItems(row.items),
      canDispatch: row.status === 'picked',
    };
  }

  async createPicklist(
    vendorId: string,
    outletId: string,
    input: { orderId?: string; notes?: string; items?: PicklistItem[] },
  ) {
    if (input.orderId) {
      const existing = await prisma.picklist.findFirst({
        where: {
          vendorId,
          orderId: input.orderId,
          status: { in: ACTIVE_PICKLIST_STATUSES },
        },
      });
      if (existing) {
        return { ...existing, items: parsePicklistItems(existing.items), reused: true as const };
      }
    }

    let items = input.items ?? [];
    const orderId = input.orderId;

    let resolvedOutletId = outletId;
    if (orderId && items.length === 0) {
      const order = await prisma.order.findFirst({
        where: { id: orderId, vendorId },
        include: { items: { include: { product: { select: { name: true } } } } },
      });
      if (!order) throw Errors.notFound('Order');
      if (order.fulfillmentOutletId) resolvedOutletId = order.fulfillmentOutletId;
      if (!['confirmed', 'processing', 'ready_for_dispatch', 'shipped'].includes(order.status)) {
        throw Errors.badRequest(
          `Cannot create picklist for order in status "${order.status}". Order must be accepted first.`,
        );
      }
      items = order.items.map((i) => ({
        productId: i.productId,
        productName: i.productName || i.product.name,
        qty: order.isPartial ? (i.fulfilledQty ?? i.quantity) : i.quantity,
      }));
    }

    if (items.length === 0) {
      throw Errors.badRequest('Picklist requires an order or explicit line items.');
    }

    const row = await prisma.picklist.create({
      data: {
        vendorId,
        outletId: resolvedOutletId,
        orderId,
        notes: input.notes,
        items,
      },
      include: { order: { select: { orderNumber: true, status: true } } },
    });
    return { ...row, items: parsePicklistItems(row.items), reused: false as const };
  }

  async updatePicklistStatus(vendorId: string, picklistId: string, status: PicklistStatus) {
    const picklist = await prisma.picklist.findFirst({
      where: { id: picklistId, vendorId },
      include: { order: { select: { id: true, status: true } } },
    });
    if (!picklist) throw Errors.notFound('Picklist');

    const allowed = PICKLIST_TRANSITIONS[picklist.status] ?? [];
    if (!allowed.includes(status)) {
      throw Errors.badRequest(`Cannot move picklist from "${picklist.status}" to "${status}".`);
    }

    const updated = await prisma.picklist.update({
      where: { id: picklistId },
      data: { status },
      include: { order: { select: { orderNumber: true, status: true } } },
    });

    if (status === 'picked' && picklist.orderId && picklist.order) {
      await this.syncOrderOnPicklistPicked(picklist.orderId, vendorId, picklist.order.status);
    }

    return { ...updated, items: parsePicklistItems(updated.items) };
  }

  /** Order graph: confirmed → processing → ready_for_dispatch (no skipping). */
  private async syncOrderOnPicklistPicked(
    orderId: string,
    vendorId: string,
    orderStatus: string,
  ) {
    if (orderStatus === 'confirmed') {
      await this.orderService.updateStatus(orderId, vendorId, 'processing');
      await this.orderService.updateStatus(orderId, vendorId, 'ready_for_dispatch');
    } else if (orderStatus === 'processing') {
      await this.orderService.updateStatus(orderId, vendorId, 'ready_for_dispatch');
    }
  }

  async listDispatches(vendorId: string, outletId?: string) {
    return prisma.dispatch.findMany({
      where: { vendorId, ...(outletId ? { outletId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { order: { select: { orderNumber: true, status: true } } },
    });
  }

  async getDispatch(vendorId: string, dispatchId: string) {
    const row = await prisma.dispatch.findFirst({
      where: { id: dispatchId, vendorId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveryOtp: true,
            user: { select: { fullName: true, businessName: true, phone: true } },
          },
        },
      },
    });
    if (!row) throw Errors.notFound('Dispatch');
    return row;
  }

  async createDispatch(
    vendorId: string,
    outletId: string,
    input: {
      orderId?: string;
      picklistId?: string;
      driverName?: string;
      vehicleNumber?: string;
      notes?: string;
    },
  ) {
    let orderId = input.orderId;
    let picklistId = input.picklistId;

    if (picklistId) {
      const picklist = await prisma.picklist.findFirst({
        where: { id: picklistId, vendorId },
      });
      if (!picklist) throw Errors.notFound('Picklist');
      if (picklist.status !== 'picked') {
        throw Errors.badRequest('Picklist must be marked as picked before creating a dispatch.');
      }
      orderId = picklist.orderId ?? orderId;
      picklistId = picklist.id;
    }

    if (!orderId && !picklistId) {
      throw Errors.badRequest('Dispatch requires an order or a picked picklist.');
    }

    let resolvedOutletId = outletId;
    if (orderId) {
      const order = await prisma.order.findFirst({
        where: { id: orderId, vendorId },
      });
      if (!order) throw Errors.notFound('Order');
      if (order.fulfillmentOutletId) resolvedOutletId = order.fulfillmentOutletId;
      const allowed = ['ready_for_dispatch', 'processing', 'shipped'];
      if (!allowed.includes(order.status)) {
        throw Errors.badRequest(
          `Cannot dispatch order in status "${order.status}". Mark the picklist as picked first.`,
        );
      }
    }

    const now = new Date();
    const dispatch = await prisma.$transaction(async () => {
      const row = await prisma.dispatch.create({
        data: {
          vendorId,
          outletId: resolvedOutletId,
          orderId,
          picklistId,
          driverName: input.driverName,
          vehicleNumber: input.vehicleNumber,
          notes: input.notes,
          status: 'out_for_delivery',
          dispatchedAt: now,
        },
        include: { order: { select: { orderNumber: true, status: true } } },
      });

      if (orderId) {
        const order = await prisma.order.findFirst({
          where: { id: orderId, vendorId },
          select: { status: true },
        });
        if (order && ['ready_for_dispatch', 'processing'].includes(order.status)) {
          await this.orderService.updateStatus(orderId, vendorId, 'shipped');
        }
      }

      return row;
    });

    return dispatch;
  }

  async updateDispatchStatus(
    vendorId: string,
    dispatchId: string,
    status: DispatchStatus,
    notes?: string,
  ) {
    const dispatch = await prisma.dispatch.findFirst({
      where: { id: dispatchId, vendorId },
      include: { order: { select: { id: true, status: true, deliveryOtp: true } } },
    });
    if (!dispatch) throw Errors.notFound('Dispatch');

    const allowed = DISPATCH_TRANSITIONS[dispatch.status] ?? [];
    if (!allowed.includes(status)) {
      throw Errors.badRequest(`Cannot move dispatch from "${dispatch.status}" to "${status}".`);
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.dispatch.update({
        where: { id: dispatchId },
        data: {
          status,
          notes: notes ?? dispatch.notes,
          ...(status === 'out_for_delivery' && !dispatch.dispatchedAt ? { dispatchedAt: now } : {}),
          ...(status === 'delivered' ? { deliveredAt: now } : {}),
        },
        include: { order: { select: { orderNumber: true, status: true } } },
      });

      if (status === 'delivered' && dispatch.orderId && dispatch.order) {
        const orderStatus = dispatch.order.status;
        if (orderStatus === 'shipped' || orderStatus === 'partially_delivered') {
          const deliveryNotes =
            notes?.trim() ||
            dispatch.notes?.trim() ||
            'Confirmed via warehouse dispatch';
          await this.orderService.updateStatus(
            dispatch.orderId,
            vendorId,
            'delivered',
            undefined,
            { proofType: 'notes', notes: deliveryNotes },
          );
        }
      }

      return row;
    });

    return updated;
  }

  async listGrns(vendorId: string, outletId?: string) {
    const rows = await prisma.goodsReceipt.findMany({
      where: { vendorId, ...(outletId ? { outletId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      ...r,
      items: parseGrnItems(r.items),
      itemCount: parseGrnItems(r.items).length,
    }));
  }

  async getGrn(vendorId: string, grnId: string) {
    const row = await prisma.goodsReceipt.findFirst({
      where: { id: grnId, vendorId },
    });
    if (!row) throw Errors.notFound('Goods receipt');
    return { ...row, items: parseGrnItems(row.items) };
  }

  async createGrn(
    vendorId: string,
    outletId: string,
    input: {
      referenceNo?: string;
      supplier?: string;
      notes?: string;
      items: GrnItem[];
      receive?: boolean;
    },
  ) {
    const enrichedItems = await this.enrichGrnItems(vendorId, input.items);

    if (input.receive) {
      return this.receiveGrnInternal(vendorId, outletId, {
        referenceNo: input.referenceNo,
        supplier: input.supplier,
        notes: input.notes,
        items: enrichedItems,
      });
    }

    const row = await prisma.goodsReceipt.create({
      data: {
        vendorId,
        outletId,
        referenceNo: input.referenceNo,
        supplier: input.supplier,
        notes: input.notes,
        items: enrichedItems,
        status: 'draft',
      },
    });
    return { ...row, items: enrichedItems };
  }

  async updateGrnStatus(vendorId: string, grnId: string, status: GoodsReceiptStatus) {
    const grn = await prisma.goodsReceipt.findFirst({
      where: { id: grnId, vendorId },
    });
    if (!grn) throw Errors.notFound('Goods receipt');

    if (status === 'cancelled') {
      if (grn.status !== 'draft') {
        throw Errors.badRequest('Only draft GRNs can be cancelled.');
      }
      const row = await prisma.goodsReceipt.update({
        where: { id: grnId },
        data: { status: 'cancelled' },
      });
      return { ...row, items: parseGrnItems(row.items) };
    }

    if (status === 'received') {
      if (grn.status !== 'draft') {
        throw Errors.badRequest('GRN has already been received or cancelled.');
      }
      const items = parseGrnItems(grn.items);
      if (!grn.outletId) throw Errors.badRequest('GRN has no warehouse outlet assigned');
      return this.receiveGrnInternal(vendorId, grn.outletId, {
        grnId,
        referenceNo: grn.referenceNo ?? undefined,
        supplier: grn.supplier ?? undefined,
        notes: grn.notes ?? undefined,
        items,
      });
    }

    throw Errors.badRequest('Invalid GRN status.');
  }

  private async enrichGrnItems(vendorId: string, items: GrnItem[]) {
    const ids = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: ids }, vendorId },
      select: { id: true, name: true },
    });
    const nameMap = new Map(products.map((p) => [p.id, p.name]));
    const missing = ids.filter((id) => !nameMap.has(id));
    if (missing.length > 0) {
      throw Errors.badRequest(`Products not found for this vendor: ${missing.join(', ')}`);
    }
    return items.map((i) => ({
      ...i,
      productName: i.productName ?? nameMap.get(i.productId) ?? 'Product',
    }));
  }

  private async receiveGrnInternal(
    vendorId: string,
    outletId: string,
    input: {
      grnId?: string;
      referenceNo?: string;
      supplier?: string;
      notes?: string;
      items: GrnItem[];
    },
  ) {
    return prisma.$transaction(async (tx) => {
      let grn;
      if (input.grnId) {
        grn = await tx.goodsReceipt.update({
          where: { id: input.grnId },
          data: {
            status: 'received',
            receivedAt: new Date(),
          },
        });
      } else {
        grn = await tx.goodsReceipt.create({
          data: {
            vendorId,
            outletId,
            referenceNo: input.referenceNo,
            supplier: input.supplier,
            notes: input.notes,
            items: input.items,
            status: 'received',
            receivedAt: new Date(),
          },
        });
      }

      for (const line of input.items) {
        const current = await tx.inventory.findUnique({
          where: { productId_outletId: { productId: line.productId, outletId } },
        });
        if (!current || current.vendorId !== vendorId) continue;
        const newQty = current.qtyAvailable + line.qty;
        const inv = await tx.inventory.update({
          where: { productId_outletId: { productId: line.productId, outletId } },
          data: { qtyAvailable: newQty },
        });
        await tx.inventoryLog.create({
          data: {
            inventoryId: inv.id,
            vendorId,
            field: 'qtyAvailable',
            oldValue: current.qtyAvailable,
            newValue: newQty,
            reason: 'grn_receive',
          },
        });
      }

      return { ...grn, items: input.items };
    });
  }

  async findActivePicklistForOrder(vendorId: string, orderId: string) {
    return prisma.picklist.findFirst({
      where: {
        vendorId,
        orderId,
        status: { in: ACTIVE_PICKLIST_STATUSES },
      },
      include: { order: { select: { orderNumber: true, status: true } } },
    });
  }
}

export const warehouseService = new WarehouseService();
