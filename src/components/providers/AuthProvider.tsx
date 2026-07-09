'use client';

import { SessionProvider } from 'next-auth/react';
import { SessionPermissionRefresh } from '@/components/auth/SessionPermissionRefresh';
import { AuthTabSync } from '@/components/auth/AuthTabSync';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
      <SessionPermissionRefresh />
      <AuthTabSync />
      {children}
    </SessionProvider>
  );
}
