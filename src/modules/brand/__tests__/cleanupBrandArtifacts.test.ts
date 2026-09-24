import { beforeEach, describe, expect, it, vi } from 'vitest';

const brandFindFirst = vi.fn();
const bmpFindMany = vi.fn();
const bmpDelete = vi.fn();
const mappingDeleteMany = vi.fn();
const productCount = vi.fn();
const bmpCount = vi.fn();
const masterUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    brand: { findFirst: (...a: unknown[]) => brandFindFirst(...a) },
    brandMasterProduct: {
      findMany: (...a: unknown[]) => bmpFindMany(...a),
      delete: (...a: unknown[]) => bmpDelete(...a),
      count: (...a: unknown[]) => bmpCount(...a),
    },
    brandProductMapping: { deleteMany: (...a: unknown[]) => mappingDeleteMany(...a) },
    product: { count: (...a: unknown[]) => productCount(...a) },
    masterProduct: { update: (...a: unknown[]) => masterUpdate(...a) },
  },
}));

vi.mock('@/events/emitter', () => ({ emitEvent: vi.fn() }));

describe('cleanupBrandArtifactsAfterProductRemoval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brandFindFirst.mockResolvedValue({ id: 'brand-1' });
    bmpFindMany.mockResolvedValue([{ id: 'bmp-1', _count: { mappings: 0 } }]);
    bmpDelete.mockResolvedValue({});
    mappingDeleteMany.mockResolvedValue({ count: 1 });
    productCount.mockResolvedValue(0);
    bmpCount.mockResolvedValue(0);
    masterUpdate.mockResolvedValue({});
  });

  it('removes orphan brand catalog rows and deactivates orphan masters', async () => {
    const { cleanupBrandArtifactsAfterProductRemoval } = await import('../brand.service');
    await cleanupBrandArtifactsAfterProductRemoval({
      productId: 'prod-1',
      name: 'Plan B Vegan Cheddar Block 250 gm',
      brand: 'Plan B',
      sku: 'PB-PB0674',
      masterProductId: 'master-1',
    });

    expect(mappingDeleteMany).toHaveBeenCalledWith({
      where: { distributorProductId: 'prod-1' },
    });
    expect(bmpDelete).toHaveBeenCalledWith({ where: { id: 'bmp-1' } });
    expect(masterUpdate).toHaveBeenCalledWith({
      where: { id: 'master-1' },
      data: { isActive: false },
    });
  });

  it('keeps master active when other listings remain', async () => {
    productCount.mockResolvedValue(2);
    const { cleanupBrandArtifactsAfterProductRemoval } = await import('../brand.service');
    await cleanupBrandArtifactsAfterProductRemoval({
      productId: 'prod-1',
      name: 'X',
      brand: 'Plan B',
      sku: null,
      masterProductId: 'master-1',
    });
    expect(masterUpdate).not.toHaveBeenCalled();
  });
});
