/** Clear all admin impersonation cookies (vendor, brand, customer). */
export async function clearAllAdminImpersonation(): Promise<void> {
  await Promise.allSettled([
    fetch('/api/v1/admin/impersonate', { method: 'DELETE' }),
    fetch('/api/v1/admin/impersonate/brand', { method: 'DELETE' }),
    fetch('/api/v1/admin/impersonate/customer', { method: 'DELETE' }),
  ]);
}

/** True when admin is viewing the marketplace as a customer. */
export function isAdminCustomerImpersonationActive(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)admin_impersonate_customer_user_id=/.test(document.cookie);
}
