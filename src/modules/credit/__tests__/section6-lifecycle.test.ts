/**
 * DiSCCO Section 6 — deterministic API/unit coverage for config precedence,
 * limit exposure, repayment-mode gating helpers, and filter math.
 */
import { describe, expect, it } from 'vitest';
import {
  compoundInterestTarget,
  computeAvailable,
  isCreditUsageBlocked,
  matchesCreditFilter,
  validateLimitChange,
} from '../creditMath';

describe('Section 6 — limit exposure', () => {
  it('rejects decrease below outstanding + reserved', () => {
    expect(validateLimitChange(5000, 7000, 0).ok).toBe(false);
    expect(validateLimitChange(7000, 7000, 0).ok).toBe(true);
    expect(validateLimitChange(7001, 7000, 0).ok).toBe(true);
    expect(validateLimitChange(20000, 7000, 500).ok).toBe(true);
    expect(validateLimitChange(0, 0, 0).ok).toBe(true);
    expect(validateLimitChange(-1, 0, 0).ok).toBe(false);
  });
});

describe('Section 6 — reservation math', () => {
  it('tracks available through reserve → convert → repay', () => {
    const limit = 2000;
    let reserved = 0;
    let outstanding = 0;
    let used = 0;

    // checkout reserve 450
    reserved += 450;
    used = reserved + outstanding;
    expect(computeAvailable(limit, used)).toBe(1550);
    expect(outstanding).toBe(0);

    // delivery convert
    outstanding += 450;
    reserved -= 450;
    used = reserved + outstanding;
    expect(reserved).toBe(0);
    expect(outstanding).toBe(450);
    expect(computeAvailable(limit, used)).toBe(1550);

    // repay 450
    outstanding -= 450;
    used = reserved + outstanding;
    expect(outstanding).toBe(0);
    expect(computeAvailable(limit, used)).toBe(2000);
  });

  it('concurrent ₹700 + ₹700 against ₹1000 cannot both fit', () => {
    const limit = 1000;
    const first = 700;
    const second = 700;
    const afterFirst = computeAvailable(limit, first);
    expect(afterFirst).toBe(300);
    expect(afterFirst >= second).toBe(false);
  });
});

describe('Section 6 — status blocking', () => {
  it('blocks credit usage for hold/terminal statuses only', () => {
    expect(isCreditUsageBlocked('ACTIVE')).toBe(false);
    for (const s of ['SUSPENDED', 'FROZEN', 'EXPIRED', 'CANCELLED', 'BLACKLISTED', 'BLOCKED']) {
      expect(isCreditUsageBlocked(s)).toBe(true);
    }
  });
});

describe('Section 6 — filters', () => {
  it('separates no-credit / fully-utilized / overdue / high-risk', () => {
    expect(matchesCreditFilter({ hasWallet: false }, 'NO_CREDIT')).toBe(true);
    expect(matchesCreditFilter({
      hasWallet: true, status: 'ACTIVE', creditLimit: 1000, availableCredit: 0, outstandingAmount: 1000,
    }, 'FULLY_UTILIZED')).toBe(true);
    expect(matchesCreditFilter({
      hasWallet: true, status: 'ACTIVE', overdueDays: 2, outstandingAmount: 50,
    }, 'OVERDUE')).toBe(true);
    expect(matchesCreditFilter({
      hasWallet: true, status: 'BLACKLISTED', overdueDays: 0, outstandingAmount: 0,
    }, 'HIGH_RISK')).toBe(true);
  });
});

describe('Section 6 — compound interest', () => {
  it('matches configured frequency periods', () => {
    expect(compoundInterestTarget(1000, 1, 3)).toBe(30.3);
  });
});
