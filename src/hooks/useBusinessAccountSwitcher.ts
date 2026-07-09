'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { clearForcePickerCookie, clearDismissFlag } from '@/lib/postLoginPicker';
import { redirectIfPortalMismatch } from '@/lib/portalRouting';
import { ACCOUNTS_REFRESH_EVENT } from '@/lib/addressUsability';
import { clearAllAdminImpersonation } from '@/lib/clearImpersonation';
import {
  broadcastAuthEvent,
  tryAcquireBootstrapLock,
  releaseBootstrapLock,
} from '@/lib/authTabSync';
import { clearUserClientStores } from '@/lib/userScopedStorage';

/**
 * V2.2 — Multi-account + multi-outlet switcher hook.
 *
 * Reads the available BusinessAccounts from /api/v1/account, looks up
 * outlets for the active account when needed, and switches by calling
 * /api/v1/auth/switch-{business-account,outlet} followed by
 * useSession().update(...) which triggers a JWT refresh through the
 * auth.ts jwt callback (loadActiveContext re-runs).
 */

export interface AccountSummary {
  id: string;
  legalName: string;
  displayName: string | null;
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
  status: 'active' | 'suspended' | 'deactivated';
  isPrimary: boolean;
  primaryOutletId: string | null;
  outlets: Array<{ id: string; name: string; pincode: string | null; requiresAddressUpdate: boolean }>;
}

export interface OutletSummary {
  id: string;
  name: string;
  pincode: string | null;
  requiresAddressUpdate: boolean;
}

export class AccountSwitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountSwitchError';
  }
}

