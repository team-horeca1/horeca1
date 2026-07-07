/**
 * Permission engine — flatten, check, and merge permissions for a request.
 *
 * Locked-in design choices (see docs/multi-account-rbac-implementation-plan.md):
 *   - Union merge across UserRole rows. Roles only grant; never restrict.
 *   - A UserRole applies if userId = current AND businessAccountId = active
 *     AND (outletId IS NULL OR outletId = activeOutletId).
 *
 * Replaces the hardcoded matrix in the legacy src/lib/teamPermissions.ts.
 */

import { Errors } from '@/middleware/errorHandler';
import { ALL_PERMISSION_KEYS, type PermissionKey, type PermissionsJson, type RoleScope } from './registry';
import { modulesForPortalScope, scopeModuleKeys, type Module } from './portalFeatures';

// ─── flatten ──────────────────────────────────────────────────────────────

/** Convert a permissions JSON object into the flat string set used at request time. */
export function flatten(permissions: PermissionsJson | null | undefined): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  if (!permissions) return out;
  for (const [m, actions] of Object.entries(permissions)) {
    if (!actions) continue;
    for (const [a, on] of Object.entries(actions)) {
      if (on === true) out.add(`${m}.${a}` as PermissionKey);
    }
  }
  return out;
}

// ─── merge (UNION — additive, locked-in) ──────────────────────────────────

export function mergePermissions(...sets: Array<Set<PermissionKey> | PermissionsJson | null | undefined>): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  for (const s of sets) {
    if (!s) continue;
    if (s instanceof Set) {
      for (const k of s) out.add(k);
    } else {
      for (const k of flatten(s)) out.add(k);
    }
  }
  return out;
}

// ─── checks ───────────────────────────────────────────────────────────────

export interface SessionLike {
  permissions?: PermissionKey[] | readonly PermissionKey[];
}

export function hasPermission(session: SessionLike | null | undefined, key: PermissionKey): boolean {
  if (!session?.permissions) return false;
  return (session.permissions as readonly PermissionKey[]).includes(key);
}

export function hasAnyPermission(session: SessionLike | null | undefined, ...keys: PermissionKey[]): boolean {
  if (!session?.permissions) return false;
  const perms = session.permissions as readonly PermissionKey[];
  return keys.some((k) => perms.includes(k));
}

export function hasAllPermissions(session: SessionLike | null | undefined, ...keys: PermissionKey[]): boolean {
  if (!session?.permissions) return false;
  const perms = session.permissions as readonly PermissionKey[];
  return keys.every((k) => perms.includes(k));
}

/**
 * Throwing variant used inside route handlers that are already wrapped in
 * adminOnly / vendorOnly / brandOnly. Mirrors the contract of the legacy
 * `requireAdminPerm` / `requireVendorPerm` / `requireBrandPerm` so swapping
 * one for the other is a mechanical edit. Errors.forbidden is caught by
 * errorResponse() in middleware/errorHandler.ts and rendered as a 403.
 */
export function requirePermission(session: SessionLike | null | undefined, key: PermissionKey): void {
  if (!hasPermission(session, key)) {
    throw Errors.forbidden(`Requires ${key} permission`);
  }
}

export function requireAnyPermissionInline(session: SessionLike | null | undefined, ...keys: PermissionKey[]): void {
  if (!hasAnyPermission(session, ...keys)) {
    throw Errors.forbidden(`Requires one of: ${keys.join(', ')}`);
  }
}

// ─── utility: validate a PermissionsJson at write time ───────────────────

export function sanitizePermissions(input: unknown): PermissionsJson {
  if (!input || typeof input !== 'object') return {};
  const validSet = new Set<string>(ALL_PERMISSION_KEYS);
  const out: PermissionsJson = {};
  for (const [m, actions] of Object.entries(input as Record<string, unknown>)) {
    if (!actions || typeof actions !== 'object') continue;
    const cleaned: Record<string, boolean> = {};
    for (const [a, on] of Object.entries(actions as Record<string, unknown>)) {
      if (on === true && validSet.has(`${m}.${a}`)) {
        cleaned[a] = true;
      }
    }
    if (Object.keys(cleaned).length) (out as Record<string, Record<string, boolean>>)[m] = cleaned;
  }
  return out;
}

/** Strip permissions to modules/actions valid for a portal scope. */
export function sanitizePermissionsForScope(input: unknown, scope: RoleScope): PermissionsJson {
  const base = sanitizePermissions(input);
  const allowedModules = new Set(scopeModuleKeys(scope));
  const scopedActions = modulesForPortalScope(scope);
  const out: PermissionsJson = {};
  for (const [m, actions] of Object.entries(base)) {
    if (!allowedModules.has(m as Module)) continue;
    const validActions = new Set(scopedActions[m] ?? []);
    const cleaned: Record<string, boolean> = {};
    for (const [a, on] of Object.entries(actions ?? {})) {
      if (on === true && validActions.has(a)) cleaned[a] = true;
    }
    if (Object.keys(cleaned).length) (out as Record<string, Record<string, boolean>>)[m] = cleaned;
  }
  return out;
}

/** Count enabled permissions within a scope (for matrix UI labels). */
export function countScopedPermissions(
  permissions: PermissionsJson | null | undefined,
  scope: RoleScope,
): number {
  const scoped = sanitizePermissionsForScope(permissions, scope);
  return Object.values(scoped).reduce(
    (sum, actions) => sum + Object.values(actions ?? {}).filter((v) => v === true).length,
    0,
  );
}
