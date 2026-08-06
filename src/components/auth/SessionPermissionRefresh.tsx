'use client';

/**
 * Keeps JWT permissions in sync after an admin changes a team member's role
 * (admin / vendor / brand / account team). Also force-signs-out when the
 * account was deleted / deactivated / revoked.
 *
 * Team panels promise "within 60 seconds — no re-login". We poll under that
 * ceiling via a 45s interval that always calls session.update() so Auth.js
 * re-runs the jwt callback (role permissions via markSessionStale → updatedAt).
 * Tab focus only probes /session-stale and calls update() when stale/invalid,
 * so routine focus events do not flip useSession status to loading.
 */
import { useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { broadcastAuthEvent } from '@/lib/authTabSync';
import { clearForcePickerCookie, clearDismissFlag } from '@/lib/postLoginPicker';
import { clearUserClientStores } from '@/lib/userScopedStorage';

const REFRESH_INTERVAL_MS = 45_000;
const MIN_GAP_MS = 15_000;

export function SessionPermissionRefresh() {
  const { status, data: session, update } = useSession();
  const lastRefresh = useRef(0);
  const inFlight = useRef(false);
  const userId = session?.user?.id;

  useEffect(() => {
    if (status !== 'authenticated') return;

    const forceSignOut = async () => {
      clearForcePickerCookie();
      clearDismissFlag();
      clearUserClientStores(userId);
      broadcastAuthEvent('signed-out', { userId });
      await signOut({ redirect: false });
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    };

    /**
     * @param forceUpdate — interval/mount: always update() so Redis-down
     * User.updatedAt fallback still applies. Focus: probe only; update when
     * stale or invalid.
     */
    const refreshSession = async (forceUpdate: boolean) => {
      const now = Date.now();
      if (inFlight.current || now - lastRefresh.current < MIN_GAP_MS) return;
      inFlight.current = true;
      try {
        const res = await fetch('/api/v1/auth/session-stale');
        const json = await res.json().catch(() => null);
        const data = json?.data as { stale?: boolean; valid?: boolean } | undefined;
        if (res.status === 401 || data?.valid === false) {
          lastRefresh.current = Date.now();
          await forceSignOut();
          return;
        }
        if (forceUpdate || data?.stale === true) {
          lastRefresh.current = Date.now();
          await update({ permissionRefresh: lastRefresh.current });
        } else {
          // Clean probe (focus): throttle without flipping session status
          lastRefresh.current = Date.now();
        }
      } catch {
        // Ignore — permission refresh is best-effort
      } finally {
        inFlight.current = false;
      }
    };

    void refreshSession(true);
    const onFocus = () => {
      void refreshSession(false);
    };
    window.addEventListener('focus', onFocus);
    const intervalId = setInterval(() => {
      void refreshSession(true);
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(intervalId);
    };
  }, [status, update, userId]);

  return null;
}
