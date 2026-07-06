import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/events/emitter';
import { Errors } from '@/middleware/errorHandler';

export class ListService {
  async getAll(userId: string) {
    return prisma.quickOrderList.findMany({
      where: { userId },
      include: {
        vendor: { select: { id: true, businessName: true, slug: true, logoUrl: true } },
        items: {
          include: {
            product: {
              include: {
                priceSlabs: { orderBy: { sortOrder: 'asc' } },
                inventories: { select: { qtyAvailable: true } },
                vendor: { select: { id: true, businessName: true, logoUrl: true } },
                category: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getById(listId: string, userId: string) {
    const list = await prisma.quickOrderList.findFirst({
      where: { id: listId, userId },
      include: {
        vendor: { select: { id: true, businessName: true, slug: true } },
        items: {
          include: {
            product: {
              include: {
                priceSlabs: { orderBy: { sortOrder: 'asc' } },
                inventories: { select: { qtyAvailable: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!list) throw Errors.notFound('Quick Order List');
    return list;
  }

  async create(userId: string, businessAccountId: string, data: { name: string; vendorId: string; items?: Array<{ productId: string; defaultQty: number; vendorId?: string }> }) {
    const list = await prisma.quickOrderList.create({
      data: {
        userId,
        businessAccountId,
        vendorId: data.vendorId,
        name: data.name,
        ...(data.items?.length
          ? {
              items: {
                create: data.items.map((item, i) => ({
                  productId: item.productId,
                  vendorId: item.vendorId ?? data.vendorId,
                  defaultQty: item.defaultQty,
                  sortOrder: i,
                })),
              },
            }
          : {}),
      },
    });

    emitEvent('ListCreated', { listId: list.id, userId, vendorId: data.vendorId, name: data.name });
    return list;
  }

  async addItem(listId: string, userId: string, productId: string, vendorId: string, defaultQty: number) {
    const list = await prisma.quickOrderList.findFirst({ where: { id: listId, userId } });
    if (!list) throw Errors.notFound('Quick Order List');

    return prisma.quickOrderListItem.create({
      data: { listId, productId, vendorId, defaultQty },
    });
  }

  async removeItem(listId: string, userId: string, itemId: string) {
    const list = await prisma.quickOrderList.findFirst({ where: { id: listId, userId } });
    if (!list) throw Errors.notFound('Quick Order List');

    return prisma.quickOrderListItem.delete({ where: { id: itemId, listId } });
  }

  async delete(listId: string, userId: string) {
    const list = await prisma.quickOrderList.findFirst({ where: { id: listId, userId } });
    if (!list) throw Errors.notFound('Quick Order List');

    return prisma.quickOrderList.delete({ where: { id: listId } });
  }
}
