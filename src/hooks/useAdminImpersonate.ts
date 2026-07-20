'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { clearAllAdminImpersonation, notifyImpersonationChanged } from '@/lib/clearImpersonation';
import { setEnteredStore } from '@/lib/supplierPortalLevel';

export type ImpersonateTarget = 'vendor' | 'brand' | 'customer';

const ROUTES: Record<ImpersonateTarget, { post: string; delete: string; redirect: string }> = {
  vendor: {
    post: '/api/v1/admin/impersonate',
    delete: '/api/v1/admin/impersonate',
    redirect: '/vendor/overview',
  },
  brand: {
    post: '/api/v1/admin/impersonate/brand',
    delete: '/api/v1/admin/impersonate/brand',
    redirect: '/brand/portal',
  },
  customer: {
    post: '/api/v1/admin/impersonate/customer',
    delete: '/api/v1/admin/impersonate/customer',
    redirect: '/profile',
  },
};

/** Default body key; vendor UI uses supplierUserId (Supplier-level Impersonate). */
const BODY_KEYS: Record<ImpersonateTarget, string> = {
  vendor: 'supplierUserId',
  brand: 'brandId',
  customer: 'userId',
};

export function useAdminImpersonate(target: ImpersonateTarget) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const routes = ROUTES[target];
  const bodyKey = BODY_KEYS[target];

  const start = useCallback(
    async (
      entityId: string,
      redirectTo?: string,
      opts?: { bodyKey?: string },
    ) => {
      if (loading) return false;
      setLoading(true);
      try {
        const key = opts?.bodyKey ?? bodyKey;
        const res = await fetch(routes.post, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: entityId }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          const msg =
            (typeof json?.error === 'object' && json?.error?.message)
            || (typeof json?.error === 'string' ? json.error : null)
            || `Failed to start admin view (HTTP ${res.status})`;
          toast.error(msg);
          return false;
        }
        if (target === 'vendor') {
          setEnteredStore(false);
        }
        notifyImpersonationChanged();
        router.push(redirectTo ?? routes.redirect);
        router.refresh();
        return true;
      } catch {
        toast.error('Network error — could not start admin view');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [loading, router, routes.post, routes.redirect, bodyKey, target],
  );

  const exit = useCallback(
    async (returnTo?: string) => {
      try {
        await clearAllAdminImpersonation();
      } catch {
        // Best-effort cookie clear
      }
      router.push(returnTo ?? (target === 'customer' ? '/admin/customers' : target === 'brand' ? '/admin/brands' : '/admin/vendors'));
      router.refresh();
    },
    [router, target],
  );

  return { start, exit, loading };
}
