import { describe, expect, it } from 'vitest';
import {
  RECONCILIATION_INTERVAL_MS,
  RECONCILIATION_LOCK_TTL_SEC,
  reconciliationTickDecision,
} from '@/workers/reconciliation.scheduler';

describe('reconciliation scheduler', () => {
  it('runs only when the lock is acquired', () => {
    expect(reconciliationTickDecision('OK')).toBe('run');
    expect(reconciliationTickDecision(null)).toBe('skip');
  });

  it('keeps the lock longer than one interval so overlapping ticks skip', () => {
    expect(RECONCILIATION_LOCK_TTL_SEC * 1000).toBeGreaterThan(RECONCILIATION_INTERVAL_MS);
    expect(RECONCILIATION_INTERVAL_MS).toBe(5 * 60 * 1000);
  });
});
