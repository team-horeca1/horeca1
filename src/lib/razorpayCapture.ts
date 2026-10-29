import { getRazorpay } from '@/lib/razorpay';

/**
 * Razorpay auto-refunds an authorized payment that is still uncaptured when
 * manual_expiry_period elapses. 7200 minutes is the documented maximum (5 days).
 */
export const RAZORPAY_MANUAL_EXPIRY_MINUTES = 7200;
export const RAZORPAY_CAPTURE_WINDOW_MS = RAZORPAY_MANUAL_EXPIRY_MINUTES * 60 * 1000;

/**
 * 3 days (3 × 24 × 60 minutes). Matches the account owner's dashboard
 * automatic-capture window. Order-level settings override the dashboard, so
 * 12 minutes would replace that window: a late authorization (bank status
 * arriving after 12 minutes) would not be auto-captured by Razorpay.
 * The API minimum is 12 minutes. 4320 stays under the 7200-minute manual maximum,
 * so Razorpay auto-captures inside 3 days and we can still capture by API until 5 days.
 */
export const RAZORPAY_AUTOMATIC_EXPIRY_MINUTES = 3 * 24 * 60;

/**
 * Order-level capture settings. These override the Razorpay dashboard.
 *
 * refund_speed: the Orders API parameter text lists only `normal`. Every
 * official sample on the same page (curl, Java, Python, PHP, Ruby, Node, C#,
 * Go) sends `optimum`, and razorpay@2.9.6 types the field as
 * `'optimum' | 'normal'`. We send `optimum` because that is the value in the
 * request samples the SDK was built against, not because the prose list is empty.
 *
 * https://razorpay.com/docs/payments/payments/capture-settings/api
 */
export function razorpayOrderCaptureFields() {
  return {
    payment: {
      capture: 'automatic' as const,
      capture_options: {
        automatic_expiry_period: RAZORPAY_AUTOMATIC_EXPIRY_MINUTES,
        manual_expiry_period: RAZORPAY_MANUAL_EXPIRY_MINUTES,
        refund_speed: 'optimum' as const,
      },
    },
  };
}

export function auditApplyRequested(argv: readonly string[]): boolean {
  return argv.includes('--apply');
}

/**
 * Default audit mode is report-only. --apply may capture a payment Razorpay
 * still has as authorized, or record a refund. It must never capture a refund.
 */
export function auditMutation(status: string, apply: boolean): 'none' | 'capture' | 'mark_refunded' {
  if (!apply) return 'none';
  if (status === 'authorized') return 'capture';
  if (status === 'refunded') return 'mark_refunded';
  return 'none';
}

export interface CapturedRazorpayPayment {
  id: string;
  status: 'captured';
  amount: number;
  method: string | null;
}

/** Signature is valid, but Razorpay has not captured yet. Do not mark the order paid. */
export class CapturePendingError extends Error {
  readonly code = 'CAPTURE_PENDING' as const;
  constructor(
    message = 'Payment is authorized and capture has not completed. We will confirm it shortly. Do not pay again.',
  ) {
    super(message);
    this.name = 'CapturePendingError';
  }
}

/** Razorpay will not capture this payment (failed, refunded, or amount mismatch). */
export class PaymentNotCapturedError extends Error {
  readonly code = 'PAYMENT_NOT_CAPTURED' as const;
  constructor(
    readonly gatewayStatus: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentNotCapturedError';
  }
}

interface GatewayPayment {
  id: string;
  status: string;
  amount: number | string;
  currency?: string;
  method?: string | null;
}

function asPaise(amount: number | string): number {
  const n = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function gatewayErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const body = err as {
      message?: string;
      description?: string;
      error?: { description?: string; reason?: string };
    };
    return body.error?.description || body.error?.reason || body.description || body.message || '';
  }
  return String(err);
}

function isAlreadyCapturedError(err: unknown): boolean {
  return /already been captured/i.test(gatewayErrorText(err));
}

function toCaptured(payment: GatewayPayment): CapturedRazorpayPayment {
  return {
    id: payment.id,
    status: 'captured',
    amount: asPaise(payment.amount),
    method: payment.method ?? null,
  };
}

/**
 * Fetch the payment from Razorpay and capture it if it is only authorized.
 * Returns only when Razorpay's status is `captured` for the expected amount.
 */
export async function ensurePaymentCaptured(
  paymentId: string,
  expectedPaise: number,
): Promise<CapturedRazorpayPayment> {
  const expected = Math.round(expectedPaise);
  const rz = getRazorpay();
  const fetched = await rz.payments.fetch(paymentId) as GatewayPayment;
  if (fetched.currency !== 'INR') {
    throw new PaymentNotCapturedError(
      fetched.status,
      `Payment currency must be INR, Razorpay has ${fetched.currency ?? 'none'}`,
    );
  }
  const amount = asPaise(fetched.amount);
  if (amount !== expected) {
    throw new PaymentNotCapturedError(
      fetched.status,
      `Payment amount mismatch: expected ${expected} paise, Razorpay has ${amount}`,
    );
  }

  if (fetched.status === 'captured') return toCaptured(fetched);

  if (fetched.status === 'failed' || fetched.status === 'refunded') {
    throw new PaymentNotCapturedError(
      fetched.status,
      `Payment is ${fetched.status} and cannot be marked paid`,
    );
  }

  if (fetched.status !== 'authorized') {
    throw new CapturePendingError();
  }

  try {
    const captured = await rz.payments.capture(paymentId, expected, 'INR') as GatewayPayment;
    if (
      captured.status === 'captured'
      && captured.currency === 'INR'
      && asPaise(captured.amount) === expected
    ) {
      return toCaptured(captured);
    }
    throw new CapturePendingError();
  } catch (err) {
    if (err instanceof CapturePendingError || err instanceof PaymentNotCapturedError) throw err;
    if (isAlreadyCapturedError(err)) {
      const again = await rz.payments.fetch(paymentId) as GatewayPayment;
      if (again.status === 'captured' && again.currency === 'INR' && asPaise(again.amount) === expected) {
        return toCaptured(again);
      }
    }
    throw new CapturePendingError();
  }
}
