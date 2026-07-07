'use client';

/**
 * Reusable matrix editor + custom-role CRUD UI shared by the admin, vendor,
 * and brand team pages. Mirrors src/components/auth/RolesPermissionsOverlay.tsx
 * (the customer-profile flow) but parameterised on `endpointBase` so the same
 * widget can call /api/v1/admin/roles, /api/v1/vendor/roles, or
 * /api/v1/brand/roles depending on portal.
 *
 * The component is a slide-over overlay; the parent controls open/close.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Copy, Trash2, X, ChevronLeft } from 'lucide-react';
import { PermissionMatrix, countMatrixPermissions } from './PermissionMatrix';
import { FormErrorBanner } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';
import { toast } from 'sonner';
import type { RoleScope } from '@/lib/permissions/portalFeatures';

type PermissionsJson = Record<string, Record<string, boolean>>;

export interface Role {
    id: string;
    name: string;
    description: string | null;
    scope: 'admin' | 'vendor' | 'brand' | 'account' | 'delivery' | string;
    isTemplate: boolean;
    permissions: PermissionsJson;
}

interface TeamRolesEditorProps {
    isOpen: boolean;
    onClose: () => void;
    /** Endpoint base for list/create/PATCH/DELETE — e.g. "/api/v1/admin/roles". */
    endpointBase: string;
    /** Brand colour used for the primary action; defaults to neutral. */
    accent?: string;
    /** Optional callback so the parent team page can refresh its role dropdown. */
    onRolesChanged?: () => void;
    /** Role-scope; the permission matrix is narrowed to modules relevant for
     *  this scope (e.g. customer-team roles don't see GRN / dispatch). */
    scope?: RoleScope;
}

