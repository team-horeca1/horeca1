/**
 * Resolve or update AccountRole rows when inviting/editing team members with a
 * custom permission matrix. Updates the member's existing custom role in place
 * instead of creating a new Custom-* row on every save.
 */
import { prisma } from '@/lib/prisma';
import { sanitizePermissionsForScope } from '@/lib/permissions/engine';
import type { RoleScope } from '@/lib/permissions/portalFeatures';
import type { Prisma } from '@prisma/client';
import { markSessionStaleForRole } from '@/lib/sessionStale';

export function sortPermissionJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortPermissionJson);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, sortPermissionJson(val)]),
    );
  }
  return v;
}

function sanitizeRawPermissions(
  input: Record<string, Record<string, boolean>>,
  scope: RoleScope,
): Prisma.InputJsonValue {
  if (scope === 'admin' || scope === 'account') {
    const ALLOWED = ['view', 'create', 'edit', 'delete', 'approve'];
    const sanitized: Record<string, Record<string, boolean>> = {};
    for (const [mod, actions] of Object.entries(input)) {
      const cleaned: Record<string, boolean> = {};
      for (const [a, v] of Object.entries(actions)) {
        if (ALLOWED.includes(a) && typeof v === 'boolean' && v) cleaned[a] = true;
      }
      if (Object.keys(cleaned).length > 0) sanitized[mod] = cleaned;
    }
    return sanitized;
  }
  return sanitizePermissionsForScope(input, scope) as Prisma.InputJsonValue;
}

export interface ResolvedTeamRole {
  id: string;
  name: string;
  scope: string;
  description: string | null;
}

export async function resolveTeamMemberRoleFromPermissions(args: {
  scope: RoleScope;
  permissions: Record<string, Record<string, boolean>>;
  businessAccountId: string | null;
  createdBy: string;
  /** When editing, pass the member's current roleId to update in place. */
  existingRoleId?: string | null;
}): Promise<ResolvedTeamRole> {
  const { scope, permissions, businessAccountId, createdBy, existingRoleId } = args;
  const sanitized = sanitizeRawPermissions(permissions, scope);

  if (existingRoleId) {
    const existing = await prisma.accountRole.findUnique({
      where: { id: existingRoleId },
      select: {
        id: true,
        name: true,
        scope: true,
        description: true,
        isTemplate: true,
        businessAccountId: true,
      },
    });
    if (
      existing
      && existing.scope === scope
      && !existing.isTemplate
      && (scope === 'admin' ? existing.businessAccountId === null : existing.businessAccountId === businessAccountId)
    ) {
      const updated = await prisma.accountRole.update({
        where: { id: existingRoleId },
        data: { permissions: sanitized },
        select: { id: true, name: true, scope: true, description: true },
      });
      await markSessionStaleForRole(existingRoleId);
      return updated;
    }
  }

  const sanitizedStr = JSON.stringify(sortPermissionJson(sanitized));
  const candidates = await prisma.accountRole.findMany({
    where:
      scope === 'admin'
        ? { scope: 'admin', isTemplate: false, businessAccountId: null }
        : {
            scope,
            isTemplate: false,
            ...(businessAccountId ? { businessAccountId } : {}),
          },
    select: { id: true, name: true, scope: true, description: true, permissions: true },
  });

  const match = candidates.find(
    (r) => JSON.stringify(sortPermissionJson(r.permissions as Record<string, unknown>)) === sanitizedStr,
  );
  if (match) {
    return {
      id: match.id,
      name: match.name,
      scope: match.scope,
      description: match.description,
    };
  }

  return prisma.accountRole.create({
    data: {
      businessAccountId,
      name: `Custom-${Date.now().toString(36)}`,
      scope,
      permissions: sanitized,
      isTemplate: false,
      createdBy,
    },
    select: { id: true, name: true, scope: true, description: true },
  });
}

/** Hide orphan custom roles from role pickers — keep templates + roles assigned to someone. */
export function filterRolesForDisplay<T extends { id: string; isTemplate: boolean }>(
  roles: T[],
  assignedRoleIds: ReadonlySet<string>,
): T[] {
  return roles.filter((r) => r.isTemplate || assignedRoleIds.has(r.id));
}
