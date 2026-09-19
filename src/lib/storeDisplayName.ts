/** Customer-facing Online Store label (falls back to legal/business name). */
export function storeDisplayName(v: {
  displayName?: string | null;
  businessName?: string | null;
}): string {
  return (v.displayName?.trim() || v.businessName?.trim() || '').trim();
}
