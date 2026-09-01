'use client';

import { useSession } from 'next-auth/react';

/**
 * Auth.js flips `status` to `'loading'` during `update()` while `data` stays
 * populated. Treat that as still authenticated so chrome (navbar, bells)
 * does not collapse into the logged-out layout on every JWT refresh.
 */
export function useStableSession() {
  const { data, status, update } = useSession();
  const hasUser = Boolean(data?.user);
  return {
    session: data,
    status,
    update,
    isAuthenticated: status === 'authenticated' || (status === 'loading' && hasUser),
    isResolved: status !== 'loading' || hasUser,
  };
}
