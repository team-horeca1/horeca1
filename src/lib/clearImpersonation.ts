import { broadcastAuthEvent } from '@/lib/authTabSync';
import { CUSTOMER_NAME_COOKIE } from '@/lib/resolveCustomerImpersonation';

/** Readable (non-httpOnly) name cookies — the only ones JS can see. */
const VENDOR_NAME_COOKIE = 'admin_impersonate_vendor_name';
const BRAND_NAME_COOKIE = 'admin_impersonate_brand_name';

/** Same-tab signal — BroadcastChannel ignores the originating tab. */
export const IMPERSONATION_CHANGED_EVENT = 'horeca-impersonation-changed';

function hasCookie(name: string): boolean {
  if (typeof document === 'undefined') return false;
  return new RegExp(`(?:^|;\\s*)${name}=`).test(document.cookie);
}

function dispatchSameTabImpersonationChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(IMPERSONATION_CHANGED_EVENT));
}

/** Clear all admin impersonation cookies (vendor, brand, customer). */
export async function clearAllAdminImpersonation(): Promise<void> {
  await Promise.allSettled([
    fetch('/api/v1/admin/impersonate', { method: 'DELETE' }),
    fetch('/api/v1/admin/impersonate/brand', { method: 'DELETE' }),
    fetch('/api/v1/admin/impersonate/customer', { method: 'DELETE' }),
  ]);
  broadcastAuthEvent('impersonation-changed');
  dispatchSameTabImpersonationChanged();
}

/** Start/stop helpers call this after setting impersonation cookies. */
export function notifyImpersonationChanged(): void {
  broadcastAuthEvent('impersonation-changed');
  dispatchSameTabImpersonationChanged();
}

/** True when admin is viewing the marketplace as a customer. */
export function isAdminCustomerImpersonationActive(): boolean {
  // Id/BA cookies are httpOnly — only the name cookie is readable by JS.
  return hasCookie(CUSTOMER_NAME_COOKIE);
}

/** True when admin is viewing the vendor portal as a vendor (Admin View). */
export function isAdminVendorImpersonationActive(): boolean {
  return hasCookie(VENDOR_NAME_COOKIE);
}

/** True when any admin impersonation cookie is set (vendor, brand, or customer). */
export function isAnyAdminImpersonationActive(): boolean {
  return (
    hasCookie(VENDOR_NAME_COOKIE)
    || hasCookie(BRAND_NAME_COOKIE)
    || hasCookie(CUSTOMER_NAME_COOKIE)
  );
}
