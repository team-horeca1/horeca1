import { commissionPaise, rupeesToPaise } from '@/modules/finance/money';

export const CASH_METHODS = new Set([
  'online',
  'prepaid',
  'razorpay',
  'bank_transfer',
  'po_number',
  'cheque',
  'cod',
  'cash',
]);

export const NON_CASH_METHODS = new Set([
  'wallet',
  'h1_wallet',
  'credit',
  'vendor_credit',
  'discco',
  'replacement',
]);

export type PayableStatus =
  | 'pending_capture'
  | 'awaiting_completion'
  | 'commission_unconfigured'
  | 'fee_unknown'
  | 'eligible'
  | 'on_hold'
  | 'in_batch'
  | 'settled'
  | 'closed';

export type LiabilityBucket = 'eligible' | 'held' | 'batched' | 'settled';

export const GATEWAY_METHODS = new Set(['online', 'prepaid', 'razorpay']);

export interface CashPaymentInput {
  amount: string;
  status: string;
  method: string | null;
  /** Null means Razorpay did not return a fee. Absent on non-gateway payments. */
  razorpayFeePaise?: number | null;
  hasRazorpayPayment?: boolean;
}

export interface ProcessedRefundInput {
  id: string;
  amount: string;
}

export interface PayableAssessmentInput {
  orderStatus: string;
  paymentMethod: string | null;
  vendorId: string;
  subtotal: string;
  promoDiscount: string;
  couponDiscount: string;
  couponVendorId: string | null;
  payments: CashPaymentInput[];
  /** Successful refunds only. The caller drops pending, rejected, and credit notes. */
  processedRefunds: ProcessedRefundInput[];
  /** Null means the supplier rate is not configured. "0" or "0.00" is an explicit zero. */
  ratePct: string | null;
  onHold: boolean;
  /** Open finance batch, not a settled or cancelled one. */
  inOpenBatch: boolean;
  manualCreditPaise?: number;
  manualDebitPaise?: number;
}

export interface PayableAssessment {
  status: PayableStatus;
  bucket: LiabilityBucket | null;
  commercialBasePaise: number;
  grossCollectedPaise: number;
  refundedPaise: number;
  refundsRejectedPaise: number;
  netCollectedPaise: number;
  recognisedBasePaise: number;
  provisionalBasePaise: number;
  commissionPaise: number;
  provisionalCommissionPaise: number;
  netPayablePaise: number;
  razorpayFeePaise: number;
  razorpayFeeUnknown: boolean;
  blockedSalePaise: number;
  aboveCashPaise: number;
  supplierPromoPaise: number;
  supplierCouponPaise: number;
  platformCouponPaise: number;
  ratePct: string | null;
  taxTreatment: 'tax_inclusive_subtotal_pending_client_confirmation';
}

export function isCashMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  const normalised = method.trim().toLowerCase();
  if (NON_CASH_METHODS.has(normalised)) return false;
  return CASH_METHODS.has(normalised);
}

export function razorpayFeeFromPayments(payments: CashPaymentInput[]): { feePaise: number; unknown: boolean } {
  let feePaise = 0;
  let unknown = false;
  for (const payment of payments) {
    if (payment.status !== 'captured' && payment.status !== 'refunded') continue;
    if (!isCashMethod(payment.method)) continue;
    const method = (payment.method ?? '').toLowerCase();
    const gateway = GATEWAY_METHODS.has(method) || payment.hasRazorpayPayment === true;
    if (!gateway) continue;
    if (payment.razorpayFeePaise == null) unknown = true;
    else feePaise += Math.max(0, payment.razorpayFeePaise);
  }
  return { feePaise, unknown };
}

export function grossCashPaise(payments: CashPaymentInput[]): number {
  return payments.reduce((sum, payment) => {
    if (payment.status !== 'captured' && payment.status !== 'refunded') return sum;
    if (!isCashMethod(payment.method)) return sum;
    return sum + Math.max(0, rupeesToPaise(payment.amount));
  }, 0);
}

export function processedRefundPaise(refunds: ProcessedRefundInput[], grossPaise: number): {
  appliedPaise: number;
  rejectedPaise: number;
} {
  const requested = refunds.reduce((sum, refund) => sum + Math.max(0, rupeesToPaise(refund.amount)), 0);
  const appliedPaise = Math.min(requested, Math.max(0, grossPaise));
  return { appliedPaise, rejectedPaise: Math.max(0, requested - appliedPaise) };
}

export function liabilityBucket(status: PayableStatus): LiabilityBucket | null {
  switch (status) {
    case 'eligible':
      return 'eligible';
    case 'on_hold':
      return 'held';
    case 'in_batch':
      return 'batched';
    case 'settled':
      return 'settled';
    default:
      return null;
  }
}

