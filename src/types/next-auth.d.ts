import type { DefaultSession } from 'next-auth';
import type { PermissionKey } from '@/lib/permissions/registry';
import type { TeamRole, Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role: Role;
      adminTeamRole?: TeamRole | 'owner';
      hcidDisplay?: string | null;
      activeBusinessAccountId?: string | null;
      activeBusinessAccountType?: { isCustomer: boolean; isVendor: boolean; isBrand: boolean } | null;
      activeOutletId?: string | null;
      accessibleOutletIds?: string[];
      permissions?: PermissionKey[];
      isPermissionOwner?: boolean;
      adminPermissions?: PermissionKey[];
      isAdminPermissionOwner?: boolean;
      activeVendorId?: string | null;
      activeBrandId?: string | null;
      forceAccountPicker?: boolean;
      /** ms timestamp the fresh-login picker was armed at (see PICKER_TTL_MS) */
      pickerArmedAt?: number;
      availableAccounts?: Array<{
        id: string;
        displayName: string | null;
        isVendor: boolean;
        isBrand: boolean;
      }>;
      availableAccountsTruncated?: boolean;
      totalAccountCount?: number;
      availableStores?: Array<{
        id: string;
        displayName: string;
        isPrimaryStore: boolean;
        isActive: boolean;
      }>;
      isStoreScopedOnly?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: Role;
    adminTeamRole?: TeamRole | 'owner';
    hcidDisplay?: string | null;
    activeBusinessAccountId?: string | null;
    activeBusinessAccountType?: { isCustomer: boolean; isVendor: boolean; isBrand: boolean } | null;
    activeOutletId?: string | null;
    accessibleOutletIds?: string[];
    permissions?: PermissionKey[];
    isPermissionOwner?: boolean;
    adminPermissions?: PermissionKey[];
    isAdminPermissionOwner?: boolean;
    activeVendorId?: string | null;
    activeBrandId?: string | null;
    activeVendorTeamRole?: TeamRole | 'owner' | null;
    activeBrandTeamRole?: TeamRole | 'owner' | null;
    /** Legacy: superseded by pickerArmedAt, still read so pre-existing tokens clear */
    forceAccountPicker?: boolean;
    /** ms timestamp the fresh-login picker was armed at (see PICKER_TTL_MS) */
    pickerArmedAt?: number;
    availableAccounts?: Array<{
      id: string;
      displayName: string | null;
      isVendor: boolean;
      isBrand: boolean;
    }>;
    availableAccountsTruncated?: boolean;
    totalAccountCount?: number;
    availableStores?: Array<{
      id: string;
      displayName: string;
      isPrimaryStore: boolean;
      isActive: boolean;
    }>;
    isStoreScopedOnly?: boolean;
    /** ms timestamp of User.updatedAt when permissions were last synced into this JWT */
    userSyncedAt?: number;
    /** Set when the account was deleted/deactivated/revoked — session callback drops user */
    invalidated?: boolean;
  }
}
