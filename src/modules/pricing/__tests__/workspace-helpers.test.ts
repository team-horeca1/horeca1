import { describe, expect, it } from 'vitest';
import { dirtyToPublishCells } from '@/components/features/vendor/pricing/types';
import { aggregateGuardrails, evaluateCellGuardrails } from '../guardrails';

describe('dirtyToPublishCells', () => {
  it('maps clear-to-base and exclusions', () => {
    const cells = dirtyToPublishCells({
      'p1:l1': null,
      'p2:l1': { price: 64, isExcluded: false },
      'p3:l1': { isExcluded: true, price: null },
    });
    expect(cells).toEqual(
      expect.arrayContaining([
        { productId: 'p1', priceListId: 'l1', customPrice: null, isExcluded: false },
        expect.objectContaining({ productId: 'p2', priceListId: 'l1', customPrice: 64 }),
        expect.objectContaining({ productId: 'p3', priceListId: 'l1', isExcluded: true }),
      ]),
    );
  });
});

describe('publish decision from guardrails', () => {
  it('blocks zero price so publish cannot proceed without fix', () => {
    const flags = evaluateCellGuardrails({
      newPrice: 0,
      previousEffective: 65,
      basePrice: 65,
      mrp: 80,
    });
    const agg = aggregateGuardrails([flags]);
    expect(agg.hasBlocks).toBe(true);
  });

  it('warns on slip and requires ack path', () => {
    const flags = evaluateCellGuardrails({
      newPrice: 650,
      previousEffective: 65,
      basePrice: 65,
      mrp: 900,
    });
    const agg = aggregateGuardrails([flags]);
    expect(agg.hasBlocks).toBe(false);
    expect(agg.hasWarns).toBe(true);
  });
});
