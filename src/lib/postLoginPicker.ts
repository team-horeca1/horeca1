/**
 * Fresh-login account picker — cookie + sessionStorage coordination.
 *
 * sessionStorage dismiss alone survives logout/login in the same tab; the
 * short-lived force-pick cookie is set on sign-in (server + client) so every
 * fresh login with 2+ business accounts must pick before redirect.
 */

import { getSession } from 'next-auth/react';
import { broadcastAuthEvent } from '@/lib/authTabSync';
import {
  accountCanAccessPath,
  defaultPortalPath,
  supplierLandingPath,
  type AccountPortalCaps,
} from '@/lib/portalRouting';
import { setEnteredStore } from '@/lib/supplierPortalLevel';

export const FORCE_PICKER_COOKIE = 'horeca_force_account_picker';
export const PENDING_REDIRECT_KEY = 'horeca_pending_post_login_redirect';
export const DISMISS_KEY = 'horeca_post_login_selector_dismissed';
export const SETTLED_KEY = 'horeca_picker_settled_at';
export const PICK_IN_FLIGHT_KEY = 'horeca_picker_in_flight';
export const PICKED_ACCOUNT_KEY = 'horeca_picked_account_id';
export const LOGIN_HANDOFF_KEY = 'horeca_login_handoff';

export type PickerUserFlags = {
  forceAccountPicker?: boolean;
  pickerArmedAt?: number;
  totalAccountCount?: number;
  role?: string;
};

/**
 * How long a fresh login stays "must pick". The JWT stores only an armed-at
 * timestamp, so the requirement expires by itself — a dropped clear can never
 * strand the user in a picker that reopens on every reload.
 */
export const PICKER_TTL_MS = 5 * 60 * 1000;

const COOKIE_MAX_AGE_SEC = PICKER_TTL_MS / 1000;

export function readForcePickerCookie(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.cookie.split(';').some((c) => c.trim().startsWith(`${FORCE_PICKER_COOKIE}=1`));
  } catch {
    return false;
  }
}

function forcePickerCookieAttrs(): string {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; secure' : '';
  return `path=/; samesite=lax${secure}`;
}

