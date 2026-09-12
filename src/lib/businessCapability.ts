/**
 * One business, one capability.
 *
 * Buyer  = restaurant / retail (isCustomer only) — the only type that can purchase
 * Supplier = online stores (isVendor only) — browse storefront like a guest
 * Brand = catalogues / mapping (isBrand only) — browse storefront like a guest
 */

export type BusinessKind = 'customer' | 'vendor' | 'brand';

export type AccountPortalCaps = {
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
};

export function flagsForKind(kind: BusinessKind): AccountPortalCaps {
  if (kind === 'vendor') return { isCustomer: false, isVendor: true, isBrand: false };
  if (kind === 'brand') return { isCustomer: false, isVendor: false, isBrand: true };
  return { isCustomer: true, isVendor: false, isBrand: false };
}

/** Vendor wins, then brand — mixed legacy rows are treated as their operational type. */
export function kindFromFlags(caps: Partial<AccountPortalCaps> | null | undefined): BusinessKind {
  if (caps?.isVendor) return 'vendor';
  if (caps?.isBrand) return 'brand';
  return 'customer';
}

export function isBuyerOnly(caps: Partial<AccountPortalCaps> | null | undefined): boolean {
  return caps?.isCustomer === true && caps?.isVendor !== true && caps?.isBrand !== true;
}

/** Admins may purchase while impersonating. Everyone else needs an active buyer-only business. */
export function canPurchaseAs(
  caps: Partial<AccountPortalCaps> | null | undefined,
  role?: string | null,
): boolean {
  if (role === 'admin') return true;
  return isBuyerOnly(caps);
}

export function businessKindLabel(kind: BusinessKind): string {
  if (kind === 'vendor') return 'Supplier';
  if (kind === 'brand') return 'Brand';
  return 'Restaurant / Retail';
}

/** Supplier landing: pick a business / enter an Online Store — not the KPI dashboard. */
export const SUPPLIER_HUB_PATH = '/businesses?type=supplier';

export function supplierLandingPath(businessAccountId?: string | null): string {
  if (businessAccountId) return `/vendor/businesses/${businessAccountId}`;
  return SUPPLIER_HUB_PATH;
}

/** Supplier "Dashboard": one business → its stores; several → the picker. */
export function supplierDashboardPath(
  supplierBusinessIds: Array<string | null | undefined>,
): string {
  const ids = supplierBusinessIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 1) return supplierLandingPath(ids[0]);
  return SUPPLIER_HUB_PATH;
}

export function defaultPortalPath(account: AccountPortalCaps): string {
  if (account.isVendor) return SUPPLIER_HUB_PATH;
  if (account.isBrand) return '/brand/portal';
  return '/';
}

export function nextPathForKind(kind: BusinessKind, businessAccountId?: string): string {
  if (kind === 'vendor') return supplierLandingPath(businessAccountId);
  if (kind === 'brand') return '/brand/portal';
  return businessAccountId ? `/businesses/${businessAccountId}` : '/businesses';
}

export const PURCHASE_BLOCKED_MESSAGE =
  'Switch to a restaurant or retail business to order. Supplier and Brand accounts can only browse.';

export const GUEST_PURCHASE_MESSAGE =
  'Log in with a restaurant or retail business to order.';

export type PurchaseAccess = {
  allowed: boolean;
  message: string;
  ctaLabel: string;
  href: string;
};

export function describePurchaseAccess(input: {
  isLoggedIn: boolean;
  role?: string | null;
  active?: Partial<AccountPortalCaps> | null;
  accounts?: Array<Partial<AccountPortalCaps>> | null;
}): PurchaseAccess {
  if (input.role === 'admin') {
    return { allowed: true, message: '', ctaLabel: 'Add', href: '' };
  }
  if (!input.isLoggedIn) {
    return {
      allowed: false,
      message: GUEST_PURCHASE_MESSAGE,
      ctaLabel: 'Log in to order',
      href: '/login',
    };
  }
  if (canPurchaseAs(input.active, input.role)) {
    return { allowed: true, message: '', ctaLabel: 'Add', href: '' };
  }
  const hasBuyer = (input.accounts ?? []).some((a) => isBuyerOnly(a));
  if (hasBuyer) {
    return {
      allowed: false,
      message: PURCHASE_BLOCKED_MESSAGE,
      ctaLabel: 'Switch to restaurant to order',
      href: '/businesses',
    };
  }
  return {
    allowed: false,
    message: PURCHASE_BLOCKED_MESSAGE,
    ctaLabel: 'Add a restaurant business to order',
    href: '/businesses?add=buyer',
  };
}
