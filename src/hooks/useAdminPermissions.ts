'use client';

import { usePermissions } from '@/hooks/usePermissions';

export interface AdminPermissions {
  loading: boolean;
  canRead: boolean;
  canWriteOrders: boolean;
  canWriteProducts: boolean;
  canWriteInventory: boolean;
  canWriteSettings: boolean;
  canManageTeam: boolean;
  // Granular team actions — used by /admin/team to gate individual buttons
  // so a user with users.create but not users.delete doesn't see a Remove
  // button that 403s on click.
  canInviteUsers: boolean;
  canEditUsers: boolean;
  canDeleteUsers: boolean;
}

export function useAdminPermissions(): AdminPermissions {
  const perms = usePermissions();
  return {
    loading: perms.loading,
    canRead: perms.has('dashboard.view'),
    canWriteOrders: perms.has('orders.edit'),
    canWriteProducts: perms.has('products.edit'),
    canWriteInventory: perms.has('inventory.edit'),
    canWriteSettings: perms.has('settings.edit'),
    canManageTeam: perms.hasAny('users.create', 'users.edit', 'users.delete', 'users.view'),
    canInviteUsers: perms.has('users.create'),
    canEditUsers: perms.has('users.edit'),
    canDeleteUsers: perms.has('users.delete'),
  };
}
