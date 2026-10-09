/**
 * Operational customer display: store / outlet first, then company, then the person.
 * Orders, returns, and the warehouse need the store the order is for.
 */
export function personFirstCustomerLabel(input: {
  fullName?: string | null;
  businessName?: string | null;
  outletName?: string | null;
  fallback?: string;
}): string {
  const outletName = input.outletName?.trim();
  if (outletName) return outletName;
  const businessName = input.businessName?.trim();
  if (businessName) return businessName;
  const fullName = input.fullName?.trim();
  if (fullName) return fullName;
  return input.fallback ?? 'Customer';
}
