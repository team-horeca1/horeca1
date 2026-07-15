'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { clearForcePickerCookie, clearDismissFlag } from '@/lib/postLoginPicker';
import { redirectIfPortalMismatch } from '@/lib/portalRouting';
import { ACCOUNTS_REFRESH_EVENT } from '@/lib/addressUsability';
import {
  clearAllAdminImpersonation,
  isAdminCustomerImpersonationActive,
  isAdminVendorImpersonationActive,
  IMPERSONATION_CHANGED_EVENT,
} from '@/lib/clearImpersonation';
import {
  broadcastAuthEvent,
  subscribeAuthTabEvents,
  tryAcquireBootstrapLock,
  releaseBootstrapLock,
} from '@/lib/authTabSync';
import { clearUserClientStores } from '@/lib/userScopedStorage';
import { toast } from 'sonner';

/**
 * V2.2 — Multi-account + multi-outlet switcher hook.
 *
 * Reads the available BusinessAccounts from /api/v1/account, looks up
 * outlets for the active account when needed, and switches by calling
 * /api/v1/auth/switch-{business-account,outlet} followed by
 * useSession().update(...) which triggers a JWT refresh through the
 * auth.ts jwt callback (loadActiveContext re-runs).
 *
 * Vendor Admin View (cookie impersonation): loads the impersonated vendor's
 * outlets and switches warehouse via PATCH /api/v1/admin/impersonate without
 * rewriting the admin JWT.
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
  const [customerImpersonating, setCustomerImpersonating] = useState(false);
  const [vendorImpersonating, setVendorImpersonating] = useState(false);
  const [vendorImpersonationAccount, setVendorImpersonationAccount] = useState<AccountSummary | null>(null);
  const [vendorImpersonationOutletId, setVendorImpersonationOutletId] = useState<string | null>(null);
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

  const syncImpersonationFlags = useCallback(() => {
    setCustomerImpersonating(isAdminCustomerImpersonationActive());
    setVendorImpersonating(isAdminVendorImpersonationActive());
  }, []);

  // Cookie-based detection (name cookie is readable; id cookies are httpOnly).
  useEffect(() => {
    syncImpersonationFlags();
    const onSameTab = () => syncImpersonationFlags();
    window.addEventListener(IMPERSONATION_CHANGED_EVENT, onSameTab);
    const unsub = subscribeAuthTabEvents((event) => {
      if (event.type === 'impersonation-changed' || event.type === 'session-changed') {
        syncImpersonationFlags();
      }
    });
    return () => {
      window.removeEventListener(IMPERSONATION_CHANGED_EVENT, onSameTab);
      unsub();
    };
  }, [syncImpersonationFlags]);

  // Re-check on navigation (start/exit redirect) and userId change.
  useEffect(() => {
    syncImpersonationFlags();
  }, [userId, pathname, syncImpersonationFlags]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/account');
      const json = await res.json();
      if (json.success) setAccounts(json.data as AccountSummary[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  const fetchVendorImpersonationContext = useCallback(async () => {
    try {
      const [impRes, outletsRes] = await Promise.all([
        fetch('/api/v1/admin/impersonate'),
        fetch('/api/v1/vendor/outlets'),
      ]);
      const impJson = await impRes.json();
      const outletsJson = await outletsRes.json();

      if (!impJson.success || !impJson.data || !outletsJson.success || !outletsJson.data) {
        setVendorImpersonationAccount(null);
        setVendorImpersonationOutletId(null);
        return;
      }

      const ba = outletsJson.data.businessAccount as {
        id: string;
        name: string;
        primaryOutletId: string | null;
      };
      const outlets = (outletsJson.data.outlets as Array<{
        id: string;
        name: string;
        pincode: string | null;
        requiresAddressUpdate: boolean;
      }>).map((o) => ({
        id: o.id,
        name: o.name,
        pincode: o.pincode,
        requiresAddressUpdate: o.requiresAddressUpdate,
      }));

      setVendorImpersonationAccount({
        id: ba.id,
        legalName: impJson.data.legalName ?? ba.name,
        displayName: impJson.data.displayName ?? ba.name,
        isCustomer: false,
        isVendor: true,
        isBrand: false,
        status: 'active',
        isPrimary: true,
        primaryOutletId: ba.primaryOutletId,
        outlets,
      });
      setVendorImpersonationOutletId(
        (impJson.data.outletId as string | null)
          ?? ba.primaryOutletId
          ?? outlets[0]?.id
          ?? null,
      );
    } catch {
      setVendorImpersonationAccount(null);
      setVendorImpersonationOutletId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (vendorImpersonating) {
      void fetchVendorImpersonationContext();
    } else {
      setVendorImpersonationAccount(null);
      setVendorImpersonationOutletId(null);
      void fetchAccounts();
    }
  }, [userId, fetchAccounts, fetchVendorImpersonationContext, customerImpersonating, vendorImpersonating]);

  useEffect(() => {
    const onRefresh = () => {
      if (vendorImpersonating) void fetchVendorImpersonationContext();
      else void fetchAccounts();
    };
    window.addEventListener(ACCOUNTS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ACCOUNTS_REFRESH_EVENT, onRefresh);
  }, [fetchAccounts, fetchVendorImpersonationContext, vendorImpersonating]);

  // During customer impersonation, JWT still has the admin's BA/outlet ids while
  // /api/v1/account returns only the impersonated BA — match by API list instead.
  // During vendor Admin View, use the synthesized vendor BA + impersonation outlet cookie.
  const currentAccount = vendorImpersonating
    ? vendorImpersonationAccount
    : customerImpersonating
      ? (accounts[0] ?? null)
      : (accounts.find((a) => a.id === activeBusinessAccountId) ?? null);

  const currentOutlet = vendorImpersonating
    ? (
      currentAccount?.outlets.find((o) => o.id === vendorImpersonationOutletId)
      ?? currentAccount?.outlets.find((o) => o.id === currentAccount.primaryOutletId)
      ?? currentAccount?.outlets[0]
      ?? null
    )
    : customerImpersonating
      ? (
        currentAccount?.outlets.find((o) => o.id === currentAccount.primaryOutletId)
        ?? currentAccount?.outlets[0]
        ?? null
      )
      : (currentAccount?.outlets.find((o) => o.id === activeOutletId) ?? null);

  const effectiveActiveOutletId = vendorImpersonating
    ? (currentOutlet?.id ?? null)
    : customerImpersonating
      ? (currentOutlet?.id ?? null)
      : activeOutletId;

  const switchAccount = useCallback(
    async (businessAccountId: string, outletId?: string) => {
      if (switching) return;
      if (isAdminCustomerImpersonationActive() || isAdminVendorImpersonationActive()) {
        toast.info('Exit Admin View before switching accounts');
        return;
      }
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
      if (switching) return;

      // Vendor Admin View: switch warehouse via impersonation cookie only.
      if (isAdminVendorImpersonationActive()) {
        if (outletId === vendorImpersonationOutletId) return;
        setSwitching(true);
        try {
          const res = await fetch('/api/v1/admin/impersonate', {
            method: 'PATCH',
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
          setVendorImpersonationOutletId(outletId);
          broadcastAuthEvent('account-switched', {
            userId,
            activeBusinessAccountId: vendorImpersonationAccount?.id ?? null,
            activeOutletId: outletId,
          });
        } finally {
          setSwitching(false);
          releaseBootstrapLock();
        }
        return;
      }

      if (outletId === activeOutletId) return;
      if (isAdminCustomerImpersonationActive()) {
        toast.info('Exit Admin View before switching outlets');
        return;
      }
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
    [
      switching,
      activeOutletId,
      update,
      userId,
      activeBusinessAccountId,
      vendorImpersonationOutletId,
      vendorImpersonationAccount?.id,
    ],
  );

  // Bootstrap session when JWT is missing account/outlet but memberships exist.
  // Cross-tab lock prevents multiple tabs from racing switchAccount(primary).
  // Skip entirely while viewing as a customer/vendor — bootstrap would clear
  // impersonation cookies and rewrite the admin JWT.
  useEffect(() => {
    if (customerImpersonating || vendorImpersonating) return;
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
    customerImpersonating,
    vendorImpersonating,
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
    if (customerImpersonating || vendorImpersonating) return;
    if (!userId || loading || legacyProvisionAttempted.current) return;
    if (!activeBusinessAccountId && accounts.length === 0) {
      legacyProvisionAttempted.current = true;
      void (async () => {
        await update({});
        await fetchAccounts();
      })();
    }
  }, [
    customerImpersonating,
    vendorImpersonating,
    userId,
    loading,
    activeBusinessAccountId,
    accounts.length,
    update,
    fetchAccounts,
  ]);

  const handleSignOut = useCallback(async () => {
    clearCart();
    clearWishlist();
    clearForcePickerCookie();
    clearDismissFlag();
    clearUserClientStores(userId);
    try {
      await clearAllAdminImpersonation();
    } catch { /* ignore */ }
    // Mark before broadcast so AuthTabSync on this tab skips the racing
    // signOut({ redirect: false }) + location.href path (P2-12).
    const { clientLogout, markSigningOut } = await import('@/lib/clientLogout');
    markSigningOut();
    broadcastAuthEvent('signed-out', { userId });
    await clientLogout('/');
  }, [clearCart, clearWishlist, userId]);

  const refresh = useCallback(async () => {
    if (vendorImpersonating) await fetchVendorImpersonationContext();
    else await fetchAccounts();
  }, [vendorImpersonating, fetchVendorImpersonationContext, fetchAccounts]);

  return {
    loading,
    switching,
    hcidDisplay,
    accounts: vendorImpersonating && vendorImpersonationAccount
      ? [vendorImpersonationAccount]
      : accounts,
    currentAccount,
    currentOutlet,
    activeBusinessAccountId: (vendorImpersonating || customerImpersonating)
      ? (currentAccount?.id ?? null)
      : activeBusinessAccountId,
    activeOutletId: effectiveActiveOutletId,
    accessibleOutletIds: (vendorImpersonating || customerImpersonating) ? [] : accessibleOutletIds,
    totalAccountCount,
    availableAccountsTruncated,
    customerImpersonating,
    vendorImpersonating,
    switchAccount,
    switchOutlet,
    refresh,
    signOut: handleSignOut,
  };
}
