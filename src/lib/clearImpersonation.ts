import { broadcastAuthEvent } from '@/lib/authTabSync';

/** Readable (non-httpOnly) cookies — the only ones JS can see. */
const VENDOR_NAME_COOKIE = 'admin_impersonate_vendor_name';
const BRAND_NAME_COOKIE = 'admin_impersonate_brand_name';
const CUSTOMER_NAME_COOKIE = 'admin_impersonate_customer_name';
const BUYER_NAME_COOKIE = 'admin_impersonate_buyer_name';
const BUYER_MODE_COOKIE = 'admin_impersonate_buyer_mode';

export type ImpersonationMode = 'customer' | 'vendor' | 'brand';

/** Same-tab signal — BroadcastChannel ignores the originating tab. */
export const IMPERSONATION_CHANGED_EVENT = 'horeca-impersonation-changed';

function hasCookie(name: string): boolean {
  if (typeof document === 'undefined') return false;
  return new RegExp(`(?:^|;\\s*)${name}=`).test(document.cookie);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!match?.[1]) return null;
  let value = match[1];
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return value;
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

/** True when admin is shopping the storefront as a buyer (any mode). */
export function isAdminBuyerImpersonationActive(): boolean {
  return hasCookie(BUYER_NAME_COOKIE) || hasCookie(CUSTOMER_NAME_COOKIE);
}

export function readImpersonationMode(): ImpersonationMode | null {
  const mode = readCookie(BUYER_MODE_COOKIE);
  if (mode === 'vendor' || mode === 'brand' || mode === 'customer') return mode;
  if (hasCookie(CUSTOMER_NAME_COOKIE)) return 'customer';
  if (hasCookie(VENDOR_NAME_COOKIE)) return 'vendor';
  if (hasCookie(BRAND_NAME_COOKIE)) return 'brand';
  return null;
}

export function readImpersonationBuyerName(): string | null {
  return readCookie(BUYER_NAME_COOKIE) || readCookie(CUSTOMER_NAME_COOKIE);
}

/** True when admin is viewing the marketplace as a customer (customer-mode only). */
export function isAdminCustomerImpersonationActive(): boolean {
  return readImpersonationMode() === 'customer';
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
    || hasCookie(BUYER_NAME_COOKIE)
  );
}
