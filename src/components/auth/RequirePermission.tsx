'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import type { PermissionKey } from '@/lib/permissions/registry';
import { usePermissions } from '@/hooks/usePermissions';

interface RequirePermissionProps {
  perm?: PermissionKey | PermissionKey[];
  children: React.ReactNode;
  /** Shown when user lacks permission. Defaults to access-restricted screen. */
  fallback?: React.ReactNode;
}

export function RequirePermission({ perm, children, fallback }: RequirePermissionProps) {
  const perms = usePermissions();
  const { status } = useSession();

  if (perms.loading || (status === 'loading' && !perms.permissions.length)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!perms.can(perm)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <ShieldAlert className="text-red-500" size={28} />
        </div>
        <h2 className="text-[18px] font-bold text-[#181725] mb-2">Access restricted</h2>
        <p className="text-[13px] text-[#7C7C7C] max-w-md">
          You don&apos;t have permission to view this page. Contact your team administrator if you need access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
