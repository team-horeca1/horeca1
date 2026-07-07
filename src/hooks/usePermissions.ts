'use client';

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
  const { data: session, status } = useSession();
  const u = session?.user as {
    permissions?: string[];
    isPermissionOwner?: boolean;
    role?: string;
  } | undefined;

  const permissions = u?.permissions ?? [];
  const isPermissionOwner = u?.isPermissionOwner === true
    || (u?.role === 'admin' && permissions.length === 0);

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
