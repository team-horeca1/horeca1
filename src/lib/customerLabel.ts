/**
 * Operational customer display: person name first, then company / outlet.
 * Use on Orders, Returns, Fulfilment, Warehouse — not B2B directory lists.
 */
export function personFirstCustomerLabel(input: {
  fullName?: string | null;
  businessName?: string | null;
  outletName?: string | null;
  fallback?: string;
}): string {
  const fullName = input.fullName?.trim();
  if (fullName) return fullName;
  const businessName = input.businessName?.trim();
  if (businessName) return businessName;
  const outletName = input.outletName?.trim();
  if (outletName) return outletName;
  return input.fallback ?? 'Customer';
}
