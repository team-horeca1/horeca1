import { describe, expect, it } from 'vitest';
import {
  aggregateGuardrails,
  evaluateCellGuardrails,
} from '../guardrails';

describe('evaluateCellGuardrails — blocks', () => {
  it('blocks zero / negative / non-finite', () => {
    expect(evaluateCellGuardrails({
      newPrice: 0, previousEffective: 65, basePrice: 65, mrp: 80,
    }).some((f) => f.code === 'zero_or_negative')).toBe(true);

    expect(evaluateCellGuardrails({
      newPrice: -1, previousEffective: 65, basePrice: 65, mrp: 80,
    }).some((f) => f.severity === 'block')).toBe(true);

    expect(evaluateCellGuardrails({
      newPrice: Number.NaN, previousEffective: 65, basePrice: 65, mrp: 80,
    }).some((f) => f.code === 'non_finite')).toBe(true);
  });

  it('blocks above MRP (originalPrice)', () => {
    const flags = evaluateCellGuardrails({
      newPrice: 90, previousEffective: 65, basePrice: 65, mrp: 80,
    });
    expect(flags.some((f) => f.code === 'above_mrp' && f.severity === 'block')).toBe(true);
  });

  it('blocks below list floor percent of Base', () => {
    const flags = evaluateCellGuardrails({
      newPrice: 40, previousEffective: 65, basePrice: 100, mrp: 120,
      floorPercentOfBase: 50,
    });
    expect(flags.some((f) => f.code === 'below_floor')).toBe(true);
  });

  it('skips price checks when clearing or excluding', () => {
    expect(evaluateCellGuardrails({
      newPrice: null, previousEffective: 65, basePrice: 65, mrp: 80,
    })).toHaveLength(0);

    expect(evaluateCellGuardrails({
      newPrice: 0, previousEffective: 65, basePrice: 65, mrp: 80, isExcluded: true,
    })).toHaveLength(0);
  });
});

describe('evaluateCellGuardrails — warns', () => {
  it('warns on decimal slip 65 → 650', () => {
    const flags = evaluateCellGuardrails({
      newPrice: 650, previousEffective: 65, basePrice: 65, mrp: 900,
    });
    expect(flags.some((f) => f.code === 'decimal_slip')).toBe(true);
  });

  it('warns on large jump without slip', () => {
    const flags = evaluateCellGuardrails({
      newPrice: 90, previousEffective: 65, basePrice: 65, mrp: 100,
    });
    expect(flags.some((f) => f.code === 'large_jump')).toBe(true);
    expect(flags.some((f) => f.code === 'decimal_slip')).toBe(false);
  });

  it('warns when more than 30% below Base', () => {
    const flags = evaluateCellGuardrails({
      newPrice: 60, previousEffective: 100, basePrice: 100, mrp: 120,
    });
    expect(flags.some((f) => f.code === 'far_below_base')).toBe(true);
  });

  it('warns when customers are affected', () => {
    const flags = evaluateCellGuardrails(
      { newPrice: 64, previousEffective: 65, basePrice: 65, mrp: 80 },
      { customersAffected: 14 },
    );
    expect(flags.some((f) => f.code === 'customers_affected')).toBe(true);
  });
});

describe('aggregateGuardrails', () => {
  it('separates blocks and warns', () => {
    const a = evaluateCellGuardrails({
      newPrice: 0, previousEffective: 65, basePrice: 65, mrp: 80,
    });
    const b = evaluateCellGuardrails({
      newPrice: 650, previousEffective: 65, basePrice: 65, mrp: 900,
    });
    const agg = aggregateGuardrails([a, b]);
    expect(agg.hasBlocks).toBe(true);
    expect(agg.hasWarns).toBe(true);
  });
});
