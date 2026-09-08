export const OFFLINE_PAYMENT_METHODS = ['bank_transfer', 'po_number', 'cheque'] as const;

export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

export const RAZORPAY_INITIATABLE_METHODS = ['online', ...OFFLINE_PAYMENT_METHODS] as const;

export function isOfflinePaymentMethod(method: string | null | undefined): boolean {
  return !!method && (OFFLINE_PAYMENT_METHODS as readonly string[]).includes(method);
}

export function canInitiateRazorpay(method: string | null | undefined): boolean {
  return !!method && (RAZORPAY_INITIATABLE_METHODS as readonly string[]).includes(method);
}
