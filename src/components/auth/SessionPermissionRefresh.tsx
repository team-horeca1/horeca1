'use client';

/**
 * Keeps JWT permissions in sync after an admin changes a team member's role
 * (admin / vendor / brand / account team). Also force-signs-out when the
 * account was deleted / deactivated / revoked.
 *
 * Team panels promise "within 60 seconds — no re-login". We poll under that
 * ceiling and always call session.update() so Auth.js re-runs the jwt callback
 * (which reloads role permissions from DB via markSessionStale → updatedAt).
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

    const refreshSession = async () => {
      const now = Date.now();
      if (inFlight.current || now - lastRefresh.current < MIN_GAP_MS) return;
      inFlight.current = true;
      try {
        const res = await fetch('/api/v1/auth/session-stale');
        const json = await res.json().catch(() => null);
        if (res.status === 401 || json?.data?.valid === false) {
          lastRefresh.current = Date.now();
          await forceSignOut();
          return;
        }
        // Always update() so jwt reloads permissions when User.updatedAt moved
        // (role/permission changes). Redis stale is an extra fast-path signal.
        lastRefresh.current = Date.now();
        await update({ permissionRefresh: lastRefresh.current });
      } catch {
        // Ignore — permission refresh is best-effort
      } finally {
        inFlight.current = false;
      }
    };

    void refreshSession();
    window.addEventListener('focus', refreshSession);
    const intervalId = setInterval(refreshSession, REFRESH_INTERVAL_MS);
    return () => {
      window.removeEventListener('focus', refreshSession);
      clearInterval(intervalId);
    };
  }, [status, update, session?.user]);

  return null;
}
