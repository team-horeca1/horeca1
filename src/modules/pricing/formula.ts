/**
 * Pricelist cell formulas — editing tool only; final prices are stored.
 * Supported: =BASE-3%, =BASE+5, =BASE*1.05, =COD-2% (another list by name).
 */

export type FormulaOp = '+' | '-' | '*';

export interface ParsedFormula {
  source: 'BASE' | string; // 'BASE' or normalised list key (uppercase, no spaces)
  op: FormulaOp;
  value: number;
  isPercent: boolean;
}

const FORMULA_RE = /^=([A-Za-z0-9 _]+)([+\-*])(\d+(?:\.\d+)?)(%?)$/;

/** Normalise a list name for formula matching: "Hotel Pricing" → "HOTELPRICING". */
export function normalizeListKey(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase();
}

/**
 * Parse a formula string. Returns null if invalid.
 * Examples: "=BASE-3%", "=COD+2", "=BASE*1.05"
 */
export function parseFormula(input: string): ParsedFormula | null {
  const trimmed = input.trim();
  const m = FORMULA_RE.exec(trimmed);
  if (!m) return null;
  const rawSource = m[1].trim();
  const op = m[2] as FormulaOp;
  const value = Number(m[3]);
  if (!Number.isFinite(value)) return null;
  const isPercent = m[4] === '%';
  if (isPercent && op === '*') return null; // *=N% is not supported
  const source = normalizeListKey(rawSource) === 'BASE' ? 'BASE' : normalizeListKey(rawSource);
  return { source, op, value, isPercent };
}

/**
 * Apply a parsed formula to a base/source price. Rounds to 2 decimal places
 * (HALF_UP) to match platform money math.
 */
export function applyFormula(sourcePrice: number, formula: ParsedFormula): number {
  if (!Number.isFinite(sourcePrice) || sourcePrice < 0) {
    throw new Error('Invalid source price for formula');
  }
  let result: number;
  if (formula.op === '*') {
    result = sourcePrice * formula.value;
  } else if (formula.isPercent) {
    const delta = sourcePrice * (formula.value / 100);
    result = formula.op === '+' ? sourcePrice + delta : sourcePrice - delta;
  } else {
    result = formula.op === '+' ? sourcePrice + formula.value : sourcePrice - formula.value;
  }
  return roundMoney(result);
}

/** Round to 2dp HALF_UP (paise). */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Display-only gross: ex-GST × (1 + tax%). Checkout still adds GST once. */
export function grossFromExGst(exGst: number, taxPercent: number): number {
  if (!Number.isFinite(exGst) || exGst < 0) return NaN;
  const tax = Number.isFinite(taxPercent) && taxPercent > 0 ? taxPercent : 0;
  return roundMoney(exGst * (1 + tax / 100));
}

/**
 * Round to a supplier-chosen step (0.05 / 0.50 / 1) for bulk ±% / ±₹.
 * Uses HALF_UP to the nearest multiple of `step`.
 */
export function roundToStep(n: number, step: 0.05 | 0.5 | 1): number {
  if (!Number.isFinite(n) || step <= 0) return NaN;
  return roundMoney(Math.round(n / step) * step);
}
