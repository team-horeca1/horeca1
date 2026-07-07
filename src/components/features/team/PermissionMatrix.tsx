'use client';

import React from 'react';
import { Check } from 'lucide-react';
import {
  moduleLabel,
  scopeActionColumns,
  scopeModuleKeys,
  scopeModuleActions,
  type RoleScope,
} from '@/lib/permissions/portalFeatures';
import { countScopedPermissions } from '@/lib/permissions/engine';
type PermissionsMap = Record<string, Record<string, boolean>>;

interface PermissionMatrixProps {
  scope: RoleScope;
  permissions: PermissionsMap;
  onChange?: (next: PermissionsMap) => void;
  readOnly?: boolean;
  accent?: string;
  className?: string;
}

export function countMatrixPermissions(
  permissions: PermissionsMap | null | undefined,
  scope: RoleScope,
): number {
  return countScopedPermissions(permissions as Parameters<typeof countScopedPermissions>[0], scope);
}

export function PermissionMatrix({
  scope,
  permissions,
  onChange,
  readOnly = false,
  accent = '#53B175',
  className = '',
}: PermissionMatrixProps) {
  const columns = scopeActionColumns(scope);
  const modules = scopeModuleKeys(scope);

  const toggle = (m: string, a: string) => {
    if (readOnly || !onChange) return;
    const next: PermissionsMap = { ...permissions, [m]: { ...(permissions[m] ?? {}) } };
    const mod = next[m] as Record<string, boolean>;
    mod[a] = !mod[a];
    if (!mod[a]) delete mod[a];
    if (Object.keys(mod).length === 0) delete next[m];
    onChange(next);
  };

  return (
    <div className={`border border-gray-100 rounded-xl overflow-x-auto ${className}`}>
      <table className="w-full text-[12px] min-w-[480px]">
        <thead className="bg-[#FAFAFA] text-gray-500">
          <tr>
            <th className="text-left px-4 py-3 font-bold uppercase tracking-wider">Module</th>
            {columns.map((a) => (
              <th key={a} className="text-center px-2 py-3 font-bold uppercase tracking-wider w-[72px] capitalize">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const allowed = scopeModuleActions(scope, m);
            return (
              <tr key={m} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-bold text-[#181725]">{moduleLabel(scope, m)}</td>
                {columns.map((a) => {
                  const isAllowed = allowed.includes(a);
                  const on = !!permissions[m]?.[a];
                  return (
                    <td key={a} className="text-center px-2 py-2.5">
                      {isAllowed ? (
                        readOnly ? (
                          <span
                            className="w-[24px] h-[24px] rounded-md border-2 flex items-center justify-center mx-auto"
                            style={on
                              ? { borderColor: accent, backgroundColor: accent, color: 'white' }
                              : { borderColor: '#E5E7EB', backgroundColor: 'white' }}
                          >
                            {on && <Check size={14} />}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggle(m, a)}
                            className="w-[24px] h-[24px] rounded-md border-2 flex items-center justify-center transition-colors mx-auto"
                            style={on
                              ? { borderColor: accent, backgroundColor: accent, color: 'white' }
                              : { borderColor: '#E5E7EB', backgroundColor: 'white' }}
                          >
                            {on && <Check size={14} />}
                          </button>
                        )
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