export function outstandingPaise(
  rows: Array<{ status: PayableStatus; netPayablePaise: number }>,
  unappliedRecoveryPaise = 0,
): number {
  const open = rows.reduce((sum, row) => {
    const bucket = liabilityBucket(row.status);
    if (bucket == null || bucket === 'settled') return sum;
    return sum + row.netPayablePaise;
  }, 0);
  return open - Math.max(0, unappliedRecoveryPaise);
}

export function assertSingleBucket(rows: Array<{ id: string; status: PayableStatus }>): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) {
      throw new Error(`Liability ${row.id} appears more than once`);
    }
    seen.add(row.id);
    const bucket = liabilityBucket(row.status);
    if (bucket == null) continue;
    const buckets = (['eligible', 'held', 'batched', 'settled'] as const).filter(
      (name) => liabilityBucket(row.status) === name,
    );
    if (buckets.length !== 1) {
      throw new Error(`Liability ${row.id} is not in exactly one bucket`);
    }
  }
}

export function assessPayable(input: PayableAssessmentInput): PayableAssessment {
  const supplierPromoPaise = Math.max(0, rupeesToPaise(input.promoDiscount));
  const couponPaise = Math.max(0, rupeesToPaise(input.couponDiscount));
  const supplierFundedCoupon = input.couponVendorId != null && input.couponVendorId === input.vendorId;
  const supplierCouponPaise = supplierFundedCoupon ? couponPaise : 0;
  const platformCouponPaise = supplierFundedCoupon ? 0 : couponPaise;
  const commercialBasePaise = Math.max(
    0,
    rupeesToPaise(input.subtotal) - supplierPromoPaise - supplierCouponPaise,
  );
  const grossCollectedPaise = grossCashPaise(input.payments);
  const refunds = processedRefundPaise(input.processedRefunds, grossCollectedPaise);
  const netCollectedPaise = Math.max(0, grossCollectedPaise - refunds.appliedPaise);
  const cashCappedBase = Math.min(commercialBasePaise, netCollectedPaise);
  const delivered = input.orderStatus === 'delivered';
  const cancelledBeforeDelivery = input.orderStatus === 'cancelled' && !delivered;
  const replacement = (input.paymentMethod ?? '').toLowerCase() === 'replacement';
  const aboveCashPaise = delivered ? Math.max(0, commercialBasePaise - netCollectedPaise) : 0;
  const provisionalBasePaise = !delivered && !cancelledBeforeDelivery && !replacement
    ? cashCappedBase
    : 0;

  const empty: PayableAssessment = {
    status: 'closed',
    bucket: null,
    commercialBasePaise,
    grossCollectedPaise,
    refundedPaise: refunds.appliedPaise,
    refundsRejectedPaise: refunds.rejectedPaise,
    netCollectedPaise,
    recognisedBasePaise: 0,
    provisionalBasePaise,
    commissionPaise: 0,
    provisionalCommissionPaise: input.ratePct == null ? 0 : commissionPaise(provisionalBasePaise, input.ratePct),
    netPayablePaise: 0,
    razorpayFeePaise: 0,
    razorpayFeeUnknown: false,
    blockedSalePaise: 0,
    aboveCashPaise,
    supplierPromoPaise,
    supplierCouponPaise,
    platformCouponPaise,
    ratePct: input.ratePct,
    taxTreatment: 'tax_inclusive_subtotal_pending_client_confirmation',
  };

  if (replacement || cancelledBeforeDelivery) return empty;

  if (!delivered) {
    return {
      ...empty,
      status: netCollectedPaise > 0 ? 'awaiting_completion' : 'pending_capture',
    };
  }

  if (input.ratePct == null) {
    return {
      ...empty,
      status: 'commission_unconfigured',
      blockedSalePaise: cashCappedBase,
    };
  }

  if (netCollectedPaise <= 0) {
    return { ...empty, status: 'pending_capture' };
  }

  const recognisedBasePaise = netCollectedPaise;
  const fee = razorpayFeeFromPayments(input.payments);
  const commission = commissionPaise(recognisedBasePaise, input.ratePct);
  if (fee.unknown) {
    return {
      ...empty,
      status: 'fee_unknown',
      recognisedBasePaise,
      commissionPaise: commission,
      razorpayFeeUnknown: true,
      netPayablePaise: 0,
    };
  }
  const rawNet = recognisedBasePaise
    - fee.feePaise
    - commission
    + (input.manualCreditPaise ?? 0)
    - (input.manualDebitPaise ?? 0);
  const netPayablePaise = Math.min(rawNet, netCollectedPaise);

  let status: PayableStatus = 'eligible';
  if (netPayablePaise <= 0) status = 'closed';
  else if (input.onHold) status = 'on_hold';
  else if (input.inOpenBatch) status = 'in_batch';

  return {
    ...empty,
    status,
    bucket: liabilityBucket(status),
    recognisedBasePaise,
    commissionPaise: commission,
    razorpayFeePaise: fee.feePaise,
    razorpayFeeUnknown: false,
    provisionalCommissionPaise: 0,
    netPayablePaise: status === 'closed' ? 0 : netPayablePaise,
  };
}
