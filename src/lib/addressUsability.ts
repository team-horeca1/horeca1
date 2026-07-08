/** Shared rules for whether a delivery location is complete enough to order. */

export function isUsablePincode(pincode?: string | null): boolean {
  return !!pincode && /^\d{6}$/.test(pincode);
}

export function hasUsableDeliveryLocation(fields: {
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  if (isUsablePincode(fields.pincode)) return true;
  const lat = fields.latitude;
  const lng = fields.longitude;
  return lat != null && lng != null && lat !== 0 && lng !== 0;
}

export function isUsableSavedAddress(a: {
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  return hasUsableDeliveryLocation(a);
}

const ADDR_GATE_SKIP_PREFIX = 'horeca1_skip_addr_gate_';

export function readAddressGateSkipped(userId: string): boolean {
  try {
    return sessionStorage.getItem(`${ADDR_GATE_SKIP_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

export function writeAddressGateSkipped(userId: string): void {
  try {
    sessionStorage.setItem(`${ADDR_GATE_SKIP_PREFIX}${userId}`, '1');
  } catch {
    /* ignore */
  }
}

export const ACCOUNTS_REFRESH_EVENT = 'horeca1:accounts-refresh';

export function notifyAccountsRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACCOUNTS_REFRESH_EVENT));
}
