import { CDL } from '@/lib/cdl';

export interface RazorpaySuccessPayload {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
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
    const rzp = new window.Razorpay({
      key: opts.key,
      amount: opts.amount,
      currency: opts.currency,
      order_id: opts.order_id,
      name: 'HoReCa Hub',
      description: opts.description,
      theme: { color: CDL.primary },
      handler: (response: RazorpaySuccessPayload) => resolve(response),
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    rzp.open();
  });
}
