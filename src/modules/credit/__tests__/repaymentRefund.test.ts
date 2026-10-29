/**
 * Mocked unit tests for reverseRazorpayRepayment ledger math / idempotency.
 * These do NOT call Razorpay — label as mocked in release evidence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const findUniqueRepayment = vi.fn();
const findFirstTxn = vi.fn();
const findManyTxn = vi.fn();
const findUniqueWallet = vi.fn();
const updateWallet = vi.fn();
const updateRepayment = vi.fn();
const createTxn = vi.fn();
const queryRaw = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        creditWalletRepayment: {
          findUnique: (...a: unknown[]) => findUniqueRepayment(...a),
          update: (...a: unknown[]) => updateRepayment(...a),
        },
        creditWalletTxn: {
          findFirst: (...a: unknown[]) => findFirstTxn(...a),
          findMany: (...a: unknown[]) => findManyTxn(...a),
          create: (...a: unknown[]) => createTxn(...a),
        },
        creditWallet: {
          findUnique: (...a: unknown[]) => findUniqueWallet(...a),
          update: (...a: unknown[]) => updateWallet(...a),
        },
        $queryRaw: (...a: unknown[]) => queryRaw(...a),
      }),
  },
}));

vi.mock('@/lib/razorpay', () => ({
  getRazorpay: () => ({ payments: { fetch: vi.fn(), capture: vi.fn() } }),
}));

import { CreditWalletService } from '../creditWallet.service';

const D = (n: number) => new Prisma.Decimal(n);

function walletRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wal-1',
    creditLimit: D(50000),
    usedCredit: D(1000),
    outstandingAmount: D(1000),
    availableCredit: D(49000),
    reservedAmount: D(0),
    status: 'ACTIVE',
    currentDueDate: null,
    overdueDays: 0,
    overdueBaseAmount: null,
    ...overrides,
  };
}

describe('reverseRazorpayRepayment (mocked ledger)', () => {
  const service = new CreditWalletService();

  beforeEach(() => {
    vi.clearAllMocks();
    findFirstTxn.mockResolvedValue(null);
    findManyTxn.mockResolvedValue([]);
    queryRaw.mockResolvedValue([walletRow()]);
    findUniqueWallet.mockResolvedValue(walletRow());
    updateWallet.mockResolvedValue(walletRow({ outstandingAmount: D(1500), usedCredit: D(1500) }));
    updateRepayment.mockResolvedValue({});
    createTxn.mockResolvedValue({});
  });

  it('restores a full refund exactly once', async () => {
    findUniqueRepayment.mockResolvedValue({
      id: 'rep-1',
      walletId: 'wal-1',
      amount: D(500),
      status: 'SUCCESS',
      razorpayPaymentId: 'pay_1',
    });

    const first = await service.reverseRazorpayRepayment('pay_1', 50000, 'rfnd_full');
    expect(first).toEqual({ reversed: true, amount: 500, fullyReversed: true });
    expect(updateWallet).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        outstandingAmount: expect.any(Prisma.Decimal),
        usedCredit: expect.any(Prisma.Decimal),
      }),
    }));
    expect(updateRepayment).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'REFUNDED' },
    }));
    expect(createTxn).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'REVERSAL',
        note: expect.stringContaining('rzp_refund:rfnd_full'),
      }),
    }));
  });

  it('restores only the partial refund amount', async () => {
    findUniqueRepayment.mockResolvedValue({
      id: 'rep-1',
      walletId: 'wal-1',
      amount: D(1000),
      status: 'SUCCESS',
      razorpayPaymentId: 'pay_1',
    });

    const result = await service.reverseRazorpayRepayment('pay_1', 40000, 'rfnd_part');
    expect(result).toEqual({ reversed: true, amount: 400, fullyReversed: false });
    expect(updateRepayment).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'PARTIAL_REFUND' },
    }));
    expect(createTxn).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: D(400) }),
    }));
  });

  it('ignores duplicate refund ids', async () => {
    findUniqueRepayment.mockResolvedValue({
      id: 'rep-1',
      walletId: 'wal-1',
      amount: D(500),
      status: 'SUCCESS',
      razorpayPaymentId: 'pay_1',
    });
    findFirstTxn.mockResolvedValue({ id: 'txn-dup' });

    const result = await service.reverseRazorpayRepayment('pay_1', 50000, 'rfnd_dup');
    expect(result).toEqual({ reversed: false, reason: 'duplicate' });
    expect(updateWallet).not.toHaveBeenCalled();
  });

  it('does not reverse when repayment was never applied', async () => {
    findUniqueRepayment.mockResolvedValue({
      id: 'rep-1',
      walletId: 'wal-1',
      amount: D(500),
      status: 'PENDING',
      razorpayPaymentId: null,
    });

    const result = await service.reverseRazorpayRepayment('pay_1', 50000, 'rfnd_x');
    expect(result).toEqual({ reversed: false, reason: 'not_applied' });
  });

  it('caps restore when prior partial reversals already ran', async () => {
    findUniqueRepayment.mockResolvedValue({
      id: 'rep-1',
      walletId: 'wal-1',
      amount: D(1000),
      status: 'PARTIAL_REFUND',
      razorpayPaymentId: 'pay_1',
    });
    findManyTxn.mockResolvedValue([{ amount: D(600) }]);

    const result = await service.reverseRazorpayRepayment('pay_1', 100000, 'rfnd_rest');
    expect(result).toEqual({ reversed: true, amount: 400, fullyReversed: true });
  });
});
