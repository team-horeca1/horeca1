import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { Errors, errorResponse } from './errorHandler';
import type { Role, TeamRole } from '@prisma/client';
import type { PermissionKey } from '@/lib/permissions/registry';
import {
  readCustomerImpersonationFromRequest,
  type CustomerImpersonation,
} from '@/lib/resolveCustomerImpersonation';

// Authenticated user context injected into API handlers.
export interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  adminTeamRole: TeamRole | 'owner';
  hcidDisplay: string | null;
  activeBusinessAccountId: string | null;
  activeBusinessAccountType: { isCustomer: boolean; isVendor: boolean; isBrand: boolean } | null;
  activeOutletId: string | null;
  accessibleOutletIds: string[];
  permissions: readonly PermissionKey[];
  permissionSet: ReadonlySet<PermissionKey>;
  isPermissionOwner: boolean;
  activeVendorId: string | null;
  activeBrandId: string | null;
  activeVendorTeamRole: TeamRole | 'owner' | null;
  activeBrandTeamRole: TeamRole | 'owner' | null;
  /** Set when an admin is viewing the storefront/profile as a customer. */
  impersonatedCustomer: CustomerImpersonation | null;
}

// Validate session and extract user context
export async function getAuthContext(req: NextRequest): Promise<AuthContext> {
  const session = await auth();

  if (!session?.user?.id) {
    throw Errors.unauthorized();
  }

  const u = session.user as unknown as Record<string, unknown>;
  const adminTeamRole = u.adminTeamRole as string | undefined;

  const permissions = (u.permissions as PermissionKey[]) ?? [];
  const role = (u.role as Role) ?? 'customer';

  const impersonatedCustomer =
    role === 'admin' ? readCustomerImpersonationFromRequest(req) : null;

  return {
    userId: session.user.id,
    email: session.user.email!,
    role,
    adminTeamRole: (adminTeamRole as TeamRole | 'owner') ?? 'owner',
    hcidDisplay: (u.hcidDisplay as string) ?? null,
    activeBusinessAccountId: (u.activeBusinessAccountId as string) ?? null,
    activeBusinessAccountType:
      (u.activeBusinessAccountType as { isCustomer: boolean; isVendor: boolean; isBrand: boolean }) ?? null,
    activeOutletId: (u.activeOutletId as string) ?? null,
    accessibleOutletIds: Array.isArray(u.accessibleOutletIds) ? (u.accessibleOutletIds as string[]) : [],
    permissions,
    permissionSet: new Set(permissions),
    isPermissionOwner: u.isPermissionOwner === true,
    activeVendorId: (u.activeVendorId as string) ?? null,
    activeBrandId: (u.activeBrandId as string) ?? null,
    activeVendorTeamRole: (u.activeVendorTeamRole as TeamRole | 'owner') ?? null,
    activeBrandTeamRole: (u.activeBrandTeamRole as TeamRole | 'owner') ?? null,
    impersonatedCustomer,
  };
}

// Wrapper for protected API routes
export function withAuth(
  handler: (req: NextRequest, ctx: AuthContext) => Promise<Response>
) {
  return async (req: NextRequest) => {
    try {
      const authCtx = await getAuthContext(req);
      return await handler(req, authCtx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
