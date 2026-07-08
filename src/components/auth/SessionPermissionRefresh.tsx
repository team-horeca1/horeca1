'use client';

/**
 * Keeps JWT permissions in sync after an admin changes a team member's role.
 * Calls updateSession() on load, window focus, and every 60s (debounced 30s) so
 * the user does not need to log out — a normal refresh or tab switch is enough.
 */
import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

export function SessionPermissionRefresh() {
  const { status, update } = useSession();
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const refresh = () => {
      const now = Date.now();
      if (now - lastRefresh.current < 30_000) return;
      lastRefresh.current = now;
      void update({ permissionRefresh: now });
    };

    refresh();
    window.addEventListener('focus', refresh);
    const intervalId = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener('focus', refresh);
      clearInterval(intervalId);
    };
  }, [status, update]);

  return null;
}
