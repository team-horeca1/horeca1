'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { PermissionKey } from '@/lib/permissions/registry';

export interface SessionPermissions {
  loading: boolean;
  permissions: readonly string[];
  isPermissionOwner: boolean;
  can: (need?: PermissionKey | PermissionKey[]) => boolean;
  has: (key: PermissionKey) => boolean;
  hasAny: (...keys: PermissionKey[]) => boolean;
}

export function usePermissions(): SessionPermissions {
  const pathname = usePathname() ?? '';
  const { data: session, status } = useSession();
  const u = session?.user as {
    permissions?: string[];
    adminPermissions?: string[];
    isPermissionOwner?: boolean;
    isAdminPermissionOwner?: boolean;
    role?: string;
  } | undefined;

  const onAdminPortal = pathname === '/admin' || pathname.startsWith('/admin/');
  const useAdminScope = onAdminPortal && u?.role === 'admin';

  const permissions = useAdminScope
    ? (u?.adminPermissions ?? [])
    : (u?.permissions ?? []);

  const isPermissionOwner = useAdminScope
    ? u?.isAdminPermissionOwner === true
    : u?.isPermissionOwner === true
      || (u?.role === 'admin' && (u?.permissions ?? []).length === 0);

  const has = (key: PermissionKey) => isPermissionOwner || permissions.includes(key);
  const hasAny = (...keys: PermissionKey[]) =>
    isPermissionOwner || keys.some((k) => permissions.includes(k));

  const can = (need?: PermissionKey | PermissionKey[]): boolean => {
    if (!need) return true;
    if (isPermissionOwner) return true;
    if (permissions.length === 0) return false;
    return Array.isArray(need) ? hasAny(...need) : has(need);
  };

  return {
    loading: status === 'loading' && !session,
    permissions,
    isPermissionOwner,
    can,
    has,
    hasAny,
  };
}