export function useBusinessAccountSwitcher() {
  const { data: session, update } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { clearCart } = useCart();
  const { clearWishlist } = useWishlist();

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const legacyProvisionAttempted = useRef(false);
  const bootstrapAttempted = useRef(false);

  const userId = session?.user?.id ?? null;
  const u = (session?.user ?? {}) as Record<string, unknown>;
  const hcidDisplay = (u.hcidDisplay as string | undefined) ?? null;
  const activeBusinessAccountId = (u.activeBusinessAccountId as string | undefined) ?? null;
  const activeOutletId = (u.activeOutletId as string | undefined) ?? null;
  const totalAccountCount = (u.totalAccountCount as number | undefined) ?? 0;
  const availableAccountsTruncated = (u.availableAccountsTruncated as boolean | undefined) ?? false;
  const accessibleOutletIds = Array.isArray(u.accessibleOutletIds)
    ? (u.accessibleOutletIds as string[])
    : [];

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/account');
      const json = await res.json();
      if (json.success) setAccounts(json.data as AccountSummary[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (userId) fetchAccounts();
  }, [userId, fetchAccounts]);

  useEffect(() => {
    const onRefresh = () => { void fetchAccounts(); };
    window.addEventListener(ACCOUNTS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ACCOUNTS_REFRESH_EVENT, onRefresh);
  }, [fetchAccounts]);

  const currentAccount = accounts.find((a) => a.id === activeBusinessAccountId) ?? null;
  const currentOutlet = currentAccount?.outlets.find((o) => o.id === activeOutletId) ?? null;

  const switchAccount = useCallback(
    async (businessAccountId: string, outletId?: string) => {
      if (switching) return;
      if (businessAccountId === activeBusinessAccountId && !outletId) return;
      setSwitching(true);
      try {
        // BA switch must not leave a stale admin impersonation cookie pointing
        // at another vendor/brand/customer.
        try {
          await clearAllAdminImpersonation();
        } catch { /* ignore */ }

        const res = await fetch('/api/v1/auth/switch-business-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessAccountId, outletId }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          const msg =
            (typeof json?.error === 'object' && json?.error?.message)
            || (typeof json?.error === 'string' ? json.error : null)
            || `Failed to switch account (HTTP ${res.status})`;
          throw new AccountSwitchError(msg);
        }
        clearWishlist();
        await update({ activeBusinessAccountId: businessAccountId, activeOutletId: outletId ?? undefined });
        broadcastAuthEvent('account-switched', {
          userId,
          activeBusinessAccountId: businessAccountId,
          activeOutletId: outletId ?? null,
        });

        const target = accounts.find((a) => a.id === businessAccountId);
        if (target && pathname) {
          const dest = redirectIfPortalMismatch(pathname, target);
          if (dest) router.replace(dest);
        }
      } finally {
        setSwitching(false);
        releaseBootstrapLock();
      }
    },
    [switching, activeBusinessAccountId, accounts, pathname, clearWishlist, update, router, userId],
  );

  const switchOutlet = useCallback(
    async (outletId: string) => {
      if (switching || outletId === activeOutletId) return;
      setSwitching(true);
      try {
        try {
          await clearAllAdminImpersonation();
        } catch { /* ignore */ }

        const res = await fetch('/api/v1/auth/switch-outlet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outletId }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          const msg =
            (typeof json?.error === 'object' && json?.error?.message)
            || (typeof json?.error === 'string' ? json.error : null)
            || `Failed to switch outlet (HTTP ${res.status})`;
          throw new AccountSwitchError(msg);
        }
        await update({ activeOutletId: outletId });
        broadcastAuthEvent('account-switched', {
          userId,
          activeBusinessAccountId,
          activeOutletId: outletId,
        });
      } finally {
        setSwitching(false);
        releaseBootstrapLock();
      }
    },
    [switching, activeOutletId, update, userId, activeBusinessAccountId],
  );

  // Bootstrap session when JWT is missing account/outlet but memberships exist.
  // Cross-tab lock prevents multiple tabs from racing switchAccount(primary).
  useEffect(() => {
    if (!userId || loading || switching || accounts.length === 0) return;
    if (bootstrapAttempted.current) return;

    const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
    const defaultOutletId =
      primary.primaryOutletId ?? primary.outlets[0]?.id ?? null;

    if (!activeBusinessAccountId) {
      if (!tryAcquireBootstrapLock()) return;
      bootstrapAttempted.current = true;
      void switchAccount(primary.id, defaultOutletId ?? undefined).catch(() => {
        bootstrapAttempted.current = false;
        releaseBootstrapLock();
      });
      return;
    }
    if (!activeOutletId && currentAccount) {
      const outletId =
        currentAccount.primaryOutletId ?? currentAccount.outlets[0]?.id ?? null;
      if (outletId) {
        if (!tryAcquireBootstrapLock()) return;
        bootstrapAttempted.current = true;
        void switchOutlet(outletId).catch(() => {
          bootstrapAttempted.current = false;
          releaseBootstrapLock();
        });
      }
    }
  }, [
    userId,
    loading,
    switching,
    accounts,
    activeBusinessAccountId,
    activeOutletId,
    currentAccount,
    switchAccount,
    switchOutlet,
  ]);

  // Legacy sessions: refresh JWT so server can provision BusinessAccount if missing.
  useEffect(() => {
    if (!userId || loading || legacyProvisionAttempted.current) return;
    if (!activeBusinessAccountId && accounts.length === 0) {
      legacyProvisionAttempted.current = true;
      void (async () => {
        await update({});
        await fetchAccounts();
      })();
    }
  }, [userId, loading, activeBusinessAccountId, accounts.length, update, fetchAccounts]);

  const handleSignOut = useCallback(async () => {
    clearCart();
    clearWishlist();
    clearForcePickerCookie();
    clearDismissFlag();
    clearUserClientStores(userId);
    try {
      await clearAllAdminImpersonation();
    } catch { /* ignore */ }
    broadcastAuthEvent('signed-out', { userId });
    await signOut({ callbackUrl: '/' });
  }, [clearCart, clearWishlist, userId]);

  return {
    loading,
    switching,
    hcidDisplay,
    accounts,
    currentAccount,
    currentOutlet,
    activeBusinessAccountId,
    activeOutletId,
    accessibleOutletIds,
    totalAccountCount,
    availableAccountsTruncated,
    switchAccount,
    switchOutlet,
    refresh: fetchAccounts,
    signOut: handleSignOut,
  };
}
