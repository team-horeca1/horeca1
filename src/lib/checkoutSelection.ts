/**
 * Persist which vendor POs the shopper skipped so cart → checkout (and back)
 * keep the same selection. Stored as excluded vendor ids in sessionStorage.
 */

const KEY = 'horeca_checkout_excluded_vendors';

function readRaw(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export function getExcludedVendorIds(): string[] {
  return readRaw();
}

export function setExcludedVendorIds(ids: Iterable<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const unique = [...new Set(ids)];
    if (unique.length === 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(unique));
  } catch {
    /* quota / private mode */
  }
}

export function clearExcludedVendorIds(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Drop exclusions for vendors no longer in the cart. */
export function pruneExcludedVendorIds(cartVendorIds: string[]): string[] {
  const cart = new Set(cartVendorIds);
  const next = readRaw().filter((id) => cart.has(id));
  setExcludedVendorIds(next);
  return next;
}

export function selectedVendorsFromExclusions(
  cartVendorIds: string[],
  excluded: Iterable<string>,
): Set<string> {
  const skip = new Set(excluded);
  return new Set(cartVendorIds.filter((id) => !skip.has(id)));
}
