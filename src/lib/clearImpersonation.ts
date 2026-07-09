import { broadcastAuthEvent } from '@/lib/authTabSync';

/** Clear all admin impersonation cookies (vendor, brand, customer). */
export async function clearAllAdminImpersonation(): Promise<void> {
  await Promise.allSettled([
    fetch('/api/v1/admin/impersonate', { method: 'DELETE' }),
    fetch('/api/v1/admin/impersonate/brand', { method: 'DELETE' }),
    fetch('/api/v1/admin/impersonate/customer', { method: 'DELETE' }),
  ]);
  broadcastAuthEvent('impersonation-changed');
}

/** Start/stop helpers call this after setting impersonation cookies. */
export function notifyImpersonationChanged(): void {
  broadcastAuthEvent('impersonation-changed');
}

/** True when admin is viewing the marketplace as a customer. */
export function isAdminCustomerImpersonationActive(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)admin_impersonate_customer_user_id=/.test(document.cookie);
}

/** True when any admin impersonation cookie is set (vendor, brand, or customer). */
export function isAnyAdminImpersonationActive(): boolean {
  if (typeof document === 'undefined') return false;
  const c = document.cookie;
  return (
    /(?:^|;\s*)admin_impersonate_vendor_id=/.test(c)
    || /(?:^|;\s*)admin_impersonate_brand_id=/.test(c)
    || /(?:^|;\s*)admin_impersonate_customer_user_id=/.test(c)
  );
}
