'use client';

import { SessionProvider } from 'next-auth/react';
import { SessionPermissionRefresh } from '@/components/auth/SessionPermissionRefresh';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={60} refetchOnWindowFocus>
      <SessionPermissionRefresh />
      {children}
    </SessionProvider>
  );
}