export function setForcePickerCookie(): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${FORCE_PICKER_COOKIE}=1; ${forcePickerCookieAttrs()}; max-age=${COOKIE_MAX_AGE_SEC}`;
  } catch {
    /* ignore */
  }
}

export function clearForcePickerCookie(): void {
  if (typeof document === 'undefined') return;
  try {
    // Attributes must match the setter or the browser will not expire the cookie
    // (Secure cookies on HTTPS were surviving the old max-age=0 write).
    document.cookie = `${FORCE_PICKER_COOKIE}=; ${forcePickerCookieAttrs()}; max-age=0`;
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
  try {
    sessionStorage.removeItem(PICK_IN_FLIGHT_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(PICKED_ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(SETTLED_KEY);
  } catch {
    /* ignore */
  }
}

export function markLoginHandoff(): void {
  try {
    sessionStorage.setItem(LOGIN_HANDOFF_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearLoginHandoff(): void {
  try {
    sessionStorage.removeItem(LOGIN_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

export function hasLoginHandoff(): boolean {
  try {
    return sessionStorage.getItem(LOGIN_HANDOFF_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPickerInFlight(): void {
  try {
    sessionStorage.setItem(PICK_IN_FLIGHT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearPickerInFlight(): void {
  try {
    sessionStorage.removeItem(PICK_IN_FLIGHT_KEY);
  } catch {
    /* ignore */
  }
}

export function isPickerInFlight(): boolean {
  try {
    const raw = sessionStorage.getItem(PICK_IN_FLIGHT_KEY);
    if (!raw) return false;
    const t = Number(raw);
    if (Number.isFinite(t) && t > 0) return Date.now() - t < 15_000;
    return raw === '1';
  } catch {
    return false;
  }
}

export function rememberPickedAccount(id: string | null | undefined): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (id) sessionStorage.setItem(PICKED_ACCOUNT_KEY, id);
    else sessionStorage.removeItem(PICKED_ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
}

export function peekPickedAccount(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const id = sessionStorage.getItem(PICKED_ACCOUNT_KEY);
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function consumePickedAccount(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const id = sessionStorage.getItem(PICKED_ACCOUNT_KEY);
    sessionStorage.removeItem(PICKED_ACCOUNT_KEY);
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Remember that this specific login's picker was answered. Keyed to the
 * armed-at stamp so a reload stays quiet while the next login (new stamp)
 * arms the picker again. Written synchronously before any navigation, so it
 * holds even if the session update that clears the JWT flag never lands.
 */
export function markPickerSettled(armedAt: number | null | undefined): void {
  try {
    localStorage.setItem(SETTLED_KEY, String(armedAt ?? 0));
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isPickerSettled(armedAt: number | null | undefined): boolean {
  try {
    const stored = localStorage.getItem(SETTLED_KEY);
    const dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
    if (typeof armedAt === 'number') {
      return stored === String(armedAt);
    }
    // JWT stamp is deleted after a successful pick. Same-tab dismiss + stored
    // stamp means this login already answered — don't reopen on the next page.
    return dismissed && stored != null;
  } catch {
    return false;
  }
}

/**
 * True while a fresh-login pick is still owed. Portal layouts and the
 * account-switcher bootstrap check this before auto-switching, so they never
 * override the account the user is about to choose.
 *
 * The JWT stores `pickerArmedAt` (not a boolean). `forceAccountPicker` is a
 * leftover flag — either signal plus the short-lived cookie counts, unless
 * this login was already answered.
 */
export function isPickerPending(user: PickerUserFlags | null | undefined): boolean {
  if (user?.role === 'admin') return false;
  if (isPickerSettled(user?.pickerArmedAt)) return false;
  // Pick already chosen — destination layouts must be allowed to switch.
  if (isPickerInFlight() || peekPickedAccount()) return false;
  const count = user?.totalAccountCount;
  if (typeof count === 'number' && count <= 1) return false;
  if (readForcePickerCookie()) return true;
  if (user?.forceAccountPicker === true) return true;
  if (typeof user?.pickerArmedAt === 'number') {
    return Date.now() - user.pickerArmedAt < PICKER_TTL_MS;
  }
  return false;
}

export function sanitizeRedirect(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
}

/** Login came from “add this business type” — skip the account picker. */
export function isOnboardOrAddRedirect(url: string | null | undefined): boolean {
  const safe = sanitizeRedirect(url);
  if (!safe) return false;
  const [path, query = ''] = safe.split('?');
  if (path === '/vendor/register' || path === '/brand/register') return true;
  if (path === '/businesses') {
    const add = new URLSearchParams(query).get('add');
    return add === 'buyer' || add === 'customer' || add === 'brand' || add === 'supplier' || add === 'vendor';
  }
  return false;
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
  // Marketplace home is the login default, not an explicit deep-link.
  // Supplier / brand / admin should land on their dashboard instead.
  const genericHome = safe === '/';
  if (safe && !genericHome) return safe;
  if (role === 'admin') return '/admin/dashboard';
  if (caps) return defaultPortalPath(caps);
  return safe || '/';
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

function shouldAbortPreparedNavigation(): boolean {
  return isPickerInFlight() || hasLoginHandoff();
}

/** Called after OTP/password sign-in on the login page. */
export async function prepareFreshLoginNavigation(
  redirectTo: string | null,
  opts?: { picker?: boolean },
): Promise<void> {
  const allowPicker = opts?.picker !== false;
  if (!allowPicker && shouldAbortPreparedNavigation()) return;
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
    pickerArmedAt?: number;
  } | null | undefined;
  const totalAccountCount = user?.totalAccountCount
    ?? (Array.isArray(user?.availableAccounts) ? user.availableAccounts.length : 0);

  if (!allowPicker && shouldAbortPreparedNavigation()) return;

  const onboardRedirect = sanitizeRedirect(redirectTo);
  if (isOnboardOrAddRedirect(onboardRedirect)) {
    markPickerSettled(user?.pickerArmedAt);
    clearForcePickerCookie();
    try {
      sessionStorage.removeItem(PENDING_REDIRECT_KEY);
    } catch {
      /* ignore */
    }
    window.location.href = onboardRedirect!;
    return;
  }

  if (allowPicker && role !== 'admin' && totalAccountCount > 1) {
    setPendingRedirect(redirectTo);
    setForcePickerCookie();
    // Stay on this page. Hard-nav to `/` remounts the picker (flash: modal →
    // storefront → modal) and the session.update() after a pick can swallow
    // navigation. The in-page selector is the next step.
    return;
  }

  if (!allowPicker && shouldAbortPreparedNavigation()) return;

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

  if (!allowPicker && shouldAbortPreparedNavigation()) return;

  // Store-scoped team members → Businesses picker (Enter the store they need).
  if (!sanitizeRedirect(redirectTo) && role !== 'admin' && user?.isStoreScopedOnly) {
    window.location.href = '/businesses?type=supplier';
    return;
  }
  window.location.href = resolvePostLoginDestination(redirectTo, caps, role);
}

/** The picked account's own capabilities, when the caller knows them. */
function normalizeChosenCaps(
  chosen: Partial<AccountPortalCaps> | null | undefined,
): AccountPortalCaps | null {
  if (!chosen) return null;
  const isVendor = chosen.isVendor === true;
  const isBrand = chosen.isBrand === true;
  return { isCustomer: chosen.isCustomer ?? (!isVendor && !isBrand), isVendor, isBrand };
}

/** Sync destination for a picker choice — no session fetch. */
export function destinationAfterAccountPick(
  chosen?: (Partial<AccountPortalCaps> & { id?: string }) | null,
): string {
  const caps = normalizeChosenCaps(chosen);
  if (!caps) return '/';
  if (caps.isVendor) {
    const id = typeof chosen?.id === 'string' && chosen.id.length > 0 ? chosen.id : null;
    return supplierLandingPath(id);
  }
  return defaultPortalPath(caps);
}

/**
 * Called when the picker finishes (or when no pick is needed).
 * Honors a pending deep-link; otherwise lands on the portal for the chosen account.
 *
 * `chosen` is the account the user just picked. Passing it matters twice: a
 * pending deep-link into a portal the picked account cannot serve is dropped
 * (otherwise the portal layout auto-switches straight back and re-arms the
 * picker), and the destination follows the pick instead of
 * `capsFromSessionUser`, which prefers any supplier account the user belongs to.
 */
export async function completePostLoginPicker(
  contextChanged = true,
  chosen?: (Partial<AccountPortalCaps> & { id?: string }) | null,
): Promise<void> {
  clearForcePickerCookie();
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
  const chosenCaps = normalizeChosenCaps(chosen);
  let pending = sanitizeRedirect(consumePendingRedirect());
  if (pending && chosenCaps && !accountCanAccessPath(pending, chosenCaps)) {
    pending = null;
  }
  if (pending === '/' && chosenCaps && (chosenCaps.isVendor || chosenCaps.isBrand)) {
    pending = null;
  }
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

  if (chosenCaps) {
    rememberPickedAccount(typeof chosen?.id === 'string' ? chosen.id : null);
    const dest = destinationAfterAccountPick(chosen);
    if (dest !== here) {
      window.location.href = dest;
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
    window.location.href = '/businesses?type=supplier';
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
