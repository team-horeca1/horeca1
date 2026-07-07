'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Check, Loader2, AlertCircle, Store, ShoppingCart,
  CreditCard, Eye, Crown, Shield, Users, DollarSign, Package, Archive, Edit3, Pencil,
} from 'lucide-react';
import type { RoleItem } from './AddMemberWizard';
import { PermissionMatrix, countMatrixPermissions } from './PermissionMatrix';
import type { RoleScope } from '@/lib/permissions/portalFeatures';
import { FormErrorBanner, useFormFeedback } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';
import { toast } from 'sonner';

interface OutletItem {
  id: string;
  name: string;
  code?: string | null;
  addressLine?: string;
  city?: string | null;
  pincode?: string | null;
}

interface MemberDetails {
  user: { fullName: string; email: string | null; phone: string | null };
  role: { id: string | null; name: string };
  outletIds: string[];
  storefrontAccess: { view: boolean; order: boolean; pay: boolean };
}

interface EditMemberModalProps {
  memberId: string;
  memberName: string;
  initialRoleId?: string | null;
  roles: RoleItem[];
  scope?: RoleScope;
  accent?: string;
  teamMemberEndpoint: string;
  outletsEndpoint?: string;
  outlets?: Array<{ id: string; name: string }>;
  userRoles?: Array<{ id: string; outletId: string | null; role: { id: string; name: string } }>;
  showOutlets?: boolean;
  showStorefront?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type PermissionsMap = Record<string, Record<string, boolean>>;

const ROLE_STYLES: Record<string, { color: string; bg: string; border: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  'Vendor Admin': { color: '#D97706', bg: '#FFF7E6', border: '#F59E0B', Icon: Crown },
  'Vendor Manager': { color: '#2563EB', bg: '#EFF6FF', border: '#3B82F6', Icon: Shield },
  'Sales Rep': { color: '#059669', bg: '#ECFDF5', border: '#10B981', Icon: Users },
  'Finance Executive': { color: '#7C3AED', bg: '#F3F0FF', border: '#8B5CF6', Icon: DollarSign },
  'Order Manager': { color: '#EA580C', bg: '#FFF7ED', border: '#F97316', Icon: Package },
  'Warehouse Manager': { color: '#374151', bg: '#F3F4F6', border: '#6B7280', Icon: Archive },
  'Vendor Editor': { color: '#DB2777', bg: '#FDF2F8', border: '#EC4899', Icon: Edit3 },
  'Vendor Viewer': { color: '#6B7280', bg: '#F3F4F6', border: '#9CA3AF', Icon: Eye },
  'Brand Admin': { color: '#D97706', bg: '#FFF7E6', border: '#F59E0B', Icon: Crown },
  'Brand Manager': { color: '#2563EB', bg: '#EFF6FF', border: '#3B82F6', Icon: Shield },
  'Brand Editor': { color: '#DB2777', bg: '#FDF2F8', border: '#EC4899', Icon: Edit3 },
  'Brand Viewer': { color: '#6B7280', bg: '#F3F4F6', border: '#9CA3AF', Icon: Eye },
  'Super Admin': { color: '#D97706', bg: '#FFF7E6', border: '#F59E0B', Icon: Crown },
  'Ops Admin': { color: '#2563EB', bg: '#EFF6FF', border: '#3B82F6', Icon: Shield },
  Owner: { color: '#D97706', bg: '#FFF7E6', border: '#F59E0B', Icon: Crown },
  Manager: { color: '#2563EB', bg: '#EFF6FF', border: '#3B82F6', Icon: Shield },
  Editor: { color: '#DB2777', bg: '#FDF2F8', border: '#EC4899', Icon: Edit3 },
  Viewer: { color: '#6B7280', bg: '#F3F4F6', border: '#9CA3AF', Icon: Eye },
};

function getRoleStyle(name: string) {
  return ROLE_STYLES[name] ?? { color: '#6B7280', bg: '#F3F4F6', border: '#9CA3AF', Icon: Eye };
}

export function EditMemberModal({
  memberId,
  memberName,
  initialRoleId,
  roles,
  scope = 'vendor',
  accent = '#299E60',
  teamMemberEndpoint,
  outletsEndpoint,
  outlets: outletsProp = [],
  userRoles,
  showOutlets = true,
  showStorefront = true,
  onClose,
  onSaved,
}: EditMemberModalProps) {
  const isPortalScope = scope === 'admin' || scope === 'brand';
  const isAccountScope = scope === 'account';
  const hasMemberGet = scope === 'vendor';

  const [loading, setLoading] = useState(hasMemberGet);
  const [outlets, setOutlets] = useState<OutletItem[]>(outletsProp);

  const seedRoleId = initialRoleId ?? userRoles?.[0]?.role.id ?? roles[0]?.id ?? '';
  const [allOutlets, setAllOutlets] = useState(true);
  const [selectedOutletIds, setSelectedOutletIds] = useState<Set<string>>(new Set());
  const [selectedRoleId, setSelectedRoleId] = useState(seedRoleId);
  const [accountOutletId, setAccountOutletId] = useState(userRoles?.[0]?.outletId ?? '');
  const [permissions, setPermissions] = useState<PermissionsMap>(() => {
    const r = roles.find((x) => x.id === seedRoleId);
    return r ? structuredClone(r.permissions) : {};
  });
  const [sfView, setSfView] = useState(false);
  const [sfOrder, setSfOrder] = useState(false);
  const [sfPay, setSfPay] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const { bannerError, clearErrors, applyApiError, applyValidationErrors } = useFormFeedback();

  useEffect(() => {
    if (!hasMemberGet) {
      setLoading(false);
      return;
    }

    const memberUrl = teamMemberEndpoint || `/api/v1/vendor/team/${memberId}`;
    const outletsUrl = outletsEndpoint ?? '/api/v1/vendor/outlets';

    Promise.all([
      fetch(memberUrl).then((r) => r.json()),
      fetch(outletsUrl).then((r) => r.json()),
    ])
      .then(([memberJson, outletsJson]) => {
        if (outletsJson.success) {
          const data = outletsJson.data;
          setOutlets(Array.isArray(data) ? data : (data.outlets ?? []));
        }
        if (memberJson.success) {
          const d = memberJson.data as MemberDetails;
          if (d.outletIds.length === 0) {
            setAllOutlets(true);
            setSelectedOutletIds(new Set());
          } else {
            setAllOutlets(false);
            setSelectedOutletIds(new Set(d.outletIds));
          }
          const matchingRole = roles.find((r) => r.id === d.role.id);
          if (matchingRole) {
            setSelectedRoleId(matchingRole.id);
            setPermissions(structuredClone(matchingRole.permissions));
          }
          setSfView(d.storefrontAccess.view);
          setSfOrder(d.storefrontAccess.order);
          setSfPay(d.storefrontAccess.pay);
        }
      })
      .catch(() => {
        applyValidationErrors({ _server: 'Failed to load member details' }, 'Failed to load member details');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [hasMemberGet, memberId, teamMemberEndpoint, outletsEndpoint, roles]);

  const templates = roles.filter((r) => !r.name.startsWith('Storefront'));
  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isDirty =
    selectedRole && JSON.stringify(permissions) !== JSON.stringify(selectedRole.permissions);

  const handleSelectRole = useCallback((role: RoleItem) => {
    setSelectedRoleId(role.id);
    setPermissions(structuredClone(role.permissions));
  }, []);

  const handlePermissionsChange = useCallback((next: PermissionsMap) => {
    setPermissions(next);
    setSelectedRoleId('');
  }, []);

  const totalSelected = countMatrixPermissions(permissions, scope);

  const toggleOutlet = (id: string) => {
    setAllOutlets(false);
    setSelectedOutletIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSubmitting(true);
    clearErrors();
    try {
      let body: Record<string, unknown>;

      if (isAccountScope) {
        if (!selectedRoleId) {
          applyValidationErrors({}, 'Pick a role');
          setSubmitting(false);
          return;
        }
        body = {
          assignments: [{ roleId: selectedRoleId, outletId: accountOutletId || null }],
        };
      } else if (isPortalScope) {
        if (!selectedRoleId && Object.keys(permissions).length === 0) {
          applyValidationErrors({}, 'Select at least one permission');
          setSubmitting(false);
          return;
        }
        body = isDirty ? { permissions } : { roleId: selectedRoleId };
      } else {
        if (Object.keys(permissions).length === 0) {
          applyValidationErrors({}, 'Select at least one permission');
          setSubmitting(false);
          return;
        }
        body = { permissions };
        if (!allOutlets) body.outletIds = Array.from(selectedOutletIds);
        else body.outletIds = [];
        if (showStorefront) {
          body.storefrontAccess = { view: sfView, order: sfOrder, pay: sfPay };
        }
      }

      const res = await fetch(teamMemberEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await parseJsonResponse(res);
      if (!json.success) {
        applyApiError(json);
        return;
      }
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      applyValidationErrors({ _server: msg }, msg);
    } finally {
      setSubmitting(false);
    }
  };

  const displayOutlets = outlets.length > 0 ? outlets : outletsProp;

  return (
    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[20px] w-full max-w-[900px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#FFF7E6] rounded-[10px] flex items-center justify-center">
              <Pencil size={17} className="text-[#F59E0B]" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-[#181725]">Edit Team Member</h3>
              <p className="text-[11px] text-[#AEAEAE] font-medium">
                {memberName}
                {isAccountScope ? ' — role & outlet' : ' — outlet access & role'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-gray-100 transition-colors">
            <X size={16} className="text-[#7C7C7C]" />
          </button>
        </div>

        <FormErrorBanner message={bannerError} className="mx-6" />

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin" style={{ color: accent }} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0 space-y-6">
            {showOutlets && !isPortalScope && !isAccountScope && (
              <section>
                <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2">
                  Outlet Access
                </p>
                <div className="border border-[#EEEEEE] rounded-[12px] divide-y divide-[#F5F5F5] max-h-[260px] overflow-y-auto">
                  <button
                    onClick={() => {
                      setAllOutlets(true);
                      setSelectedOutletIds(new Set());
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#FAFAFA] transition-colors text-left"
                  >
                    <Checkbox checked={allOutlets} accent={accent} />
                    <div>
                      <p className="text-[13px] font-bold text-[#181725]">All outlets (account-wide)</p>
                      <p className="text-[11px] text-[#7C7C7C]">Access all current and future outlets</p>
                    </div>
                  </button>
                  {displayOutlets.map((outlet) => (
                    <button
                      key={outlet.id}
                      onClick={() => toggleOutlet(outlet.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAFA] transition-colors text-left"
                    >
                      <Checkbox
                        checked={!allOutlets && selectedOutletIds.has(outlet.id)}
                        accent={accent}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-[#181725]">{outlet.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2">
                Role templates — click to auto-fill permissions
              </p>
              <div className="flex flex-wrap gap-2">
                {templates.map((r) => {
                  const style = getRoleStyle(r.name);
                  const isSelected = r.id === selectedRoleId;
                  const { Icon } = style;
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSelectRole(r)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[12px] font-bold border-2 transition-all hover:shadow-sm"
                      style={
                        isSelected
                          ? { background: style.bg, borderColor: style.border, color: style.color }
                          : { background: 'white', borderColor: '#EEEEEE', color: '#7C7C7C' }
                      }
                    >
                      <Icon size={13} />
                      {r.name}
                    </button>
                  );
                })}
              </div>
              {selectedRole?.description && (
                <p className="text-[11px] text-[#7C7C7C] mt-2">{selectedRole.description}</p>
              )}
            </section>

            {isAccountScope && displayOutlets.length > 0 && (
              <section>
                <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">
                  Limit to outlet
                </label>
                <select
                  value={accountOutletId}
                  onChange={(e) => setAccountOutletId(e.target.value)}
                  className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none bg-[#FAFAFA] focus:bg-white transition-colors"
                  style={{ borderColor: undefined }}
                >
                  <option value="">All outlets</option>
                  {displayOutlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </section>
            )}

            {!isAccountScope && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider">Permissions</p>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      totalSelected > 0 ? 'bg-[#ECFDF5] text-[#299E60]' : 'bg-[#F5F5F5] text-[#AEAEAE]'
                    }`}
                  >
                    {totalSelected} selected
                  </span>
                </div>
                <PermissionMatrix
                  scope={scope}
                  permissions={permissions}
                  onChange={handlePermissionsChange}
                  accent={accent}
                />
              </section>
            )}

            {showStorefront && !isPortalScope && !isAccountScope && (
              <section className="bg-[#F0F7FF] border border-[#BFDBFE] rounded-[12px] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Store size={15} className="text-[#2563EB]" />
                  <p className="text-[13px] font-bold text-[#181725]">Storefront Access</p>
                </div>
                <div className="space-y-2.5">
                  {(
                    [
                      { label: 'Browse storefront & view products', Icon: Eye, checked: sfView, toggle: () => setSfView(!sfView) },
                      { label: 'Place orders on storefront', Icon: ShoppingCart, checked: sfOrder, toggle: () => setSfOrder(!sfOrder) },
                      { label: 'Make payments on storefront', Icon: CreditCard, checked: sfPay, toggle: () => setSfPay(!sfPay) },
                    ] as const
                  ).map(({ label, Icon, checked, toggle }) => (
                    <button key={label} onClick={toggle} className="flex items-center gap-3 w-full text-left">
                      <Checkbox checked={checked} accent="#2563EB" />
                      <Icon size={13} className={checked ? 'text-[#2563EB]' : 'text-[#9CA3AF]'} />
                      <span className={`text-[12px] font-medium ${checked ? 'text-[#181725]' : 'text-[#6B7280]'}`}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}

        {!loading && (
          <div className="px-6 py-4 border-t border-[#F0F0F0] flex items-center justify-end gap-3 shrink-0 bg-[#FAFAFA] rounded-b-[20px]">
            <button
              onClick={onClose}
              className="h-[40px] px-5 text-[13px] font-bold text-[#7C7C7C] hover:text-[#181725] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={submitting}
              className="h-[42px] px-6 text-white rounded-[10px] text-[13px] font-bold disabled:opacity-50 flex items-center gap-2 transition-colors shadow-sm"
              style={{ backgroundColor: accent }}
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Checkbox({ checked, accent }: { checked: boolean; accent: string }) {
  return (
    <div
      className="w-[20px] h-[20px] rounded-[5px] border-2 flex items-center justify-center shrink-0 transition-colors"
      style={
        checked
          ? { borderColor: accent, backgroundColor: accent }
          : { borderColor: '#DDDDDD', backgroundColor: 'white' }
      }
    >
      {checked && <Check size={12} className="text-white" />}
    </div>
  );
}
