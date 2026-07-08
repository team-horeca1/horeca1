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

  const userId = session?.user?.id ?? null;
  const u = (session?.user ?? {}) as Record<string, unknown>;
  const hcidDisplay = (u.hcidDisplay as string | undefined) ?? null;
  const activeBusinessAccountId = (u.activeBusinessAccountId as string | undefined) ?? null;
  const activeOutletId = (u.activeOutletId as string | undefined) ?? null;
  const totalAccountCount = (u.totalAccountCount as number | undefined) ?? 0;
  const availableAccountsTruncated = (u.availableAccountsTruncated as boolean | undefined) ?? false;

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
        const res = await fetch('/api/v1/auth/switch-business-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessAccountId, outletId }),
        });
        if (!res.ok) { setSwitching(false); return; }
        clearWishlist();
        await update({ activeBusinessAccountId: businessAccountId, activeOutletId: outletId ?? undefined });

        const target = accounts.find((a) => a.id === businessAccountId);
        if (target && pathname) {
          const dest = redirectIfPortalMismatch(pathname, target);
          if (dest) router.replace(dest);
        }
      } finally {
        setSwitching(false);
      }
    },
    [switching, activeBusinessAccountId, accounts, pathname, clearCart, clearWishlist, update, router],
  );

  const switchOutlet = useCallback(
    async (outletId: string) => {
      if (switching || outletId === activeOutletId) return;
      setSwitching(true);
      try {
        const res = await fetch('/api/v1/auth/switch-outlet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outletId }),
        });
        if (!res.ok) { setSwitching(false); return; }
        await update({ activeOutletId: outletId });
      } finally {
        setSwitching(false);
      }
    },
    [switching, activeOutletId, clearCart, update],
  );

  // Bootstrap session when JWT is missing account/outlet but memberships exist.
  useEffect(() => {
    if (!userId || loading || switching || accounts.length === 0) return;

    const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
    const defaultOutletId =
      primary.primaryOutletId ?? primary.outlets[0]?.id ?? null;

    if (!activeBusinessAccountId) {
      void switchAccount(primary.id, defaultOutletId ?? undefined);
      return;
    }
    if (!activeOutletId && currentAccount) {
      const outletId =
        currentAccount.primaryOutletId ?? currentAccount.outlets[0]?.id ?? null;
      if (outletId) void switchOutlet(outletId);
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
    clearWishlist();
    clearForcePickerCookie();
    clearDismissFlag();
    try {
      await clearAllAdminImpersonation();
    } catch { /* ignore */ }
    try {
      localStorage.removeItem('horeca_order_lists_all');
      localStorage.removeItem('horeca_orders');
      localStorage.removeItem('horeca_recently_viewed');
    } catch { /* ignore */ }
    await signOut({ callbackUrl: '/' });
  }, [clearCart, clearWishlist]);

  return {
    loading,
    switching,
    hcidDisplay,
    accounts,
    currentAccount,
    currentOutlet,
    activeBusinessAccountId,
    activeOutletId,
    totalAccountCount,
    availableAccountsTruncated,
    switchAccount,
    switchOutlet,
    refresh: fetchAccounts,
    signOut: handleSignOut,
  };
}
