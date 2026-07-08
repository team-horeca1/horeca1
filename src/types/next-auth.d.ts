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
  }
}
