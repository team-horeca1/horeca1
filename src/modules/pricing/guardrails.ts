/**
 * Publish guardrails — shared by client (instant feedback) and server (authoritative).
 *
 * block  — never acknowledgeable; publish must fix or drop the cell.
 * warn   — publish needs acknowledgeWarnings: true.
 *
 * There is no product cost field; "below cost" is NOT implemented.
 * floorPercentOfBase is an optional supplier-set floor on the list.
 */

export type GuardrailSeverity = 'block' | 'warn';

export type GuardrailCode =
  | 'zero_or_negative'
  | 'non_finite'
  | 'above_mrp'
  | 'below_floor'
  | 'decimal_slip'
  | 'large_jump'
  | 'far_below_base'
  | 'customers_affected';

export interface GuardrailFlag {
  severity: GuardrailSeverity;
  code: GuardrailCode;
  message: string;
}

export interface CellGuardrailInput {
  /** Proposed new price. Null means "use Base" (clear override) — not validated as a price. */
  newPrice: number | null;
  /** Previous effective price for this cell (override or Base), used for jump/slip. */
  previousEffective: number | null;
  basePrice: number;
  /** MRP = Product.originalPrice. Null/undefined skips the above-MRP check. */
  mrp: number | null | undefined;
  /** List floor as percent of Base (e.g. 70 → block below 70% of Base). */
  floorPercentOfBase?: number | null;
  /** True when cell is being marked excluded — skip price checks. */
  isExcluded?: boolean;
}

export interface EvaluateOptions {
  /** Customers currently reached by this list (warn only). */
  customersAffected?: number;
  /** Jump threshold as fraction (default 0.25 = 25%). */
  jumpThreshold?: number;
  /** Far-below-base threshold as fraction (default 0.30 = 30% below Base). */
  farBelowBaseThreshold?: number;
  /** Decimal-slip ratio bounds (default 5 / 0.2). */
  slipHigh?: number;
  slipLow?: number;
}

/**
 * Evaluate a single cell change. Returns zero or more flags, blocks first.
 * Clearing a price (newPrice=null) or excluding a product produces no price flags.
 */
export function evaluateCellGuardrails(
  input: CellGuardrailInput,
  opts: EvaluateOptions = {},
): GuardrailFlag[] {
  const flags: GuardrailFlag[] = [];
  if (input.isExcluded || input.newPrice === null) {
    if ((opts.customersAffected ?? 0) > 0) {
      flags.push({
        severity: 'warn',
        code: 'customers_affected',
        message: `Affects ${opts.customersAffected} customer${opts.customersAffected === 1 ? '' : 's'}`,
      });
    }
    return flags;
  }

  const price = input.newPrice;
  if (!Number.isFinite(price)) {
    flags.push({ severity: 'block', code: 'non_finite', message: 'Price must be a valid number' });
    return flags;
  }
  if (price <= 0) {
    flags.push({ severity: 'block', code: 'zero_or_negative', message: 'Price must be greater than zero' });
  }

  if (input.mrp != null && Number.isFinite(input.mrp) && input.mrp > 0 && price > input.mrp) {
    flags.push({
      severity: 'block',
      code: 'above_mrp',
      message: `Price ₹${fmt(price)} is above MRP ₹${fmt(input.mrp)}`,
    });
  }

  const floorPct = input.floorPercentOfBase;
  if (floorPct != null && Number.isFinite(floorPct) && floorPct > 0 && Number.isFinite(input.basePrice)) {
    const floor = (input.basePrice * floorPct) / 100;
    if (price < floor) {
      flags.push({
        severity: 'block',
        code: 'below_floor',
        message: `Price ₹${fmt(price)} is below list floor ₹${fmt(floor)} (${floorPct}% of Base)`,
      });
    }
  }

  const prev = input.previousEffective;
  const slipHigh = opts.slipHigh ?? 5;
  const slipLow = opts.slipLow ?? 0.2;
  if (prev != null && prev > 0 && Number.isFinite(prev)) {
    const ratio = price / prev;
    if (ratio >= slipHigh || ratio <= slipLow) {
      flags.push({
        severity: 'warn',
        code: 'decimal_slip',
        message: `Looks like a decimal slip: ₹${fmt(prev)} → ₹${fmt(price)}`,
      });
    } else {
      const jump = opts.jumpThreshold ?? 0.25;
      const absChange = Math.abs(price - prev) / prev;
      if (absChange > jump) {
        flags.push({
          severity: 'warn',
          code: 'large_jump',
          message: `Moves ${Math.round(absChange * 100)}% from ₹${fmt(prev)}`,
        });
      }
    }
  }

  const farBelow = opts.farBelowBaseThreshold ?? 0.3;
  if (input.basePrice > 0 && price < input.basePrice * (1 - farBelow)) {
    flags.push({
      severity: 'warn',
      code: 'far_below_base',
      message: `More than ${Math.round(farBelow * 100)}% below Base ₹${fmt(input.basePrice)}`,
    });
  }

  if ((opts.customersAffected ?? 0) > 0) {
    flags.push({
      severity: 'warn',
      code: 'customers_affected',
      message: `Affects ${opts.customersAffected} customer${opts.customersAffected === 1 ? '' : 's'}`,
    });
  }

  return flags;
}

export interface AggregateGuardrails {
  blocks: GuardrailFlag[];
  warns: GuardrailFlag[];
  hasBlocks: boolean;
  hasWarns: boolean;
}

/** Flatten per-cell flags into a publish decision. */
export function aggregateGuardrails(all: GuardrailFlag[][]): AggregateGuardrails {
  const blocks: GuardrailFlag[] = [];
  const warns: GuardrailFlag[] = [];
  for (const flags of all) {
    for (const f of flags) {
      if (f.severity === 'block') blocks.push(f);
      else warns.push(f);
    }
  }
  return { blocks, warns, hasBlocks: blocks.length > 0, hasWarns: warns.length > 0 };
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
