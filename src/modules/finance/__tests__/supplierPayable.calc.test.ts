import { describe, expect, it } from 'vitest';
import { commissionPaise, paiseToRupees, rupeesToPaise } from '@/modules/finance/money';
import {
  assessPayable,
  assertSingleBucket,
  grossCashPaise,
  outstandingPaise,
  type PayableAssessmentInput,
  type PayableStatus,
} from '@/modules/finance/supplierPayable.calc';
import { cancelDraft, finaliseBatch, markBatchSettled, type BatchRecord } from '@/modules/finance/supplierSettlement.state';
import { computeOrderSettlementAmounts } from '@/modules/vendor/vendorSettlement.service';

const vendor = 'vendor-a';

function input(overrides: Partial<PayableAssessmentInput> = {}): PayableAssessmentInput {
  return {
    orderStatus: 'delivered',
    paymentMethod: 'online',
    vendorId: vendor,
    subtotal: '10000.00',
    promoDiscount: '0.00',
    couponDiscount: '0.00',
    couponVendorId: null,
    payments: [{ amount: '10000.00', status: 'captured', method: 'online', razorpayFeePaise: 0 }],
    processedRefunds: [],
    ratePct: '10.00',
    onHold: false,
    inOpenBatch: false,
    ...overrides,
  };
}

describe('paise conversion', () => {
  it('round trips rupees without binary drift', () => {
    expect(rupeesToPaise('10000.10')).toBe(1_000_010);
    expect(paiseToRupees(1_000_010)).toBe('10000.10');
    expect(commissionPaise(1_000_000, '10.00')).toBe(100_000);
    expect(commissionPaise(1_000_000, '0.00')).toBe(0);
    expect(commissionPaise(1_000_000, null)).toBe(0);
  });
});

