'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, Plus, Copy, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PermissionMatrix, countMatrixPermissions } from '@/components/features/team/PermissionMatrix';
import type { RoleScope } from '@/lib/permissions/portalFeatures';

type PermissionsJson = Record<string, Record<string, boolean>>;

interface Role {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  isTemplate: boolean;
  permissions: PermissionsJson;
}

interface RolesPermissionsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

export function RolesPermissionsOverlay({ isOpen, onClose, accountId }: RolesPermissionsOverlayProps) {
  const accountScope: RoleScope = 'account';
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [newRoleFromTemplate, setNewRoleFromTemplate] = useState<Role | null>(null);

  const load = () => {
    if (!accountId) return;
    Promise.resolve().then(() => setLoading(true));
    Promise.all([
      fetch(`/api/v1/permissions/registry?scope=${accountScope}`).then((r) => r.json()),
      fetch(`/api/v1/account/${accountId}/roles?templates=true`).then((r) => r.json()),
    ]).then(([m, r]) => {
      if (r.success) setRoles(r.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const customRoles = useMemo(() => roles.filter((r) => !r.isTemplate), [roles]);
  const templates   = useMemo(() => roles.filter((r) =>  r.isTemplate), [roles]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
      <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[600px] md:mt-[5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-[#F2F3F2] md:bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative bg-white border-b border-gray-100">
          <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10">
            <ChevronLeft size={20} className="text-[#181725]" />
          </button>
          <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">Roles &amp; Permissions</h2>
          <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-5 pb-28 md:pb-6 space-y-4">
          {/* Custom roles */}
          <section className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[14px] font-bold text-[#181725]">Custom Roles ({customRoles.length})</h3>
                <p className="text-[11px] text-[#7C7C7C] mt-0.5">Edit custom roles or copy a template below.</p>
              </div>
            </div>

            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[#53B175]" /></div>
            ) : customRoles.length === 0 ? (
              <p className="text-[12px] text-[#AEAEAE] py-6 text-center">
                No custom roles yet. Duplicate a template below to start.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {customRoles.map((r) => (
                  <li key={r.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold text-[#181725]">{r.name}</p>
                      {r.description && <p className="text-[12px] text-[#7C7C7C] truncate">{r.description}</p>}
                      <p className="text-[11px] text-[#AEAEAE] mt-1">
                        {countMatrixPermissions(r.permissions, accountScope)} permissions · {r.scope}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setEditingRole(r)}
                        className="px-2.5 py-1.5 text-[12px] font-bold text-[#53B175] hover:bg-[#EEF8F1] rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete role "${r.name}"?`)) return;
                          const res = await fetch(`/api/v1/account/${accountId}/roles/${r.id}`, { method: 'DELETE' });
                          const json = await res.json();
                          if (!json.success) { alert(json.error?.message ?? 'Could not delete'); return; }
                          load();
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Templates */}
          <section className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-[14px] font-bold text-[#181725] mb-1">System Templates</h3>
            <p className="text-[11px] text-[#7C7C7C] mb-4">
              Duplicate a template into your account, then edit freely.
            </p>
            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[#53B175]" /></div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {templates.map((t) => (
                  <li key={t.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[13.5px] font-bold text-[#181725]">{t.name}</p>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-50 text-purple-600">
                          {t.scope}
                        </span>
                      </div>
                      {t.description && <p className="text-[12px] text-[#7C7C7C] mt-0.5">{t.description}</p>}
                      <p className="text-[11px] text-[#AEAEAE] mt-1">{countMatrixPermissions(t.permissions, accountScope)} permissions</p>
                    </div>
                    <button
                      onClick={() => setNewRoleFromTemplate(t)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors border border-gray-100 shrink-0"
                    >
                      <Copy size={12} />
                      Duplicate
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {(editingRole || newRoleFromTemplate) && (
        <RoleEditorModal
          accountId={accountId}
          scope={accountScope}
          existing={editingRole}
          template={newRoleFromTemplate}
          onClose={() => { setEditingRole(null); setNewRoleFromTemplate(null); }}
          onSaved={() => { setEditingRole(null); setNewRoleFromTemplate(null); load(); }}
        />
      )}
    </div>
  );
}

function RoleEditorModal({
  accountId, scope, existing, template, onClose, onSaved,
}: {
  accountId: string;
  scope: RoleScope;
  existing: Role | null;
  template: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const seed = existing ?? template;
  const [name, setName] = useState(existing ? existing.name : template ? `${template.name} (copy)` : '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [roleScope, setRoleScope] = useState<string>(seed?.scope ?? scope);
  const [permissions, setPermissions] = useState<PermissionsJson>(() => structuredClone(seed?.permissions ?? {}));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matrixScope = (existing?.scope ?? template?.scope ?? roleScope) as RoleScope;

  const submit = async () => {
    setSubmitting(true); setError(null);
    const url = existing
      ? `/api/v1/account/${accountId}/roles/${existing.id}`
      : `/api/v1/account/${accountId}/roles`;
    const method = existing ? 'PATCH' : 'POST';
    const body = existing
      ? { name, description, permissions }
      : { name, description, scope: roleScope, permissions };
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSubmitting(false);
    if (json.success) onSaved();
    else setError(json.error?.message ?? 'Could not save role');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[15000] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-[800px] max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
        <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[16px] font-bold text-[#181725]">
              {existing ? `Edit Role: ${existing.name}` : 'New Custom Role'}
            </h3>
            {template && (
              <p className="text-[12px] text-[#7C7C7C] mt-0.5">Copy of system template &quot;{template.name}&quot;</p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block sm:col-span-2">
              <span className="text-[11px] font-semibold text-[#AEAEAE] uppercase tracking-wider">Role name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 text-[13px] border border-[#EEEEEE] rounded-xl outline-none focus:border-[#53B175] focus:ring-2 focus:ring-[#53B175]/10 text-gray-700 bg-[#FAFAFA] focus:bg-white transition-all"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-[#AEAEAE] uppercase tracking-wider">Scope</span>
              <select
                value={roleScope}
                onChange={(e) => setRoleScope(e.target.value)}
                disabled={!!existing}
                className="mt-1.5 w-full px-3.5 py-2.5 text-[13px] border border-[#EEEEEE] rounded-xl outline-none focus:border-[#53B175] focus:ring-2 focus:ring-[#53B175]/10 text-gray-700 bg-white disabled:bg-gray-50 transition-all"
              >
                <option value="account">Account</option>
                <option value="vendor">Vendor</option>
                <option value="brand">Brand</option>
                <option value="admin">Admin</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
            <label className="block sm:col-span-3">
              <span className="text-[11px] font-semibold text-[#AEAEAE] uppercase tracking-wider">Description</span>
              <input
                type="text"
                value={description ?? ''}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this role do?"
                className="mt-1.5 w-full px-3.5 py-2.5 text-[13px] border border-[#EEEEEE] rounded-xl outline-none focus:border-[#53B175] focus:ring-2 focus:ring-[#53B175]/10 text-gray-700 bg-[#FAFAFA] focus:bg-white transition-all"
              />
            </label>
          </div>

          <h4 className="text-[13.5px] font-bold text-[#181725] pt-2 border-t border-[#F0F0F0]">Permissions Matrix</h4>
          <PermissionMatrix
            scope={matrixScope}
            permissions={permissions}
            onChange={setPermissions}
            accent="#53B175"
          />
        </div>

        <div className="p-4 border-t border-[#F0F0F0] flex items-center justify-between shrink-0 bg-[#F9F9F9]">
          <p className="text-[11px] text-[#AEAEAE] font-semibold">
            {countMatrixPermissions(permissions, matrixScope)} permission(s) selected
          </p>
          <div className="flex items-center gap-2">
            {error && <p className="text-[12px] text-red-500 mr-2">{error}</p>}
            <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-[#666] hover:bg-gray-100 rounded-xl">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || !name}
              className="px-4 py-2 bg-[#53B175] text-white text-[13px] font-bold rounded-xl hover:bg-[#48a068] disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {existing ? 'Save changes' : 'Create role'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
