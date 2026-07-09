/**
 * User-scoped localStorage keys — prevents cart/wishlist/address bleed when
 * multiple users share a browser (login/logout or multi-tab user change).
 */

export const GUEST_STORAGE_SUFFIX = 'guest';

/** Cart mirror key — include BA + outlet so switches don't bleed local cache. */
export function cartStorageKey(
  userId?: string | null,
  businessAccountId?: string | null,
  outletId?: string | null,
): string {
  if (!userId) return 'horeca_cart:guest';
  if (businessAccountId && outletId) {
    return `horeca_cart:${userId}:${businessAccountId}:${outletId}`;
  }
  // Fallback while session still hydrating BA/outlet
  return `horeca_cart:${userId}`;
}

export function wishlistStorageKey(userId?: string | null): string {
  return userId ? `horeca_wishlist:${userId}` : 'horeca_wishlist:guest';
}

export function addressSelectedKey(userId?: string | null): string {
  return userId ? `horeca1_selected_address:${userId}` : 'horeca1_selected_address:guest';
}

export function addressSavedKey(userId?: string | null): string {
  return userId ? `horeca1_saved_addresses:${userId}` : 'horeca1_saved_addresses:guest';
}

/** Migrate legacy unscoped keys once into the guest bucket. */
export function migrateLegacyKey(legacyKey: string, scopedGuestKey: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(scopedGuestKey)) return;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      localStorage.setItem(scopedGuestKey, legacy);
      localStorage.removeItem(legacyKey);
    }
  } catch {
    /* ignore */
  }
}

export function clearUserClientStores(userId?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (userId) {
      localStorage.removeItem(cartStorageKey(userId));
      localStorage.removeItem(wishlistStorageKey(userId));
      localStorage.removeItem(addressSelectedKey(userId));
      localStorage.removeItem(addressSavedKey(userId));
      // BA/outlet-scoped cart mirrors: horeca_cart:<userId>:<baId>:<outletId>
      const prefix = `horeca_cart:${userId}:`;
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(prefix)) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    }
    localStorage.removeItem('horeca_cart');
    localStorage.removeItem('wishlist');
    localStorage.removeItem('horeca1_selected_address');
    localStorage.removeItem('horeca1_saved_addresses');
    localStorage.removeItem('horeca_order_lists_all');
    localStorage.removeItem('horeca_orders');
    localStorage.removeItem('horeca_recently_viewed');
  } catch {
    /* ignore */
  }
  try {
    document.cookie = 'h1_addr=; path=/; max-age=0; SameSite=Lax';
  } catch {
    /* ignore */
  }
}
