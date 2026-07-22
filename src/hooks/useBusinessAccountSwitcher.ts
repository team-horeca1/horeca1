'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCart } from '@/context/CartContext';
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
import { clientLogout, markSigningOut } from '@/lib/clientLogout';
import { toast } from 'sonner';

/** Same-tab sync: each useBusinessAccountSwitcher() has its own state — broadcast outlet switches. */
const VENDOR_OUTLET_SYNC_EVENT = 'horeca-vendor-outlet-sync';

function emitVendorOutletSync(outletId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VENDOR_OUTLET_SYNC_EVENT, { detail: { outletId } }));
}

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

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [customerImpersonating, setCustomerImpersonating] = useState(false);
  const [vendorImpersonating, setVendorImpersonating] = useState(false);
  const [vendorImpersonationAccounts, setVendorImpersonationAccounts] = useState<AccountSummary[]>([]);
  const [vendorImpersonationAccount, setVendorImpersonationAccount] = useState<AccountSummary | null>(null);
  const [vendorImpersonationOutletId, setVendorImpersonationOutletId] = useState<string | null>(null);
  const [vendorImpersonationVendorId, setVendorImpersonationVendorId] = useState<string | null>(null);
  const [vendorImpersonationStores, setVendorImpersonationStores] = useState<Array<{
    id: string;
    displayName: string;
    isPrimaryStore: boolean;
    isActive: boolean;
    businessAccountId: string;
  }>>([]);
  const legacyProvisionAttempted = useRef(false);
  const bootstrapAttempted = useRef(false);

  const userId = session?.user?.id ?? null;
  const u = (session?.user ?? {}) as Record<string, unknown>;
  const hcidDisplay = (u.hcidDisplay as string | undefined) ?? null;
  const activeBusinessAccountId = (u.activeBusinessAccountId as string | undefined) ?? null;
  const activeOutletId = (u.activeOutletId as string | undefined) ?? null;
  const activeVendorId = (u.activeVendorId as string | undefined) ?? null;
  const availableStores = Array.isArray(u.availableStores)
    ? (u.availableStores as Array<{
        id: string;
        displayName: string;
        isPrimaryStore: boolean;
        isActive: boolean;
      }>)
    : [];
  const isStoreScopedOnly = u.isStoreScopedOnly === true;
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

  // Keep every hook instance on the same warehouse after Switch warehouse (Admin View).
  useEffect(() => {
    const onOutletSync = (e: Event) => {
      const outletId = (e as CustomEvent<{ outletId?: string }>).detail?.outletId;
      if (!outletId) return;
      setVendorImpersonationOutletId((prev) => (prev === outletId ? prev : outletId));
    };
    window.addEventListener(VENDOR_OUTLET_SYNC_EVENT, onOutletSync);
    return () => window.removeEventListener(VENDOR_OUTLET_SYNC_EVENT, onOutletSync);
  }, []);

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

      if (!impJson.success || !impJson.data) {
        setVendorImpersonationAccounts([]);
        setVendorImpersonationAccount(null);
        setVendorImpersonationOutletId(null);
        setVendorImpersonationVendorId(null);
        setVendorImpersonationStores([]);
        return;
      }

      const outlets = (outletsJson.success && outletsJson.data
        ? (outletsJson.data.outlets as Array<{
            id: string;
            name: string;
            pincode: string | null;
            requiresAddressUpdate: boolean;
          }>)
        : []
      ).map((o) => ({
        id: o.id,
        name: o.name,
        pincode: o.pincode,
        requiresAddressUpdate: o.requiresAddressUpdate,
      }));

      type ImpBiz = {
        id: string;
        legalName: string;
        displayName: string | null;
        status: string;
        isPrimary: boolean;
        stores: Array<{
          id: string;
          displayName: string;
          businessAccountId: string;
          isActive: boolean;
          isPrimaryStore: boolean;
        }>;
      };

      const businesses = (impJson.data.businesses as ImpBiz[] | undefined) ?? [];
      const currentBaId = impJson.data.businessAccountId as string;
      const synthAccounts: AccountSummary[] = businesses.map((b) => ({
        id: b.id,
        legalName: b.legalName,
        displayName: b.displayName,
        isCustomer: false,
        isVendor: true,
        isBrand: false,
        status: (b.status as AccountSummary['status']) || 'active',
        isPrimary: b.isPrimary,
        primaryOutletId: b.id === currentBaId
          ? ((impJson.data.primaryOutletId as string | null) ?? outlets[0]?.id ?? null)
          : null,
        // Outlets only for the currently impersonated Business (warehouse retired)
        outlets: b.id === currentBaId ? outlets : [],
      }));

      const stores = (
        (impJson.data.stores as Array<{
          id: string;
          displayName: string;
          businessAccountId: string;
          isActive: boolean;
          isPrimaryStore: boolean;
        }> | undefined)
        ?? businesses.flatMap((b) => b.stores)
      ).map((s) => ({
        id: s.id,
        displayName: s.displayName,
        isPrimaryStore: s.isPrimaryStore,
        isActive: s.isActive,
        businessAccountId: s.businessAccountId,
      }));

      const current = synthAccounts.find((a) => a.id === currentBaId) ?? synthAccounts[0] ?? null;

      setVendorImpersonationAccounts(synthAccounts);
      setVendorImpersonationAccount(current);
      setVendorImpersonationVendorId((impJson.data.vendorId as string | null) ?? null);
      setVendorImpersonationStores(stores);
      setVendorImpersonationOutletId(
        (impJson.data.outletId as string | null)
          ?? (impJson.data.primaryOutletId as string | null)
          ?? outlets[0]?.id
          ?? null,
      );
    } catch {
      setVendorImpersonationAccounts([]);
      setVendorImpersonationAccount(null);
      setVendorImpersonationOutletId(null);
      setVendorImpersonationVendorId(null);
      setVendorImpersonationStores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (vendorImpersonating) {
      void fetchVendorImpersonationContext();
    } else {
      setVendorImpersonationAccounts([]);
      setVendorImpersonationAccount(null);
      setVendorImpersonationOutletId(null);
      setVendorImpersonationVendorId(null);
      setVendorImpersonationStores([]);
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

      // Admin View: switch to primary Online Store under the target Business
      if (isAdminVendorImpersonationActive()) {
        if (businessAccountId === vendorImpersonationAccount?.id && !outletId) return;
        const store =
          vendorImpersonationStores.find(
            (s) => s.businessAccountId === businessAccountId && s.isPrimaryStore,
          )
          ?? vendorImpersonationStores.find((s) => s.businessAccountId === businessAccountId);
        if (!store) {
          toast.error('No Online Store under that Business');
          return;
        }
        setSwitching(true);
        try {
          const res = await fetch('/api/v1/admin/impersonate', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendorId: store.id }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) {
            throw new AccountSwitchError(
              (typeof json?.error === 'object' && json?.error?.message)
              || (typeof json?.error === 'string' ? json.error : null)
              || `Failed to switch Business (HTTP ${res.status})`,
            );
          }
          await fetchVendorImpersonationContext();
          broadcastAuthEvent('impersonation-changed', { userId });
          router.refresh();
        } finally {
          setSwitching(false);
          releaseBootstrapLock();
        }
        return;
      }

      if (isAdminCustomerImpersonationActive()) {
        toast.info('Exit Admin View before switching accounts');
        return;
      }
      if (businessAccountId === activeBusinessAccountId && !outletId) return;
      setSwitching(true);
      try {
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
    [
      switching,
      activeBusinessAccountId,
      accounts,
      pathname,
      update,
      router,
      userId,
      vendorImpersonationAccount?.id,
      vendorImpersonationStores,
      fetchVendorImpersonationContext,
    ],
  );

  const switchOnlineStore = useCallback(
    async (vendorId: string, businessAccountId?: string) => {
      if (switching) return;
      const currentId = vendorImpersonating ? vendorImpersonationVendorId : activeVendorId;
      const sameStore = vendorId === currentId;
      const sameBa = !businessAccountId || businessAccountId === activeBusinessAccountId;
      if (sameStore && sameBa) return;

      // Admin View: update impersonation cookie to sibling Online Store
      if (isAdminVendorImpersonationActive()) {
        setSwitching(true);
        try {
          const res = await fetch('/api/v1/admin/impersonate', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendorId }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) {
            throw new AccountSwitchError(
              (typeof json?.error === 'object' && json?.error?.message)
              || (typeof json?.error === 'string' ? json.error : null)
              || `Failed to switch online store (HTTP ${res.status})`,
            );
          }
          await fetchVendorImpersonationContext();
          broadcastAuthEvent('impersonation-changed', { userId });
          router.refresh();
        } finally {
          setSwitching(false);
          releaseBootstrapLock();
        }
        return;
      }

      if (isAdminCustomerImpersonationActive()) {
        toast.info('Exit Admin View before switching online stores');
        return;
      }
      setSwitching(true);
      try {
        try {
          await clearAllAdminImpersonation();
        } catch { /* ignore */ }

        const res = await fetch('/api/v1/auth/switch-online-store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorId,
            ...(businessAccountId ? { businessAccountId } : {}),
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          const msg =
            (typeof json?.error === 'object' && json?.error?.message)
            || (typeof json?.error === 'string' ? json.error : null)
            || `Failed to switch online store (HTTP ${res.status})`;
          throw new AccountSwitchError(msg);
        }
        const data = json.data as {
          vendorId: string;
          outletId: string | null;
          businessAccountId?: string;
        };
        await update({
          activeVendorId: data.vendorId,
          activeOutletId: data.outletId ?? undefined,
          ...(data.businessAccountId
            ? { activeBusinessAccountId: data.businessAccountId }
            : {}),
        });
        broadcastAuthEvent('account-switched', {
          userId,
          activeBusinessAccountId: data.businessAccountId ?? activeBusinessAccountId,
          activeOutletId: data.outletId ?? null,
        });
      } finally {
        setSwitching(false);
        releaseBootstrapLock();
      }
    },
    [
      switching,
      activeVendorId,
      vendorImpersonating,
      vendorImpersonationVendorId,
      update,
      userId,
      activeBusinessAccountId,
      fetchVendorImpersonationContext,
      router,
    ],
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
          emitVendorOutletSync(outletId);
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

  // Bootstrap session when JWT is missing account/outlet, or when the active BA
  // is not the primary (e.g. team member stuck on a personal shopping BA while
  // their primary vendor membership is where Dashboard lives).
  useEffect(() => {
    if (customerImpersonating || vendorImpersonating) return;
    if (!userId || loading || switching || accounts.length === 0) return;
    if (bootstrapAttempted.current) return;

    const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
    const defaultOutletId =
      primary.primaryOutletId ?? primary.outlets[0]?.id ?? null;
    const needsPrimarySwitch =
      !activeBusinessAccountId
      || (
        activeBusinessAccountId !== primary.id
        && (primary.isVendor || primary.isBrand)
      );

    if (needsPrimarySwitch) {
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
    clearForcePickerCookie();
    clearDismissFlag();
    clearUserClientStores(userId);
    markSigningOut();
    broadcastAuthEvent('signed-out', { userId });
    void clearAllAdminImpersonation();
    await clientLogout('/');
  }, [clearCart, userId]);

  const refresh = useCallback(async () => {
    if (vendorImpersonating) await fetchVendorImpersonationContext();
    else await fetchAccounts();
  }, [vendorImpersonating, fetchVendorImpersonationContext, fetchAccounts]);

  const effectiveAvailableStores = vendorImpersonating
    ? vendorImpersonationStores.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        isPrimaryStore: s.isPrimaryStore,
        isActive: s.isActive,
      }))
    : availableStores;

  const effectiveActiveVendorId = vendorImpersonating
    ? vendorImpersonationVendorId
    : activeVendorId;

  return {
    loading,
    switching,
    hcidDisplay,
    accounts: vendorImpersonating
      ? (vendorImpersonationAccounts.length > 0
        ? vendorImpersonationAccounts
        : (vendorImpersonationAccount ? [vendorImpersonationAccount] : []))
      : accounts,
    currentAccount,
    currentOutlet,
    activeBusinessAccountId: (vendorImpersonating || customerImpersonating)
      ? (currentAccount?.id ?? null)
      : activeBusinessAccountId,
    activeOutletId: effectiveActiveOutletId,
    activeVendorId: effectiveActiveVendorId,
    availableStores: effectiveAvailableStores,
    isStoreScopedOnly: vendorImpersonating ? false : isStoreScopedOnly,
    accessibleOutletIds: (vendorImpersonating || customerImpersonating) ? [] : accessibleOutletIds,
    totalAccountCount: vendorImpersonating
      ? vendorImpersonationAccounts.length
      : totalAccountCount,
    availableAccountsTruncated,
    customerImpersonating,
    vendorImpersonating,
    switchAccount,
    switchOutlet,
    switchOnlineStore,
    refresh,
    signOut: handleSignOut,
  };
}
