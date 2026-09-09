/** Per-customer checkout modes stored on VendorCustomer.allowedPaymentModes. */
export const VENDOR_CUSTOMER_PAYMENT_MODES = [
  'cod',
  'prepaid',
  'credit',
  'cheque',
  'discco',
  'online',
  'bank_transfer',
  'po_number',
] as const;

export type VendorCustomerPaymentMode = (typeof VENDOR_CUSTOMER_PAYMENT_MODES)[number];

/** CRM default when creating a mapping. Bank Transfer / PO stay off until the vendor ticks them. */
export const DEFAULT_VENDOR_CUSTOMER_PAYMENT_MODES: VendorCustomerPaymentMode[] = [
  'cod',
  'prepaid',
  'credit',
  'cheque',
];

/** Checkout fallback when this vendor has no mapping for the buyer. */
export const DEFAULT_CHECKOUT_PAYMENT_MODES: string[] = [
  'cod',
  'prepaid',
  'credit',
  'cheque',
  'online',
];

export function setAllowedOfflineModes(
  current: string[] | undefined,
  opts: { bankTransfer: boolean; poNumber: boolean },
): string[] {
  const next = [...(current?.length ? current : DEFAULT_VENDOR_CUSTOMER_PAYMENT_MODES)].filter(
    (m) => m !== 'bank_transfer' && m !== 'po_number',
  );
  if (opts.bankTransfer) next.push('bank_transfer');
  if (opts.poNumber) next.push('po_number');
  return next;
}

export function hasPaymentMode(modes: string[] | undefined, mode: 'bank_transfer' | 'po_number'): boolean {
  return !!modes?.includes(mode);
}
