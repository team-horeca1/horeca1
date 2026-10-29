import { CDL } from '@/lib/cdl';

export interface RazorpaySuccessPayload {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export function isRazorpayUserCancel(err: unknown): boolean {
  return err instanceof Error && /cancelled|canceled|dismiss|closed/i.test(err.message);
}

/**
 * Abandon the checkout only when verify failed for a reason that means the
 * bank did not hold the money. CAPTURE_PENDING / PAYMENT_NOT_CAPTURED must
 * stay pending so reconciliation can finish or record the refund.
 */
export function shouldAbandonAfterVerifyFailure(errorCode: string | undefined): boolean {
  return errorCode !== 'CAPTURE_PENDING' && errorCode !== 'PAYMENT_NOT_CAPTURED';
}

export function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && typeof window.Razorpay !== 'undefined') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.body.appendChild(script);
  });
}

export function openRazorpayPopup(opts: {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  description: string;
}): Promise<RazorpaySuccessPayload> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const rzp = new window.Razorpay({
      key: opts.key,
      amount: opts.amount,
      currency: opts.currency,
      order_id: opts.order_id,
      name: 'Horeca1',
      description: opts.description,
      theme: { color: CDL.primary },
      // Partner/dashboard offers (Cred UPI etc.) can fail checkout with
      // "Offers-engine external offer not found" — especially in Test Mode.
      // Pair with order-level `offers: []` in payment.service.
      display: { offers: false },
      handler: (response: RazorpaySuccessPayload) => settle(() => resolve(response)),
      modal: {
        ondismiss: () => settle(() => reject(new Error('Payment cancelled'))),
      },
    });

    // Without this, a failed in-modal attempt can leave the Promise hanging
    // forever (spinner never clears) if ondismiss does not fire.
    rzp.on('payment.failed', (response: { error?: { description?: string; reason?: string } }) => {
      const detail =
        response?.error?.description ||
        response?.error?.reason ||
        'Payment failed';
      settle(() => reject(new Error(detail)));
    });

    rzp.open();
  });
}
