import { describe, expect, it } from 'vitest';
import {
  compoundInterestTarget,
  computeAvailable,
  interestPeriods,
  isCreditUsageBlocked,
  matchesCreditFilter,
  validateLimitChange,
} from '../creditMath';

describe('creditMath — available / limit', () => {
  it('available = limit − used', () => {
    expect(computeAvailable(2000, 450)).toBe(1550);
    expect(computeAvailable(1000, 1000)).toBe(0);
    expect(computeAvailable(1000, 0)).toBe(1000);
  });

  it('rejects limit below outstanding + reserved', () => {
    const bad = validateLimitChange(5000, 7000, 0);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/below committed/);

    const ok = validateLimitChange(10000, 7000, 500);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.newAvailable).toBe(2500);
  });
});

describe('creditMath — compound interest', () => {
  it('compounds on principal over periods', () => {
    // 1000 @ 1% for 3 periods → 1000*((1.01)^3 - 1) = 30.301 → 30.3
    expect(compoundInterestTarget(1000, 1, 3)).toBe(30.3);
    expect(compoundInterestTarget(1000, 1, 0)).toBe(0);
    expect(interestPeriods(10, 2)).toBe(5);
    expect(interestPeriods(3, 5)).toBe(0);
  });
});

describe('creditMath — status + filters', () => {
  it('blocks usage for terminal/hold statuses', () => {
    expect(isCreditUsageBlocked('ACTIVE')).toBe(false);
    expect(isCreditUsageBlocked('SUSPENDED')).toBe(true);
    expect(isCreditUsageBlocked('FROZEN')).toBe(true);
    expect(isCreditUsageBlocked('EXPIRED')).toBe(true);
    expect(isCreditUsageBlocked('CANCELLED')).toBe(true);
    expect(isCreditUsageBlocked('BLACKLISTED')).toBe(true);
    expect(isCreditUsageBlocked('BLOCKED')).toBe(true);
  });

  it('matches dashboard filters from live state', () => {
    expect(matchesCreditFilter({ hasWallet: false }, 'NO_CREDIT')).toBe(true);
    expect(matchesCreditFilter({
      hasWallet: true, status: 'ACTIVE', creditLimit: 1000, availableCredit: 0, outstandingAmount: 1000,
    }, 'FULLY_UTILIZED')).toBe(true);
    expect(matchesCreditFilter({
      hasWallet: true, status: 'ACTIVE', overdueDays: 5, outstandingAmount: 100,
    }, 'OVERDUE')).toBe(true);
    expect(matchesCreditFilter({
      hasWallet: true, status: 'BLOCKED',
    }, 'FROZEN')).toBe(true);
    expect(matchesCreditFilter({
      hasWallet: true, status: 'BLACKLISTED', overdueDays: 0, outstandingAmount: 0,
    }, 'HIGH_RISK')).toBe(true);
  });
});
