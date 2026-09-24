import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const findUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    vendor: { findUnique: (...args: unknown[]) => findUnique(...args) },
    product: { findMany: (...args: unknown[]) => findMany(...args) },
  },
}));

vi.mock('@/events/emitter', () => ({ emitEvent: vi.fn() }));

describe('findVendorListingWithPosSku', () => {
  beforeEach(() => {
    findMany.mockReset();
    findUnique.mockReset();
    findUnique.mockResolvedValue({ vendorCode: 'PB', slug: 'plan-b' });
    findMany.mockResolvedValue([]);
  });

  it('queries by vendorSku / composed sku / bare sku — not the full vendor catalog', async () => {
    const { findVendorListingWithPosSku } = await import('../catalog.service');
    await findVendorListingWithPosSku('vendor-1', 'PB0674');

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0]![0] as {
      where: { vendorId: string; OR: unknown[] };
      take?: number;
    };
    expect(arg.where.vendorId).toBe('vendor-1');
    expect(arg.where.OR).toEqual(
      expect.arrayContaining([
        { vendorSku: { equals: 'PB0674', mode: 'insensitive' } },
        { sku: { equals: 'PB0674', mode: 'insensitive' } },
        { sku: { equals: 'PB-PB0674', mode: 'insensitive' } },
      ]),
    );
    expect(arg.take).toBe(20);
  });
});