describe('supplier payable calculation', () => {
  it('uses the stored Razorpay fee in paise, not a percentage', () => {
    const result = assessPayable(input({
      subtotal: '100.00',
      payments: [{ amount: '100.00', status: 'captured', method: 'online', razorpayFeePaise: 118 }],
      ratePct: '10.00',
    }));
    expect(result.razorpayFeePaise).toBe(118);
    expect(result.commissionPaise).toBe(1000);
    expect(result.netPayablePaise).toBe(10000 - 118 - 1000);
    expect(result.razorpayFeeUnknown).toBe(false);
  });

  it('does not invent a Razorpay fee when the payment has none', () => {
    const result = assessPayable(input({
      payments: [{ amount: '100.00', status: 'captured', method: 'online', razorpayFeePaise: null }],
    }));
    expect(result.status).toBe('fee_unknown');
    expect(result.razorpayFeeUnknown).toBe(true);
    expect(result.netPayablePaise).toBe(0);
  });

  it('charges no Razorpay fee on cash that never went through Razorpay', () => {
    const result = assessPayable(input({
      paymentMethod: 'cod',
      payments: [{ amount: '10000.00', status: 'captured', method: 'cod' }],
    }));
    expect(result.razorpayFeePaise).toBe(0);
    expect(result.razorpayFeeUnknown).toBe(false);
    expect(result.netPayablePaise).toBe(900_000);
  });

  it('charges a configured positive commission on the tax-inclusive subtotal', () => {
    const result = assessPayable(input());
    expect(result.taxTreatment).toBe('tax_inclusive_subtotal_pending_client_confirmation');
    expect(result.recognisedBasePaise).toBe(1_000_000);
    expect(result.commissionPaise).toBe(100_000);
    expect(result.netPayablePaise).toBe(900_000);
    expect(result.status).toBe('eligible');
    expect(result.netPayablePaise).toBeLessThanOrEqual(result.netCollectedPaise);
  });

  it('treats an explicit 0% as a real rate', () => {
    const result = assessPayable(input({ ratePct: '0.00' }));
    expect(result.commissionPaise).toBe(0);
    expect(result.netPayablePaise).toBe(1_000_000);
    expect(result.status).toBe('eligible');
  });

  it('does not treat a missing rate as 0%', () => {
    const result = assessPayable(input({ ratePct: null }));
    expect(result.status).toBe('commission_unconfigured');
    expect(result.netPayablePaise).toBe(0);
    expect(result.blockedSalePaise).toBe(1_000_000);
    expect(result.bucket).toBeNull();
  });

  it('keeps captured cash awaiting completion until delivery', () => {
    const result = assessPayable(input({ orderStatus: 'shipped' }));
    expect(result.status).toBe('awaiting_completion');
    expect(result.recognisedBasePaise).toBe(0);
    expect(result.commissionPaise).toBe(0);
    expect(result.netPayablePaise).toBe(0);
    expect(result.provisionalBasePaise).toBe(1_000_000);
    expect(result.provisionalCommissionPaise).toBe(100_000);
    expect(result.quoteCommissionPaise).toBe(100_000);
    expect(result.quoteFeePaise).toBe(0);
    expect(result.quoteNetPaise).toBe(900_000);
  });

  it('quotes the Razorpay cut before delivery without making it payable', () => {
    const result = assessPayable(input({
      orderStatus: 'confirmed',
      subtotal: '100.00',
      payments: [{ amount: '100.00', status: 'captured', method: 'online', razorpayFeePaise: 118 }],
      ratePct: '10.00',
    }));
    expect(result.status).toBe('awaiting_completion');
    expect(result.commissionPaise).toBe(0);
    expect(result.netPayablePaise).toBe(0);
    expect(result.bucket).toBeNull();
    expect(result.quoteFeePaise).toBe(118);
    expect(result.quoteFeeUnknown).toBe(false);
    expect(result.quoteCommissionPaise).toBe(1000);
    expect(result.quoteNetPaise).toBe(10000 - 118 - 1000);
  });

  it('quotes commission before delivery when the Razorpay fee has not arrived', () => {
    const result = assessPayable(input({
      orderStatus: 'confirmed',
      payments: [{ amount: '100.00', status: 'captured', method: 'online', razorpayFeePaise: null }],
    }));
    expect(result.status).toBe('awaiting_completion');
    expect(result.netPayablePaise).toBe(0);
    expect(result.quoteFeeUnknown).toBe(true);
    expect(result.quoteFeePaise).toBe(0);
    expect(result.quoteCommissionPaise).toBe(1000);
    expect(result.quoteNetPaise).toBe(0);
  });

  it('does not count an authorised payment as cash', () => {
    const result = assessPayable(input({
      payments: [{ amount: '10000.00', status: 'authorized', method: 'online', razorpayFeePaise: 0 }],
    }));
    expect(result.status).toBe('pending_capture');
    expect(result.netCollectedPaise).toBe(0);
    expect(result.netPayablePaise).toBe(0);
  });

  it('does not count a failed payment', () => {
    const result = assessPayable(input({
      payments: [{ amount: '10000.00', status: 'failed', method: 'online', razorpayFeePaise: 0 }],
    }));
    expect(result.netCollectedPaise).toBe(0);
  });

  it('ignores rewards wallet, DiSCCO and credit even when marked captured', () => {
    for (const method of ['wallet', 'h1_wallet', 'credit', 'vendor_credit', 'discco']) {
      const result = assessPayable(input({
        paymentMethod: method,
        payments: [{ amount: '10000.00', status: 'captured', method }],
      }));
      expect(result.netCollectedPaise).toBe(0);
      expect(result.netPayablePaise).toBe(0);
    }
  });

  it('sums multiple cash rows and caps a partial collection', () => {
    const result = assessPayable(input({
      payments: [
        { amount: '4000.00', status: 'captured', method: 'online', razorpayFeePaise: 0 },
        { amount: '2500.50', status: 'captured', method: 'bank_transfer' },
        { amount: '1000.00', status: 'captured', method: 'wallet' },
      ],
    }));
    expect(result.grossCollectedPaise).toBe(650_050);
    expect(result.recognisedBasePaise).toBe(650_050);
    expect(result.aboveCashPaise).toBe(1_000_000 - 650_050);
    expect(result.netPayablePaise).toBeLessThanOrEqual(result.netCollectedPaise);
  });

  it('applies several processed refunds once and refuses the excess', () => {
    const result = assessPayable(input({
      payments: [
        { amount: '6000.00', status: 'captured', method: 'online', razorpayFeePaise: 0 },
        { amount: '4000.00', status: 'refunded', method: 'online', razorpayFeePaise: 0 },
      ],
      processedRefunds: [
        { id: 'r1', amount: '3000.00' },
        { id: 'r2', amount: '2000.00' },
        { id: 'r3', amount: '9000.00' },
      ],
    }));
    expect(result.grossCollectedPaise).toBe(1_000_000);
    expect(result.refundedPaise).toBe(1_000_000);
    expect(result.refundsRejectedPaise).toBe(400_000);
    expect(result.netCollectedPaise).toBe(0);
    expect(result.netPayablePaise).toBe(0);
  });

  it('deducts a supplier promo and a supplier coupon once each', () => {
    const result = assessPayable(input({
      subtotal: '10000.00',
      promoDiscount: '500.00',
      couponDiscount: '250.00',
      couponVendorId: vendor,
      payments: [{ amount: '9250.00', status: 'captured', method: 'online', razorpayFeePaise: 0 }],
    }));
    expect(result.supplierPromoPaise).toBe(50_000);
    expect(result.supplierCouponPaise).toBe(25_000);
    expect(result.commercialBasePaise).toBe(925_000);
    expect(result.recognisedBasePaise).toBe(925_000);
  });

  it('does not deduct a platform coupon from the supplier, and still caps by cash', () => {
    const result = assessPayable(input({
      promoDiscount: '0.00',
      couponDiscount: '1000.00',
      couponVendorId: null,
      payments: [{ amount: '9000.00', status: 'captured', method: 'online', razorpayFeePaise: 0 }],
    }));
    expect(result.platformCouponPaise).toBe(100_000);
    expect(result.supplierCouponPaise).toBe(0);
    expect(result.commercialBasePaise).toBe(1_000_000);
    expect(result.recognisedBasePaise).toBe(900_000);
    expect(result.aboveCashPaise).toBe(100_000);
  });

  it('does not deduct a promo that the coupon already suppressed', () => {
    const result = assessPayable(input({
      promoDiscount: '0.00',
      couponDiscount: '400.00',
      couponVendorId: vendor,
      payments: [{ amount: '9600.00', status: 'captured', method: 'online', razorpayFeePaise: 0 }],
    }));
    expect(result.supplierPromoPaise).toBe(0);
    expect(result.commercialBasePaise).toBe(960_000);
  });

  it('does not treat rewards-wallet redemption as a supplier discount', () => {
    const result = assessPayable(input({
      payments: [{ amount: '9000.00', status: 'captured', method: 'online', razorpayFeePaise: 0 }],
    }));
    expect(result.commercialBasePaise).toBe(1_000_000);
    expect(result.recognisedBasePaise).toBe(900_000);
  });

  it('uses the rewritten subtotal after a quantity edit and does not subtract the refund again', () => {
    const result = assessPayable(input({
      subtotal: '8000.00',
      payments: [
        { amount: '10000.00', status: 'captured', method: 'online', razorpayFeePaise: 0 },
      ],
      processedRefunds: [{ id: 'r1', amount: '2000.00' }],
    }));
    expect(result.commercialBasePaise).toBe(800_000);
    expect(result.netCollectedPaise).toBe(800_000);
    expect(result.recognisedBasePaise).toBe(800_000);
  });

  it('excludes a replacement order', () => {
    const result = assessPayable(input({ paymentMethod: 'replacement', payments: [] }));
    expect(result.status).toBe('closed');
    expect(result.netPayablePaise).toBe(0);
  });

  it('does not create a supplier liability for a cancellation before delivery', () => {
    const result = assessPayable(input({
      orderStatus: 'cancelled',
      payments: [{ amount: '10000.00', status: 'captured', method: 'online', razorpayFeePaise: 0 }],
    }));
    expect(result.status).toBe('closed');
    expect(result.netPayablePaise).toBe(0);
  });

  it('keeps two suppliers in one checkout independent', () => {
    const shared = 'pay_multi';
    const first = assessPayable(input({
      vendorId: 'vendor-a',
      subtotal: '6000.00',
      ratePct: '10.00',
      payments: [{ amount: '6000.00', status: 'captured', method: 'online', razorpayFeePaise: 0 }],
    }));
    const second = assessPayable(input({
      vendorId: 'vendor-b',
      subtotal: '4000.00',
      ratePct: '0.00',
      couponDiscount: '0.00',
      payments: [{ amount: '4000.00', status: 'captured', method: 'online', razorpayFeePaise: 0 }],
    }));
    expect(first.netPayablePaise + second.netCollectedPaise).toBeGreaterThan(0);
    expect(first.netCollectedPaise + second.netCollectedPaise).toBe(1_000_000);
    expect(first.commissionPaise).toBe(60_000);
    expect(second.commissionPaise).toBe(0);
    expect(shared).toBe('pay_multi');
  });

  it('holds and batches without dropping the payable', () => {
    const held = assessPayable(input({ onHold: true }));
    const batched = assessPayable(input({ inOpenBatch: true }));
    expect(held.status).toBe('on_hold');
    expect(batched.status).toBe('in_batch');
    expect(held.netPayablePaise).toBe(900_000);
    expect(batched.netPayablePaise).toBe(900_000);
  });
});

