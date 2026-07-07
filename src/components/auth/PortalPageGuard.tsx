'use client';

import React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { PermissionKey } from '@/lib/permissions/registry';
import type { RoleScope } from '@/lib/permissions/portalFeatures';
import { getRoutePermission, getVendorAccountTabPermission } from '@/lib/permissions/routePermissions';
import { RequirePermission } from '@/components/auth/RequirePermission';

interface PortalPageGuardProps {
  scope: RoleScope;
  children: React.ReactNode;
  /** Override auto-detected permission (e.g. vendor account tabs). */
  permOverride?: PermissionKey | PermissionKey[];
}

export function PortalPageGuard({ scope, children, permOverride }: PortalPageGuardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  let perm = permOverride ?? getRoutePermission(pathname, scope);

  if (!permOverride && scope === 'vendor' && pathname === '/vendor/account') {
    const tab = searchParams.get('tab') ?? 'overview';
    perm = getVendorAccountTabPermission(tab);
  }

  if (!perm) return <>{children}</>;

  return <RequirePermission perm={perm}>{children}</RequirePermission>;
}
