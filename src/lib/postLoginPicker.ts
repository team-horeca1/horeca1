/**
 * Post-login navigation helpers.
 *
 * Account-picker UI was removed — after sign-in we land on an explicit
 * redirect (when safe) or the portal default for the active account type.
 * Legacy force-picker cookie / dismiss helpers remain so old cookies and
 * sessionStorage keys can still be cleared.
 */

import { getSession } from 'next-auth/react';
import { broadcastAuthEvent } from '@/lib/authTabSync';
import { defaultPortalPath, type AccountPortalCaps } from '@/lib/portalRouting';

export const FORCE_PICKER_COOKIE = 'horeca_force_account_picker';
export const PENDING_REDIRECT_KEY = 'horeca_pending_post_login_redirect';
export const DISMISS_KEY = 'horeca_post_login_selector_dismissed';

export function readForcePickerCookie(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.cookie.split(';').some((c) => c.trim().startsWith(`${FORCE_PICKER_COOKIE}=1`));
  } catch {
    return false;
  }
}

export function clearForcePickerCookie(): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${FORCE_PICKER_COOKIE}=; path=/; max-age=0`;
  } catch {
    /* ignore */
  }
}

export function clearDismissFlag(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

export function sanitizeRedirect(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
}

/**
 * Prefer an explicit safe redirect; otherwise role/portal default.
 * Admin role wins over inherited shopping BA caps (isCustomer) so admins
 * never land on the marketplace homepage by accident.
 */
export function resolvePostLoginDestination(
  redirectTo: string | null | undefined,
  caps: AccountPortalCaps | null | undefined,
  role?: string | null,
): string {
  const safe = sanitizeRedirect(redirectTo);
  if (safe) return safe;
  if (role === 'admin') return '/admin/dashboard';
  if (caps) return defaultPortalPath(caps);
  return '/';
}

function capsFromSessionUser(user: {
  role?: string;
  activeBusinessAccountType?: AccountPortalCaps | null;
} | null | undefined): AccountPortalCaps | null {
  // Never derive portal caps from BA for admins — they inherit a shopping BA.
  if (user?.role === 'admin') return null;
  if (user?.activeBusinessAccountType) return user.activeBusinessAccountType;
  const role = user?.role;
  if (role === 'vendor') return { isCustomer: false, isVendor: true, isBrand: false };
  if (role === 'brand') return { isCustomer: false, isVendor: false, isBrand: true };
  if (role === 'customer') return { isCustomer: true, isVendor: false, isBrand: false };
  return null;
}

/** Called after OTP/password sign-in on the login page. */
export async function prepareFreshLoginNavigation(redirectTo: string | null): Promise<void> {
  clearDismissFlag();
  clearForcePickerCookie();
  try {
    sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  } catch {
    /* ignore */
  }
  broadcastAuthEvent('session-changed');

  let session = await getSession();
  // Cookie/JWT can lag a tick right after signIn — retry once before falling back to /.
  if (!session?.user) {
    await new Promise((r) => setTimeout(r, 150));
    session = await getSession();
  }
  const role = session?.user?.role ?? null;
  const caps = capsFromSessionUser(session?.user ?? null);
  window.location.href = resolvePostLoginDestination(redirectTo, caps, role);
}

/** Clear any leftover picker state after overlay / in-page login. */
export function clearPostLoginPickerState(): void {
  clearDismissFlag();
  clearForcePickerCookie();
  broadcastAuthEvent('session-changed');
}