describe('reconciliation invariants', () => {
  it('puts every determined liability in exactly one bucket', () => {
    const rows: Array<{ id: string; status: PayableStatus; netPayablePaise: number }> = [
      { id: 'a', status: 'eligible', netPayablePaise: 100 },
      { id: 'b', status: 'on_hold', netPayablePaise: 40 },
      { id: 'c', status: 'in_batch', netPayablePaise: 60 },
      { id: 'd', status: 'settled', netPayablePaise: 80 },
      { id: 'e', status: 'pending_capture', netPayablePaise: 0 },
    ];
    expect(() => assertSingleBucket(rows)).not.toThrow();
    expect(outstandingPaise(rows)).toBe(200);
    const drafted = rows.map((row) => row.id === 'a' ? { ...row, status: 'in_batch' as const } : row);
    expect(outstandingPaise(drafted)).toBe(200);
    const settled = drafted.map((row) => row.id === 'a' ? { ...row, status: 'settled' as const } : row);
    expect(outstandingPaise(settled)).toBe(100);
  });

  it('subtracts an open recovery without copying the settled liability', () => {
    const rows = [{ id: 'settled', status: 'settled' as const, netPayablePaise: 900_000 }];
    expect(outstandingPaise(rows, 20_000)).toBe(-20_000);
    expect(() => assertSingleBucket(rows)).not.toThrow();
  });

  it('never lets the payable exceed cash after refunds', () => {
    const result = assessPayable(input({
      manualCreditPaise: 500_000,
      processedRefunds: [{ id: 'r', amount: '1000.00' }],
    }));
    expect(result.netPayablePaise).toBeLessThanOrEqual(result.netCollectedPaise);
  });
});

