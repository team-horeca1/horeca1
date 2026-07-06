/**
 * Shared shape returned by the three team-management APIs
 * (/api/v1/admin/team, /api/v1/vendor/team, /api/v1/brand/team).
 *
 * Mirrors the layout of /api/v1/account/[id]/users so the corresponding
 * portal team pages (admin, vendor, brand) can use the same rendering
 * primitives as TeamMembersOverlay in the profile flow.
 */

import type { Prisma } from '@prisma/client';

export interface TeamMemberDTO {
  /** Stable member-row id (e.g. AdminTeamMember.id). */
  id: string;
  /** True for the seeded owner (the row with no team-member record), false otherwise. */
  isOwner: boolean;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    hcidDisplay: string | null;
    isActive: boolean;
  };
  /** Assigned role (null while pre-backfill — falls back to legacy enum label). */
  role: {
    id: string | null;
    name: string;
    scope: 'admin' | 'vendor' | 'brand';
    description: string | null;
  };
  /** Vendor portal: outlet scope label (e.g. "Powai" or "All outlets"). */
  outletAccess?: string;
}

export interface TeamRoleDTO {
  id: string;
  name: string;
  scope: 'admin' | 'vendor' | 'brand';
  description: string | null;
  isTemplate: boolean;
}

/**
 * Convert a Prisma row (with the role join included) to the DTO.
 * The caller is responsible for issuing the correct Prisma query that
 * pulls `user` and `roleRef` (the FK to AccountRole).
 */
export function toTeamMemberDTO(args: {
  id: string;
  createdAt: Date;
  legacyRole: string;
  isOwner: boolean;
  user: { id: string; fullName: string; email: string | null; phone: string | null; hcidDisplay: string | null; isActive: boolean };
  roleRef: { id: string; name: string; scope: string; description: string | null } | null;
}): TeamMemberDTO {
  const scope: 'admin' | 'vendor' | 'brand' =
    args.roleRef?.scope === 'vendor' ? 'vendor'
    : args.roleRef?.scope === 'brand' ? 'brand'
    : 'admin';
  return {
    id: args.id,
    isOwner: args.isOwner,
    createdAt: args.createdAt.toISOString(),
    user: args.user,
    role: args.roleRef
      ? { id: args.roleRef.id, name: args.roleRef.name, scope, description: args.roleRef.description }
      // Pre-backfill fallback: synthesise from the legacy enum so the UI still has a label.
      : { id: null, name: legacyEnumLabel(args.legacyRole), scope, description: null },
  };
}

/** Dropdown option shape used by vendor credit grid and similar UIs. */
export interface TeamMemberOption {
  id: string;
  name: string;
}

/** Map a team API DTO row to a select option (nested `user.fullName`, not flat). */
export function toTeamMemberOption(dto: {
  id: string;
  isOwner?: boolean;
  user?: { fullName?: string | null; email?: string | null };
  fullName?: string | null;
  name?: string | null;
  email?: string | null;
}): TeamMemberOption | null {
  if (dto.isOwner || String(dto.id).startsWith('owner-')) return null;
  const name =
    dto.user?.fullName?.trim()
    || dto.fullName?.trim()
    || dto.name?.trim()
    || dto.user?.email?.trim()
    || dto.email?.trim()
    || 'Team member';
  return { id: dto.id, name };
}

export function teamDtoListToOptions(
  list: Array<Parameters<typeof toTeamMemberOption>[0]>,
): TeamMemberOption[] {
  return list.flatMap((dto) => {
    const opt = toTeamMemberOption(dto);
    return opt ? [opt] : [];
  });
}

function legacyEnumLabel(role: string): string {
  switch (role) {
    case 'owner':   return 'Owner';
    case 'manager': return 'Manager';
    case 'editor':  return 'Editor';
    case 'viewer':  return 'Viewer';
    default:        return role;
  }
}

/** Prisma select helper — keep the three GET endpoints in lock-step. */
export const teamMemberInclude = {
  user: { select: { id: true, fullName: true, email: true, phone: true, hcidDisplay: true, isActive: true } },
  roleRef: { select: { id: true, name: true, scope: true, description: true } },
} satisfies Prisma.AdminTeamMemberInclude;