export function TeamRolesEditor({
    isOpen,
    onClose,
    endpointBase,
    accent = '#53B175',
    onRolesChanged,
    scope,
}: TeamRolesEditorProps) {
    const effectiveScope = scope ?? 'admin';
    const [modules, setModules] = useState<Record<string, readonly string[]>>({});
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [newFromTemplate, setNewFromTemplate] = useState<Role | null>(null);
    const [newBlank, setNewBlank] = useState(false);

    const load = () => {
        Promise.resolve().then(() => setLoading(true));
        const registryUrl = `/api/v1/permissions/registry?scope=${effectiveScope}`;
        Promise.all([
            fetch(registryUrl).then((r) => r.json()),
            fetch(endpointBase).then((r) => r.json()),
        ])
            .then(([m, r]) => {
                if (m.success) setModules(m.data.modules);
                if (r.success) setRoles(r.data);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (isOpen) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, endpointBase]);

    const customRoles = useMemo(() => roles.filter((r) => !r.isTemplate), [roles]);
    const templates = useMemo(() => roles.filter((r) => r.isTemplate), [roles]);

    if (!isOpen) return null;

    const handleSaved = () => {
        setEditingRole(null);
        setNewFromTemplate(null);
        setNewBlank(false);
        load();
        onRolesChanged?.();
    };

    return (
        <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
            <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[680px] md:mt-[5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-[#F2F3F2] md:bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
                <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative bg-white border-b border-gray-100">
                    <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10">
                        <ChevronLeft size={20} className="text-[#181725]" />
                    </button>
                    <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">
                        Roles &amp; Permissions
                    </h2>
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
                                <p className="text-[11px] text-[#7C7C7C] mt-0.5">Build your own roles — edit any time.</p>
                            </div>
                            <button
                                onClick={() => setNewBlank(true)}
                                className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-bold text-white rounded-lg shadow-sm"
                                style={{ backgroundColor: accent }}
                            >
                                <Plus size={14} /> New role
                            </button>
                        </div>

                        {loading ? (
                            <div className="py-6 flex justify-center"><Loader2 className="animate-spin" style={{ color: accent }} /></div>
                        ) : customRoles.length === 0 ? (
                            <p className="text-[12px] text-[#AEAEAE] py-6 text-center">
                                No custom roles yet. Start from a template below or click <strong>New role</strong>.
                            </p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {customRoles.map((r) => (
                                    <li key={r.id} className="py-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13.5px] font-bold text-[#181725]">{r.name}</p>
                                            {r.description && <p className="text-[12px] text-[#7C7C7C] truncate">{r.description}</p>}
                                            <p className="text-[11px] text-[#AEAEAE] mt-1">{countMatrixPermissions(r.permissions, effectiveScope)} permissions · {r.scope}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                onClick={() => setEditingRole(r)}
                                                className="px-2.5 py-1.5 text-[12px] font-bold hover:bg-gray-50 rounded-lg transition-colors"
                                                style={{ color: accent }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm(`Delete role "${r.name}"?`)) return;
                                                    const res = await fetch(`${endpointBase}/${r.id}`, { method: 'DELETE' });
                                                    const json = await res.json();
                                                    if (!json.success) { alert(json.error?.message ?? 'Could not delete'); return; }
                                                    load();
                                                    onRolesChanged?.();
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
                        <p className="text-[11px] text-[#7C7C7C] mb-4">Duplicate a template, rename, edit permissions, save.</p>
                        {loading ? (
                            <div className="py-6 flex justify-center"><Loader2 className="animate-spin" style={{ color: accent }} /></div>
                        ) : templates.length === 0 ? (
                            <p className="text-[12px] text-[#AEAEAE] py-6 text-center">No templates available.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {templates.map((t) => (
                                    <li key={t.id} className="py-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="text-[13.5px] font-bold text-[#181725]">{t.name}</p>
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-50 text-purple-600">{t.scope}</span>
                                            </div>
                                            {t.description && <p className="text-[12px] text-[#7C7C7C] mt-0.5">{t.description}</p>}
                                            <p className="text-[11px] text-[#AEAEAE] mt-1">{countMatrixPermissions(t.permissions, effectiveScope)} permissions</p>
                                        </div>
                                        <button
                                            onClick={() => setNewFromTemplate(t)}
                                            className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors border border-gray-100 shrink-0"
                                        >
                                            <Copy size={12} /> Duplicate
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>

            {(editingRole || newFromTemplate || newBlank) && (
                <RoleEditorModal
                    endpointBase={endpointBase}
                    scope={effectiveScope}
                    accent={accent}
                    existing={editingRole}
                    template={newFromTemplate}
                    isBlank={newBlank}
                    onClose={() => { setEditingRole(null); setNewFromTemplate(null); setNewBlank(false); }}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
}

function RoleEditorModal({
    endpointBase, scope, accent, existing, template, isBlank, onClose, onSaved,
}: {
    endpointBase: string;
    scope: RoleScope;
    accent: string;
    existing: Role | null;
    template: Role | null;
    isBlank: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    const seed = existing ?? template;
    const [name, setName] = useState(existing ? existing.name : template ? `${template.name} (copy)` : '');
    const [description, setDescription] = useState(seed?.description ?? '');
    const [permissions, setPermissions] = useState<PermissionsJson>(() => structuredClone(seed?.permissions ?? {}));
    const [submitting, setSubmitting] = useState(false);
    const [bannerError, setBannerError] = useState<string | null>(null);

    const submit = async () => {
        setSubmitting(true);
        setBannerError(null);
        const url = existing ? `${endpointBase}/${existing.id}` : endpointBase;
        const method = existing ? 'PATCH' : 'POST';
        const body = existing
            ? { name, description, permissions }
            : { name, description, permissions };
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const json = await parseJsonResponse(res);
        setSubmitting(false);
        if (json.success) onSaved();
        else {
            const err = json.error;
            const msg = typeof err === 'string' ? err : err?.message ?? 'Could not save role';
            setBannerError(msg);
            toast.error(msg);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[15000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-[820px] max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
                <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="text-[16px] font-bold text-[#181725]">
                            {existing ? `Edit Role: ${existing.name}` : isBlank ? 'New Role' : `Copy of ${template?.name ?? 'template'}`}
                        </h3>
                        {template && !existing && <p className="text-[12px] text-[#7C7C7C] mt-0.5">Based on system template &quot;{template.name}&quot;</p>}
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
                </div>

                <FormErrorBanner message={bannerError} className="mx-5" />

                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="block sm:col-span-1">
                            <span className="text-[11px] font-semibold text-[#AEAEAE] uppercase tracking-wider">Role name</span>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="mt-1.5 w-full px-3.5 py-2.5 text-[13px] border border-[#EEEEEE] rounded-xl outline-none focus:border-gray-400 text-gray-700 bg-[#FAFAFA] focus:bg-white transition-all"
                            />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-[11px] font-semibold text-[#AEAEAE] uppercase tracking-wider">Description</span>
                            <input
                                type="text"
                                value={description ?? ''}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What does this role do?"
                                className="mt-1.5 w-full px-3.5 py-2.5 text-[13px] border border-[#EEEEEE] rounded-xl outline-none focus:border-gray-400 text-gray-700 bg-[#FAFAFA] focus:bg-white transition-all"
                            />
                        </label>
                    </div>

                    <h4 className="text-[13.5px] font-bold text-[#181725] pt-2 border-t border-[#F0F0F0]">Permissions Matrix</h4>
                    <PermissionMatrix
                        scope={scope}
                        permissions={permissions}
                        onChange={setPermissions}
                        accent={accent}
                    />
                </div>

                <div className="p-4 border-t border-[#F0F0F0] flex items-center justify-between shrink-0 bg-[#F9F9F9]">
                    <p className="text-[11px] text-[#AEAEAE] font-semibold">{countMatrixPermissions(permissions, scope)} permission(s) selected</p>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-[#666] hover:bg-gray-100 rounded-xl">Cancel</button>
                        <button
                            onClick={submit}
                            disabled={submitting || !name}
                            className="px-4 py-2 text-white text-[13px] font-bold rounded-xl disabled:opacity-50 flex items-center gap-2"
                            style={{ backgroundColor: accent }}
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
