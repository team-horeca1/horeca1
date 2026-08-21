/**
 * Pure DiSCCO credit math — unit-testable without Prisma.
 * available = creditLimit − usedCredit
 * usedCredit = reservedAmount + outstandingAmount (+ penalties tracked in used)
 */

export function computeAvailable(creditLimit: number, usedCredit: number): number {
  return round2(creditLimit - usedCredit);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Compound interest target over `periods` at ratePct percent per period. */
export function compoundInterestTarget(principal: number, ratePct: number, periods: number): number {
  if (periods < 1 || ratePct <= 0 || principal <= 0) return 0;
  const r = ratePct / 100;
  return round2(principal * (Math.pow(1 + r, periods) - 1));
}

export function interestPeriods(taxableDays: number, frequencyDays: number): number {
  if (taxableDays <= 0 || frequencyDays < 1) return 0;
  return Math.floor(taxableDays / frequencyDays);
}

export type LimitChangeResult =
  | { ok: true; newAvailable: number }
  | { ok: false; reason: string };

/**
 * Reducing a limit below committed exposure (outstanding + reserved) is rejected
 * so available never becomes a silently invalid negative without an explicit policy.
 */
export function validateLimitChange(
  newLimit: number,
  outstanding: number,
  reserved: number,
): LimitChangeResult {
  if (!Number.isFinite(newLimit) || newLimit < 0) {
    return { ok: false, reason: 'Credit limit must be a non-negative number' };
  }
  const committed = round2(outstanding + reserved);
  if (newLimit < committed) {
    return {
      ok: false,
      reason: `Cannot set limit ₹${newLimit} below committed exposure ₹${committed} (outstanding ₹${outstanding} + reserved ₹${reserved})`,
    };
  }
  return { ok: true, newAvailable: computeAvailable(newLimit, committed) };
}

export const BLOCKING_CREDIT_STATUSES = [
  'BLOCKED',
  'SUSPENDED',
  'FROZEN',
  'EXPIRED',
  'CANCELLED',
  'BLACKLISTED',
] as const;

export type BlockingCreditStatus = (typeof BLOCKING_CREDIT_STATUSES)[number];

export function isCreditUsageBlocked(status: string): boolean {
  return (BLOCKING_CREDIT_STATUSES as readonly string[]).includes(status);
}

export type CreditFilterKey =
  | 'ALL'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'FROZEN'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'BLACKLISTED'
  | 'BLOCKED'
  | 'FULLY_UTILIZED'
  | 'NO_CREDIT'
  | 'OVERDUE'
  | 'HIGH_RISK';

export interface CreditFilterRow {
  hasWallet: boolean;
  status?: string | null;
  creditLimit?: number;
  availableCredit?: number;
  outstandingAmount?: number;
  overdueDays?: number;
}

export function matchesCreditFilter(row: CreditFilterRow, filter: CreditFilterKey): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'NO_CREDIT') return !row.hasWallet || Number(row.creditLimit ?? 0) <= 0;
  if (!row.hasWallet) return false;

  const status = row.status ?? '';
  const limit = Number(row.creditLimit ?? 0);
  const available = Number(row.availableCredit ?? 0);
  const outstanding = Number(row.outstandingAmount ?? 0);
  const overdueDays = Number(row.overdueDays ?? 0);

  switch (filter) {
    case 'ACTIVE':
      return status === 'ACTIVE';
    case 'SUSPENDED':
      return status === 'SUSPENDED';
    case 'FROZEN':
      return status === 'FROZEN' || status === 'BLOCKED';
    case 'EXPIRED':
      return status === 'EXPIRED';
    case 'CANCELLED':
      return status === 'CANCELLED';
    case 'BLACKLISTED':
      return status === 'BLACKLISTED';
    case 'BLOCKED':
      return status === 'BLOCKED' || status === 'FROZEN';
    case 'FULLY_UTILIZED':
      return status === 'ACTIVE' && limit > 0 && available <= 0;
    case 'OVERDUE':
      return overdueDays > 0 && outstanding > 0;
    case 'HIGH_RISK':
      return status === 'BLACKLISTED' || overdueDays > 60;
    default:
      return true;
  }
}
