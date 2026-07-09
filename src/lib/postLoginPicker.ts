/**
 * Fresh-login account picker — cookie + sessionStorage coordination.
 *
 * sessionStorage dismiss alone survives logout/login in the same tab; the
 * short-lived force-pick cookie is set on sign-in (server + client) so every
 * fresh login with 2+ business accounts must pick before redirect.
 */

import { broadcastAuthEvent } from '@/lib/authTabSync';

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

/** Called after OTP/password sign-in on the login page — defer redirect until picker completes. */
export function prepareFreshLoginNavigation(redirectTo: string | null): void {
  clearDismissFlag();
  setPendingRedirect(redirectTo);
  setForcePickerCookie();
  broadcastAuthEvent('session-changed');
  // Go straight to the destination (e.g. /checkout) instead of bouncing through
  // the homepage — the account picker is global and overlays whatever page we
  // land on. The pending redirect is still stashed so completePostLoginPicker
  // can reload the destination IF the picker changes the active context.
  window.location.href = sanitizeRedirect(redirectTo) ?? '/';
}

/**
 * Called when the picker finishes (or when no pick is needed).
 *
 * `contextChanged` — whether the user actually switched account/outlet. We now
 * navigate straight to the destination after login, so when nothing changed the
 * current page is already correct for this session and we skip the redundant
 * reload (the fast path). We only hard-reload when the context changed (so
 * server-rendered, account-scoped data refreshes) or we're not on the
 * destination yet.
 */
export function completePostLoginPicker(contextChanged = true): void {
  clearForcePickerCookie();
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
  const safe = sanitizeRedirect(consumePendingRedirect());
  if (!safe) return;
  const here =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '';
  if (contextChanged || safe !== here) {
    window.location.href = safe;
  }
}

/** Overlay / in-page login — no navigation, just arm the picker. */
export function markFreshLoginPendingPicker(): void {
  clearDismissFlag();
  setForcePickerCookie();
  broadcastAuthEvent('session-changed');
}
