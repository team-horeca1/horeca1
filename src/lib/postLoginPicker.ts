/**
 * Fresh-login account picker — cookie + sessionStorage coordination.
 *
 * sessionStorage dismiss alone survives logout/login in the same tab; the
 * short-lived force-pick cookie is set on sign-in (server + client) so every
 * fresh login with 2+ business accounts must pick before redirect.
 */

import { getSession } from 'next-auth/react';
import { broadcastAuthEvent } from '@/lib/authTabSync';
import { defaultPortalPath, type AccountPortalCaps } from '@/lib/portalRouting';
import { setEnteredStore } from '@/lib/supplierPortalLevel';

export const FORCE_PICKER_COOKIE = 'horeca_force_account_picker';
export const PENDING_REDIRECT_KEY = 'horeca_pending_post_login_redirect';
export const DISMISS_KEY = 'horeca_post_login_selector_dismissed';

const COOKIE_MAX_AGE_SEC = 5 * 60;

export function readForcePickerCookie(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.cookie.split(';').some((c) => c.trim().startsWith(`${FORCE_PICKER_COOKIE}=1`));
  } catch {
    return false;
  }
}

export function setForcePickerCookie(): void {
  if (typeof document === 'undefined') return;
  try {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${FORCE_PICKER_COOKIE}=1; path=/; max-age=${COOKIE_MAX_AGE_SEC}; samesite=lax${secure}`;
  } catch {
    /* ignore */
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

export function setPendingRedirect(url: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const safe = sanitizeRedirect(url);
    if (safe) sessionStorage.setItem(PENDING_REDIRECT_KEY, safe);
    else sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  } catch {
    /* ignore */
  }
}

export function consumePendingRedirect(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const url = sessionStorage.getItem(PENDING_REDIRECT_KEY);
    sessionStorage.removeItem(PENDING_REDIRECT_KEY);
    return url;
  } catch {
    return null;
  }
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

export function capsFromSessionUser(user: {
  role?: string;
  activeBusinessAccountType?: AccountPortalCaps | null;
  availableAccounts?: Array<{ isVendor?: boolean; isBrand?: boolean }> | null;
} | null | undefined): AccountPortalCaps | null {
  if (user?.role === 'admin') return null;
  const active = user?.activeBusinessAccountType;
  if (active?.isVendor || active?.isBrand) return active;
  const accounts = user?.availableAccounts ?? [];
  if (accounts.some((a) => a.isVendor)) {
    return { isCustomer: true, isVendor: true, isBrand: false };
  }
  if (accounts.some((a) => a.isBrand)) {
    return { isCustomer: false, isVendor: false, isBrand: true };
  }
  if (active) return active;
  const role = user?.role;
  if (role === 'vendor') return { isCustomer: false, isVendor: true, isBrand: false };
  if (role === 'brand') return { isCustomer: false, isVendor: false, isBrand: true };
  if (role === 'customer') return { isCustomer: true, isVendor: false, isBrand: false };
  return null;
}

/** Called after OTP/password sign-in on the login page. */
export async function prepareFreshLoginNavigation(
  redirectTo: string | null,
  opts?: { picker?: boolean },
): Promise<void> {
  const allowPicker = opts?.picker !== false;
  clearDismissFlag();
  // Never resume a previous "Entered Store" session after a fresh login —
  // multi-store team members must land on the business/store picker.
  setEnteredStore(false);
  broadcastAuthEvent('session-changed');

  let session = await getSession();
  // Cookie/JWT can lag a tick right after signIn — retry once before falling back to /.
  if (!session?.user) {
    await new Promise((r) => setTimeout(r, 150));
    session = await getSession();
  }
  const role = session?.user?.role ?? null;
  const caps = capsFromSessionUser(session?.user ?? null);
  const user = session?.user as {
    isStoreScopedOnly?: boolean;
    totalAccountCount?: number;
    availableAccounts?: unknown[];
  } | null | undefined;
  const totalAccountCount = user?.totalAccountCount
    ?? (Array.isArray(user?.availableAccounts) ? user.availableAccounts.length : 0);

  if (allowPicker && role !== 'admin' && totalAccountCount > 1) {
    setPendingRedirect(redirectTo);
    setForcePickerCookie();
    window.location.href = '/';
    return;
  }

  clearForcePickerCookie();
  try {
    sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  } catch {
    /* ignore */
  }

  // New / unapproved suppliers: stay on marketplace until admin Approve & Verify.
  if (role !== 'admin' && (caps?.isVendor || role === 'vendor' || user?.isStoreScopedOnly)) {
    try {
      const res = await fetch('/api/v1/vendor/application-status', { credentials: 'include' });
      const json = await res.json().catch(() => null);
      if (json?.success && json.data?.hasApplication && json.data?.status === 'pending') {
        window.location.href = sanitizeRedirect(redirectTo) || '/';
        return;
      }
    } catch {
      /* fall through to normal portal routing */
    }
  }

  // Store-scoped team members → Businesses picker (Enter the store they need).
  if (!sanitizeRedirect(redirectTo) && role !== 'admin' && user?.isStoreScopedOnly) {
    window.location.href = '/vendor/businesses';
    return;
  }
  window.location.href = resolvePostLoginDestination(redirectTo, caps, role);
}

/**
 * Called when the picker finishes (or when no pick is needed).
 * Honors a pending deep-link; otherwise lands on the portal for the chosen account.
 */
export async function completePostLoginPicker(contextChanged = true): Promise<void> {
  clearForcePickerCookie();
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
  const pending = sanitizeRedirect(consumePendingRedirect());
  const here =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '';

  if (pending) {
    if (contextChanged || pending !== here) {
      window.location.href = pending;
    }
    return;
  }

  let session = await getSession();
  if (!session?.user) {
    await new Promise((r) => setTimeout(r, 150));
    session = await getSession();
  }
  const user = session?.user as { isStoreScopedOnly?: boolean; role?: string } | null | undefined;
  if (user?.role !== 'admin' && user?.isStoreScopedOnly) {
    window.location.href = '/vendor/businesses';
    return;
  }
  const dest = resolvePostLoginDestination(
    null,
    capsFromSessionUser(session?.user ?? null),
    session?.user?.role ?? null,
  );
  if (dest !== here) {
    window.location.href = dest;
  }
}

/** Overlay / in-page login — arm the picker without navigating away. */
export function markFreshLoginPendingPicker(): void {
  clearDismissFlag();
  setForcePickerCookie();
  broadcastAuthEvent('session-changed');
}

/** Clear leftover picker state after overlay / in-page login (single-account). */
export function clearPostLoginPickerState(): void {
  clearDismissFlag();
  clearForcePickerCookie();
  broadcastAuthEvent('session-changed');
}
