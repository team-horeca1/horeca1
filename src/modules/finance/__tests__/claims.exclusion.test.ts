import { describe, expect, it } from 'vitest';

/**
 * Same decision the database claim uses: lock the order, then insert only if
 * no active claim exists. The mutex stands in for SELECT … FOR UPDATE.
 */
class ClaimTable {
  private active = new Map<string, 'finance' | 'legacy_wallet'>();
  private chain: Promise<void> = Promise.resolve();

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.chain;
    this.chain = gate;
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  claim(orderId: string, owner: 'finance' | 'legacy_wallet'): 'claimed' | 'blocked' {
    if (this.active.has(orderId)) return 'blocked';
    this.active.set(orderId, owner);
    return 'claimed';
  }

  release(orderId: string) {
    this.active.delete(orderId);
  }
}

describe('settlement claim exclusion', () => {
  it('lets only one of finance, weekly settlement, or instant payout own an order', async () => {
    const table = new ClaimTable();
    const orderId = 'order-1';
    const results = await Promise.all([
      table.transaction(async () => table.claim(orderId, 'finance')),
      table.transaction(async () => table.claim(orderId, 'legacy_wallet')),
      table.transaction(async () => table.claim(orderId, 'legacy_wallet')),
    ]);
    expect(results.filter((result) => result === 'claimed')).toHaveLength(1);
    expect(results.filter((result) => result === 'blocked')).toHaveLength(2);
  });

  it('releases a cancelled draft so a later batch can claim the order', async () => {
    const table = new ClaimTable();
    expect(table.claim('order-1', 'finance')).toBe('claimed');
    table.release('order-1');
    expect(table.claim('order-1', 'legacy_wallet')).toBe('claimed');
  });
});