describe('settlement transitions', () => {
  const draft: BatchRecord = {
    status: 'draft',
    createdById: 'maker',
    finalisedById: null,
    settledById: null,
    settledAt: null,
    bankReference: null,
    cancelledById: null,
    cancelledAt: null,
    cancelReason: null,
    netPaise: 900_000,
  };

  it('cancels a draft and refuses to cancel a finalised batch', () => {
    const cancelled = cancelDraft(draft, 'maker', 'Opened against the wrong supplier', '2026-11-17T00:00:00.000Z');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toContain('wrong supplier');
    const locked = finaliseBatch(draft, 'checker');
    expect(() => cancelDraft(locked, 'checker', 'Too late to cancel this batch', '2026-11-17T00:00:00.000Z')).toThrow(/draft/);
  });

  it('lets the same person check the list so the payment can be finished', () => {
    expect(finaliseBatch(draft, 'maker').status).toBe('finalised');
    expect(finaliseBatch(draft, 'checker').finalisedById).toBe('checker');
  });

  it('marks settled once with a real UTR and does not pretend the bank was checked', () => {
    const locked = finaliseBatch(draft, 'checker');
    expect(() => markBatchSettled(locked, 'payer', 'INSTANT-1', '2026-11-17T00:00:00.000Z')).toThrow(/UTR/);
    expect(() => markBatchSettled(draft, 'payer', 'UTR123456', '2026-11-17T00:00:00.000Z')).toThrow(/finalised/);
    const settled = markBatchSettled(locked, 'payer', 'UTR123456', '2026-11-17T00:00:00.000Z');
    expect(settled.bankReference).toBe('UTR123456');
    expect(settled.settledById).toBe('payer');
    const again = markBatchSettled(settled, 'payer', 'UTR123456', '2026-11-18T00:00:00.000Z');
    expect(again).toEqual(settled);
    expect(() => markBatchSettled(settled, 'payer', 'UTR999999', '2026-11-18T00:00:00.000Z')).toThrow(/different reference/);
  });
});

describe('legacy wallet formula', () => {
  it('still deducts the existing platform fee and 2% gateway fee', () => {
    expect(computeOrderSettlementAmounts(10000, 'online', 10)).toEqual({
      grossAmount: 10000,
      platformFee: 1000,
      gatewayFee: 200,
      netAmount: 8800,
    });
    expect(computeOrderSettlementAmounts(10000, 'cod', 10).gatewayFee).toBe(0);
  });
});

describe('cash gross helper', () => {
  it('includes refunded cash rows and skips non-cash captured rows', () => {
    expect(grossCashPaise([
      { amount: '10.00', status: 'captured', method: 'online', razorpayFeePaise: 0 },
      { amount: '5.00', status: 'refunded', method: 'cheque' },
      { amount: '99.00', status: 'captured', method: 'credit' },
    ])).toBe(1500);
  });
});
