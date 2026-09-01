'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { SessionPermissionRefresh } from '@/components/auth/SessionPermissionRefresh';
import { AuthTabSync } from '@/components/auth/AuthTabSync';

export function AuthProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session} refetchInterval={0} refetchOnWindowFocus={false}>
      <SessionPermissionRefresh />
      <AuthTabSync />
      {children}
    </SessionProvider>
  );
}
