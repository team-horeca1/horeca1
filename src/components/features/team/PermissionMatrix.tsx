'use client';

import React from 'react';
import { Check } from 'lucide-react';
import {
  moduleLabel,
  scopeActionColumns,
  scopeModuleActions,
  scopeModuleGroups,
  scopeModuleLabels,
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

export { scopeModuleLabels };

function PermissionRow({
  scope,
  moduleKey,
  columns,
  permissions,
  readOnly,
  accent,
  onToggle,
}: {
  scope: RoleScope;
  moduleKey: string;
  columns: string[];
  permissions: PermissionsMap;
  readOnly: boolean;
  accent: string;
  onToggle: (m: string, a: string) => void;
}) {
  const allowed = scopeModuleActions(scope, moduleKey as Parameters<typeof scopeModuleActions>[1]);

  return (
    <tr className="border-t border-gray-50 hover:bg-gray-50/50">
      <td className="px-4 py-2.5 font-bold text-[#181725]">{moduleLabel(scope, moduleKey)}</td>
      {columns.map((a) => {
        const isAllowed = allowed.includes(a);
        const on = !!permissions[moduleKey]?.[a];
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
                  onClick={() => onToggle(moduleKey, a)}
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
  const groups = scopeModuleGroups(scope);

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
          {groups.map((group) => (
            <React.Fragment key={group.label}>
              <tr className="bg-[#F5F5F5] border-t border-gray-100">
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[#7C7C7C]"
                >
                  {group.label}
                </td>
              </tr>
              {group.modules.map((m) => (
                <PermissionRow
                  key={m}
                  scope={scope}
                  moduleKey={m}
                  columns={columns}
                  permissions={permissions}
                  readOnly={readOnly}
                  accent={accent}
                  onToggle={toggle}
                />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
