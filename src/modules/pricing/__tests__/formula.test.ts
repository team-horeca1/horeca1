import { describe, expect, it } from 'vitest';
import {
  applyFormula,
  grossFromExGst,
  normalizeListKey,
  parseFormula,
  roundMoney,
  roundToStep,
} from '../formula';

describe('parseFormula', () => {
  it('parses BASE minus percent', () => {
    expect(parseFormula('=BASE-3%')).toEqual({
      source: 'BASE',
      op: '-',
      value: 3,
      isPercent: true,
    });
  });

  it('parses another list name with spaces stripped', () => {
    expect(parseFormula('=Hotel Pricing+2%')).toEqual({
      source: 'HOTELPRICING',
      op: '+',
      value: 2,
      isPercent: true,
    });
  });

  it('parses absolute and multiply', () => {
    expect(parseFormula('=BASE+5')).toEqual({
      source: 'BASE',
      op: '+',
      value: 5,
      isPercent: false,
    });
    expect(parseFormula('=BASE*1.05')).toEqual({
      source: 'BASE',
      op: '*',
      value: 1.05,
      isPercent: false,
    });
  });

  it('rejects invalid formulas', () => {
    expect(parseFormula('BASE-3%')).toBeNull();
    expect(parseFormula('=BASE')).toBeNull();
    expect(parseFormula('=BASE*3%')).toBeNull();
    expect(parseFormula('hello')).toBeNull();
  });
});

describe('applyFormula', () => {
  it('applies percent and absolute ops', () => {
    expect(applyFormula(100, { source: 'BASE', op: '-', value: 3, isPercent: true })).toBe(97);
    expect(applyFormula(65, { source: 'BASE', op: '-', value: 3, isPercent: true })).toBe(63.05);
    expect(applyFormula(100, { source: 'BASE', op: '+', value: 5, isPercent: false })).toBe(105);
    expect(applyFormula(100, { source: 'BASE', op: '*', value: 1.05, isPercent: false })).toBe(105);
  });
});

describe('roundMoney / roundToStep', () => {
  it('rounds to paise', () => {
    expect(roundMoney(63.055)).toBe(63.06);
    expect(roundMoney(63.054)).toBe(63.05);
  });

  it('rounds to step', () => {
    expect(roundToStep(63.07, 0.05)).toBe(63.05);
    expect(roundToStep(63.3, 0.5)).toBe(63.5);
    expect(roundToStep(63.4, 1)).toBe(63);
  });

  it('normalises list keys', () => {
    expect(normalizeListKey('COD Pricing')).toBe('CODPRICING');
  });
});

describe('grossFromExGst', () => {
  it('adds product GST for display', () => {
    expect(grossFromExGst(100, 5)).toBe(105);
    expect(grossFromExGst(120.28, 0)).toBe(120.28);
    expect(grossFromExGst(100, 18)).toBe(118);
  });
});
