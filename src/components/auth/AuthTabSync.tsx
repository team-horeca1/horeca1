'use client';

/**
 * Aligns this tab's React session with the shared JWT cookie when another tab
 * mutates auth (account switch, sign-out, impersonation, login).
 */
import { useEffect, useRef } from 'react';
import { useSession, signOut, getSession } from 'next-auth/react';
import { subscribeAuthTabEvents, type AuthTabEvent } from '@/lib/authTabSync';
import { clearForcePickerCookie, clearDismissFlag } from '@/lib/postLoginPicker';
import { clearUserClientStores } from '@/lib/userScopedStorage';

type SessionUser = {
  id?: string;
  activeBusinessAccountId?: string | null;
  activeOutletId?: string | null;
};

function sessionFingerprint(user: SessionUser | null | undefined): string {
  if (!user?.id) return 'anon';
  return `${user.id}|${user.activeBusinessAccountId ?? ''}|${user.activeOutletId ?? ''}`;
}

export function AuthTabSync() {
  const { data: session, status, update } = useSession();
  const handling = useRef(false);
  const lastLocalFp = useRef<string>('');

  useEffect(() => {
    lastLocalFp.current = sessionFingerprint(
      session?.user as SessionUser | undefined,
    );
  }, [session?.user]);

  useEffect(() => {
    const syncFromCookie = async (reason: AuthTabEvent['type']) => {
      if (handling.current) return;
      handling.current = true;
      try {
        if (reason === 'signed-out') {
          clearForcePickerCookie();
          clearDismissFlag();
          clearUserClientStores((session?.user as SessionUser | undefined)?.id);
          await signOut({ redirect: false });
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/';
          }
          return;
        }

        const fresh = await getSession();
        const freshUser = fresh?.user as SessionUser | undefined;
        const localUser = session?.user as SessionUser | undefined;
        const freshFp = sessionFingerprint(freshUser);
        const localFp = sessionFingerprint(localUser);

        if (freshFp === 'anon' && status === 'authenticated') {
          await signOut({ redirect: false });
          window.location.href = '/';
          return;
        }

        if (freshFp !== 'anon' && freshFp !== localFp) {
          // Hard reload is the reliable path — update() can race cookie writes
          // under concurrent tab switches (see ProfileScreen hard-reload fallback).
          window.location.reload();
          return;
        }

        if (reason === 'session-changed' || reason === 'impersonation-changed') {
          await update({});
        }
      } catch {
        // Best-effort; next visibility check will retry
      } finally {
        handling.current = false;
      }
    };

    const unsub = subscribeAuthTabEvents((event) => {
      void syncFromCookie(event.type);
    });

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        if (handling.current) return;
        try {
          const fresh = await getSession();
          const freshFp = sessionFingerprint(fresh?.user as SessionUser | undefined);
          const localFp = sessionFingerprint(session?.user as SessionUser | undefined);
          if (status === 'authenticated' && freshFp === 'anon') {
            await signOut({ redirect: false });
            window.location.href = '/';
            return;
          }
          if (freshFp !== 'anon' && localFp !== 'anon' && freshFp !== localFp) {
            window.location.reload();
          }
        } catch { /* ignore */ }
      })();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session?.user, status, update]);

  return null;
}
