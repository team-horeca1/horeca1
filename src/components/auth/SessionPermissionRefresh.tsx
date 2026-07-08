'use client';

/**
 * Keeps JWT permissions in sync after an admin changes a team member's role.
 * Only calls updateSession() when the server reports a stale session flag.
 */
import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

export function SessionPermissionRefresh() {
  const { status, update } = useSession();
  const lastRefresh = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const refreshIfStale = async () => {
      const now = Date.now();
      if (inFlight.current || now - lastRefresh.current < 30_000) return;
      inFlight.current = true;
      try {
        const res = await fetch('/api/v1/auth/session-stale');
        const json = await res.json().catch(() => null);
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
  }, [status, update]);

  return null;
}
