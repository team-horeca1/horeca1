'use client';

/**
 * Keeps JWT permissions in sync after an admin changes a team member's role.
 * Also force-signs-out when the account was deleted / deactivated / revoked.
 */
import { useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { broadcastAuthEvent } from '@/lib/authTabSync';
import { clearForcePickerCookie, clearDismissFlag } from '@/lib/postLoginPicker';
import { clearUserClientStores } from '@/lib/userScopedStorage';

export function SessionPermissionRefresh() {
  const { status, data: session, update } = useSession();
  const lastRefresh = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const forceSignOut = async () => {
      const userId = (session?.user as { id?: string } | undefined)?.id;
      clearForcePickerCookie();
      clearDismissFlag();
      clearUserClientStores(userId);
      broadcastAuthEvent('signed-out', { userId });
      await signOut({ redirect: false });
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    };

    const refreshIfStale = async () => {
      const now = Date.now();
      if (inFlight.current || now - lastRefresh.current < 30_000) return;
      inFlight.current = true;
      try {
        const res = await fetch('/api/v1/auth/session-stale');
        const json = await res.json().catch(() => null);
        if (res.status === 401 || json?.data?.valid === false) {
          lastRefresh.current = Date.now();
          await forceSignOut();
          return;
        }
        if (!json?.success || !json?.data?.stale) return;
        lastRefresh.current = Date.now();
        await update({ permissionRefresh: lastRefresh.current });
      } catch {
        // Ignore — stale refresh is best-effort
      } finally {
        inFlight.current = false;
      }
    };

    void refreshIfStale();
    window.addEventListener('focus', refreshIfStale);
    const intervalId = setInterval(refreshIfStale, 120_000);
    return () => {
      window.removeEventListener('focus', refreshIfStale);
      clearInterval(intervalId);
    };
  }, [status, update, session?.user]);

  return null;
}
