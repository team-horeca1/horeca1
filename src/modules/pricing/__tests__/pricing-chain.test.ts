import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  normalizeCreditStatus,
  resolveFromPreloaded,
  type CustomerContext,
} from '../pricing.service';

const customer: CustomerContext = {
  userId: 'u1',
  businessAccountId: 'ba1',
  outletId: 'o1',
  outletPincode: '400706',
  outletCity: 'Navi Mumbai',
  outletState: 'Maharashtra',
  tags: ['hotel'],
};

function fixedItem(productId: string, price: number, opts?: { isExcluded?: boolean; id?: string }) {
  return {
    id: opts?.id ?? `item-${productId}-${price}`,
    productId,
    customPrice: new Prisma.Decimal(price),
    pricingType: 'fixed' as const,
    discountPercent: null,
    schemeMinQty: null,
    schemeFreeQty: null,
    validFrom: null,
    validTo: null,
    scheduledPrice: null,
    scheduledFrom: null,
    scheduledTo: null,
    isExcluded: opts?.isExcluded ?? false,
  };
}

function assign(
  type: 'outlet' | 'customer' | 'group' | 'credit_status' | 'segment' | 'pincode' | 'area' | 'brand',
  list: { id: string; name?: string; discountPercent?: number; items: ReturnType<typeof fixedItem>[] },
  target: Record<string, string | null> = {},
) {
  return {
    type,
    userId: target.userId ?? null,
    businessAccountId: target.businessAccountId ?? null,
    outletId: target.outletId ?? null,
    brandId: target.brandId ?? null,
    groupId: target.groupId ?? null,
    pincode: target.pincode ?? null,
    area: target.area ?? null,
    segment: target.segment ?? null,
    brandName: target.brandName ?? null,
    creditStatus: target.creditStatus ?? null,
    priceList: {
      id: list.id,
      name: list.name ?? list.id,
      discountPercent: list.discountPercent ?? 0,
      items: list.items,
    },
  };
}

describe('normalizeCreditStatus', () => {
  it('maps wallet statuses', () => {
    expect(normalizeCreditStatus('ACTIVE')).toBe('active');
    expect(normalizeCreditStatus('BLACKLISTED')).toBe('blacklisted');
    expect(normalizeCreditStatus('BLOCKED')).toBe('blocked');
    expect(normalizeCreditStatus('SUSPENDED')).toBe('suspended');
    expect(normalizeCreditStatus('CANCELLED')).toBe('closed');
    expect(normalizeCreditStatus('ACTIVE', 'IN_PROGRESS')).toBe('active');
    expect(normalizeCreditStatus(null)).toBeNull();
  });
});

describe('resolveFromPreloaded — Base fallback', () => {
  it('returns base when no assignments', () => {
    const r = resolveFromPreloaded({
      productId: 'p1',
      basePrice: 65,
      quantity: 1,
      customer,
      assignments: [],
    });
    expect(r.source).toBe('base-price');
    expect(Number(r.unitPrice)).toBe(65);
  });
});

describe('resolveFromPreloaded — special price', () => {
  it('applies customer list fixed price', () => {
    const r = resolveFromPreloaded({
      productId: 'p1',
      basePrice: 65,
      quantity: 1,
      customer,
      assignments: [
        assign('customer', { id: 'pl-hotel', items: [fixedItem('p1', 64)] }, { userId: 'u1' }),
      ],
    });
    expect(r.source).toBe('pricelist:customer');
    expect(Number(r.unitPrice)).toBe(64);
    expect(r.priceListId).toBe('pl-hotel');
  });
});

describe('resolveFromPreloaded — level precedence', () => {
  it('customer beats pincode', () => {
    const r = resolveFromPreloaded({
      productId: 'p1',
      basePrice: 65,
      quantity: 1,
      customer,
      assignments: [
        assign('pincode', { id: 'pl-pin', items: [fixedItem('p1', 63)] }, { pincode: '400706' }),
        assign('customer', { id: 'pl-cust', items: [fixedItem('p1', 64)] }, { userId: 'u1' }),
      ],
    });
    expect(r.source).toBe('pricelist:customer');
    expect(Number(r.unitPrice)).toBe(64);
  });

  it('outlet beats customer', () => {
    const r = resolveFromPreloaded({
      productId: 'p1',
      basePrice: 65,
      quantity: 1,
      customer,
      assignments: [
        assign('customer', { id: 'pl-cust', items: [fixedItem('p1', 64)] }, { userId: 'u1' }),
        assign('outlet', { id: 'pl-out', items: [fixedItem('p1', 62)] }, { outletId: 'o1' }),
      ],
    });
    expect(r.source).toBe('pricelist:outlet');
    expect(Number(r.unitPrice)).toBe(62);
  });
});

describe('resolveFromPreloaded — Hidden wins', () => {
  it('excludes when any eligible list removes the product', () => {
    const r = resolveFromPreloaded({
      productId: 'p1',
      basePrice: 65,
      quantity: 1,
      customer,
      assignments: [
        assign('customer', { id: 'pl-a', items: [fixedItem('p1', 64)] }, { userId: 'u1' }),
        assign('pincode', {
          id: 'pl-b',
          items: [fixedItem('p1', 63, { isExcluded: true, id: 'ex1' })],
        }, { pincode: '400706' }),
      ],
    });
    expect(r.excluded).toBe(true);
    expect(r.source).toBe('excluded');
    expect(r.priceListId).toBe('pl-b');
  });
});

describe('resolveFromPreloaded — credit_status', () => {
  it('matches credit status assignment', () => {
    const r = resolveFromPreloaded({
      productId: 'p1',
      basePrice: 65,
      quantity: 1,
      customer,
      creditStatus: 'active',
      assignments: [
        assign('credit_status', { id: 'pl-credit', items: [fixedItem('p1', 60)] }, { creditStatus: 'active' }),
      ],
    });
    expect(r.source).toBe('pricelist:credit_status');
    expect(Number(r.unitPrice)).toBe(60);
  });
});

describe('resolveFromPreloaded — sparse list (other SKU only)', () => {
  it('falls through to Base when list has no item for this SKU', () => {
    const r = resolveFromPreloaded({
      productId: 'p1',
      basePrice: 65,
      quantity: 1,
      customer,
      assignments: [
        assign('customer', { id: 'pl-amul', items: [fixedItem('p2', 100)] }, { userId: 'u1' }),
      ],
    });
    expect(r.source).toBe('base-price');
    expect(Number(r.unitPrice)).toBe(65);
  });
});

describe('resolveFromPreloaded — cross-supplier independence', () => {
  it('only uses the assignments passed for that vendor', () => {
    // Caller scopes by vendor — vendor B's list is simply not in the array.
    const r = resolveFromPreloaded({
      productId: 'p1',
      basePrice: 65,
      quantity: 1,
      customer,
      assignments: [
        assign('customer', { id: 'vendor-a-list', items: [fixedItem('p1', 64)] }, { userId: 'u1' }),
      ],
    });
    expect(r.priceListId).toBe('vendor-a-list');
    expect(Number(r.unitPrice)).toBe(64);
  });
});

describe('resolveFromPreloaded — list discount fallback', () => {
  it('applies global list discount when no item', () => {
    const r = resolveFromPreloaded({
      productId: 'p1',
      basePrice: 100,
      quantity: 1,
      customer,
      assignments: [
        assign('customer', { id: 'pl-disc', discountPercent: 10, items: [] }, { userId: 'u1' }),
      ],
    });
    expect(r.source).toBe('pricelist:customer');
    expect(Number(r.unitPrice)).toBe(90);
  });
});
