import { describe, expect, it } from 'vitest';
import { reversalLines } from '../post';
import { commissionPaise, rupeesToPaise, totals } from '../money';
import {
  allocateSpend,
  creditDelivery,
  creditNoteIssue,
  creditRelease,
  fundedDelivery,
  gatewayFee,
  rewardIssue,
  walletSpend,
  writeOffPending,
  type WalletBucket,
} from '../rules';

describe('posting rules', () => {
  it('issues a reward and spends it without a second expense', () => {
    const issue = rewardIssue('user', 10_000);
    expect(totals(issue)).toEqual({ debit: 10_000, credit: 10_000 });
    const spend = walletSpend('user', 'order', [{
      source: 'reward',
      paise: 10_000,
      createdAt: '2026-01-01',
      funderType: 'platform',
      funderId: null,
      tag: 'reward',
    }]);
    expect(spend.some((row) => row.code === 'REWARD_EXPENSE')).toBe(false);
    expect(spend.find((row) => row.code.startsWith('WALLET:'))?.memo).toBe('reward_redeemed');
    expect(totals(spend).debit).toBe(10_000);
  });

  it('pays the supplier the full order minus commission when a reward is used', () => {
    const delivered = fundedDelivery('order', 'vendor', 100_000, 2);
    expect(delivered.flagged).toBe(false);
    const payable = delivered.lines.find((row) => row.code.startsWith('PAYABLE:'));
    const commission = delivered.lines.find((row) => row.code === 'COMMISSION');
    expect(payable?.creditPaise).toBe(98_000);
    expect(commission?.creditPaise).toBe(2_000);
    expect(totals(delivered.lines).debit).toBe(totals(delivered.lines).credit);
  });

  it('holds a credit order until cash arrives, then releases only the collected net', () => {
    const delivered = creditDelivery('user', 'vendor', false, 'order', 1_000_000, 2);
    expect(delivered.lines.find((row) => row.code.startsWith('HELD:'))?.creditPaise).toBe(980_000);
    expect(delivered.lines.find((row) => row.code.startsWith('PAYABLE:'))).toBeUndefined();
    const release = creditRelease('vendor', 1_000_000, 2, 600_000);
    expect(release.find((row) => row.code.startsWith('PAYABLE:'))?.creditPaise).toBe(588_000);
    expect(release.find((row) => row.code.startsWith('HELD:'))?.debitPaise).toBe(588_000);
  });

  it('spends credit notes before rewards, oldest first', () => {
    const buckets: WalletBucket[] = [
      { source: 'reward', paise: 50, createdAt: '2026-01-01', funderType: 'platform', funderId: null, tag: 'reward' },
      { source: 'credit_note', paise: 40, createdAt: '2026-02-01', funderType: 'supplier', funderId: 's2', tag: 'cn:s2' },
      { source: 'credit_note', paise: 30, createdAt: '2026-01-01', funderType: 'supplier', funderId: 's1', tag: 'cn:s1' },
    ];
    const used = allocateSpend(buckets, 50);
    expect(used.map((row) => row.tag)).toEqual(['cn:s1', 'cn:s2']);
  });

  it('posts a pending write-off to the holding account', () => {
    const lines = writeOffPending('user', null, 500);
    expect(lines.find((row) => row.code === 'WRITEOFF_PENDING')?.debitPaise).toBe(500);
    expect(lines.some((row) => row.code === 'CREDIT_LOSS')).toBe(false);
  });

  it('refuses a missing commission rate', () => {
    expect(fundedDelivery('order', 'vendor', 1000, null).flagged).toBe(true);
    expect(commissionPaise(1000, 0)).toBe(0);
  });

  it('pays ₹980 on a ₹1,000 order that used a ₹100 reward', () => {
    const issue = rewardIssue('user', rupeesToPaise('100'));
    const spend = walletSpend('user', 'order', [{
      source: 'reward', paise: 10_000, createdAt: '2026-01-01', funderType: 'platform', funderId: null, tag: 'reward',
    }]);
    const delivered = fundedDelivery('order', 'vendor', rupeesToPaise('1000'), 2);
    expect(issue.find((row) => row.code === 'REWARD_EXPENSE')?.debitPaise).toBe(10_000);
    expect(spend.some((row) => row.code === 'REWARD_EXPENSE')).toBe(false);
    expect(delivered.lines.find((row) => row.code.startsWith('PAYABLE:'))?.creditPaise).toBe(98_000);
    expect(delivered.lines.find((row) => row.code === 'COMMISSION')?.creditPaise).toBe(2_000);
  });

  it('books the four ₹463 orders under the journal rules', () => {
    const subtotal = rupeesToPaise('463');
    const fee = 236;
    const online = fundedDelivery('o1', 'vendor', subtotal, 10);
    const onlinePayable = (online.lines.find((row) => row.code.startsWith('PAYABLE:'))?.creditPaise ?? 0) - fee;
    expect(onlinePayable).toBe(41_434);
    expect(gatewayFee('vendor', fee).find((row) => row.code.startsWith('PAYABLE:'))?.debitPaise).toBe(236);

    const supplier = creditDelivery('user', 'vendor', false, 'o2', subtotal, 10);
    expect(supplier.lines.find((row) => row.code.startsWith('PAYABLE:'))).toBeUndefined();
    expect(supplier.lines.find((row) => row.code.startsWith('HELD:'))?.creditPaise).toBe(41_670);
    expect(supplier.lines.find((row) => row.code.startsWith('AR_CREDIT_SUP:'))?.debitPaise).toBe(subtotal);

    const h1 = creditDelivery('user', 'vendor', true, 'o3', subtotal, 10);
    expect(h1.lines.find((row) => row.code.startsWith('AR_CREDIT_H1:'))?.debitPaise).toBe(subtotal);
    expect(h1.lines.find((row) => row.code.startsWith('HELD:'))?.creditPaise).toBe(41_670);

    const mixed = fundedDelivery('o4', 'vendor', subtotal, 10);
    const mixedPayable = (mixed.lines.find((row) => row.code.startsWith('PAYABLE:'))?.creditPaise ?? 0) - fee;
    expect(mixedPayable).toBe(41_434);
    expect(walletSpend('user', 'o4', [{
      source: 'reward', paise: rupeesToPaise('300'), createdAt: '2026-01-01', funderType: 'platform', funderId: null, tag: 'reward',
    }]).some((row) => row.code === 'REWARD_EXPENSE')).toBe(false);
  });

  it('pays the next supplier in full when a credit note is spent', () => {
    const note = creditNoteIssue('user', 'supplier-a', 30_000);
    expect(note.find((row) => row.code === 'HELD:supplier-a')?.debitPaise).toBe(30_000);
    const spend = walletSpend('user', 'order-b', [{
      source: 'credit_note', paise: 30_000, createdAt: '2026-01-01', funderType: 'supplier', funderId: 'supplier-a', tag: 'cn:supplier-a',
    }]);
    expect(spend.some((row) => row.code === 'REWARD_EXPENSE')).toBe(false);
    const delivered = fundedDelivery('order-b', 'supplier-b', 30_000, 2);
    expect(delivered.lines.find((row) => row.code.startsWith('PAYABLE:'))?.creditPaise).toBe(29_400);
  });

  it('returns a wallet spend to the same bucket when reversed', () => {
    const spend = walletSpend('user', 'order', [{
      source: 'reward', paise: 10_000, createdAt: '2026-01-01', funderType: 'platform', funderId: null, tag: 'reward',
    }]);
    const reversed = reversalLines(spend);
    expect(reversed.find((row) => row.code.endsWith(':reward'))?.creditPaise).toBe(10_000);
    expect(totals(reversed).debit).toBe(totals(spend).debit);
  });

  it('releases only collected cash, oldest order first', () => {
    const first = creditRelease('vendor', 1_000_000, 2, 1_000_000);
    const second = creditRelease('vendor', 1_000_000, 2, 200_000);
    expect(first.find((row) => row.code.startsWith('PAYABLE:'))?.creditPaise).toBe(980_000);
    expect(second.find((row) => row.code.startsWith('PAYABLE:'))?.creditPaise).toBe(196_000);
    const together = 980_000 + 196_000;
    expect(together).toBe(1_176_000);
  });

  it('keeps any sequence of events balanced', () => {
    const sequences = [
      rewardIssue('u', 100),
      walletSpend('u', 'o', [{ source: 'reward', paise: 100, createdAt: '2026-01-01', funderType: 'platform', funderId: null, tag: 'reward' }]),
      fundedDelivery('o', 'v', 100_000, 2).lines,
      creditDelivery('u', 'v', true, 'o2', 50_000, 10).lines,
      creditRelease('v', 50_000, 10, 20_000),
      writeOffPending('u', 'v', 10),
    ];
    for (const lines of sequences) {
      const sum = totals(lines);
      expect(sum.debit).toBe(sum.credit);
    }
  });
});
