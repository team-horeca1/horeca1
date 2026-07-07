'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, UserPlus, Building2, Check,
  Loader2, AlertCircle, Store, ShoppingCart, CreditCard, Eye,
  Crown, Shield, Users, DollarSign, Package, Archive, Edit3,
} from 'lucide-react';
import { PasswordField } from '@/components/ui/form';
import { InviteSuccessModal, type InviteMeta } from '@/components/features/team/InviteSuccessModal';
import { PermissionMatrix, countMatrixPermissions } from '@/components/features/team/PermissionMatrix';
import type { RoleScope } from '@/lib/permissions/portalFeatures';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutletItem {
  id: string;
  name: string;
  code: string | null;
  addressLine: string;
  city: string | null;
  pincode: string | null;
}

export interface RoleItem {
  id: string;
  name: string;
  description: string | null;
  isTemplate: boolean;
  permissions: Record<string, Record<string, boolean>>;
}

interface TeamMember {
  id: string;
  isOwner: boolean;
  createdAt: string;
  user: { id: string; fullName: string; email: string | null; phone: string | null; hcidDisplay: string | null; isActive: boolean };
  role: { id: string | null; name: string; scope: string; description: string | null };
}

type Scope = 'vendor' | 'account' | 'brand' | 'admin';

/**
 * Wizard config for scopes other than vendor (the default).
 * `accountId` is required when scope='account' so we can hit the per-account
 * endpoints. `accent` recolors the chrome to match the portal's brand.
 */
export interface AddMemberWizardConfig {
  scope?: Scope;             // default 'vendor'
  accountId?: string;        // required for scope='account'
  accent?: string;           // default '#299E60'
  outletsEndpoint?: string;  // overrides /api/v1/vendor/outlets
  teamEndpoint?: string;     // overrides /api/v1/vendor/team
  modules?: ReadonlyArray<{ key: string; label: string }>; // overrides VENDOR_MODULES
  showStorefront?: boolean;  // vendor-only concept; default true for vendor, false otherwise
  businessAccountLabel?: string; // step-2 left card title — e.g. 'Customer Account'
}

interface AddMemberWizardProps {
  roles: RoleItem[];
  onClose: () => void;
  onInvited: (member?: TeamMember) => void;
  config?: AddMemberWizardConfig;
}

type PermissionsMap = Record<string, Record<string, boolean>>;

// ─── Constants ────────────────────────────────────────────────────────────────

const VENDOR_MODULES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'products',     label: 'Products' },
  { key: 'orders',       label: 'Orders' },
  { key: 'repeatOrders', label: 'Repeat Orders' },
  { key: 'inventory',    label: 'Inventory' },
  { key: 'grn',          label: 'GRN' },
  { key: 'dispatch',     label: 'Dispatch' },
  { key: 'payments',     label: 'Payments' },
  { key: 'creditLine',   label: 'Credit Line' },
  { key: 'customers',    label: 'Customers' },
  { key: 'users',        label: 'Team' },
  { key: 'analytics',    label: 'Analytics' },
  { key: 'promotions',   label: 'Promotions' },
  { key: 'settings',     label: 'Settings' },
];

// Account-scope modules — narrower; no inventory/GRN/dispatch/customers/analytics/promotions
const ACCOUNT_MODULES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'orders',       label: 'Orders' },
  { key: 'repeatOrders', label: 'Repeat Orders' },
  { key: 'payments',     label: 'Payments' },
  { key: 'creditLine',   label: 'Credit Line' },
  { key: 'users',        label: 'Team' },
  { key: 'outlets',      label: 'Outlets' },
  { key: 'settings',     label: 'Settings' },
];

const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'] as const;

const ROLE_STYLES: Record<string, { color: string; bg: string; border: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  'Vendor Admin':      { color: '#D97706', bg: '#FFF7E6', border: '#F59E0B', Icon: Crown },
  'Vendor Manager':    { color: '#2563EB', bg: '#EFF6FF', border: '#3B82F6', Icon: Shield },
  'Sales Rep':         { color: '#059669', bg: '#ECFDF5', border: '#10B981', Icon: Users },
  'Finance Executive': { color: '#7C3AED', bg: '#F3F0FF', border: '#8B5CF6', Icon: DollarSign },
  'Order Manager':     { color: '#EA580C', bg: '#FFF7ED', border: '#F97316', Icon: Package },
  'Warehouse Manager': { color: '#374151', bg: '#F3F4F6', border: '#6B7280', Icon: Archive },
  'Vendor Editor':     { color: '#DB2777', bg: '#FDF2F8', border: '#EC4899', Icon: Edit3 },
  'Vendor Viewer':     { color: '#6B7280', bg: '#F3F4F6', border: '#9CA3AF', Icon: Eye },
};

function getRoleStyle(name: string) {
  return ROLE_STYLES[name] ?? { color: '#6B7280', bg: '#F3F4F6', border: '#9CA3AF', Icon: Eye };
}

const STEP_LABELS = ['Member Info', 'Outlet Access', 'Role & Permissions'];

function parseIdentifier(raw: string): { type: 'email'; value: string } | { type: 'phone'; value: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { type: 'email', value: trimmed.toLowerCase() };
  }
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (/^[6-9]\d{9}$/.test(digits)) return { type: 'phone', value: digits };
  return null;
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function AddMemberWizard({ roles, onClose, onInvited, config }: AddMemberWizardProps) {
  const scope = config?.scope ?? 'vendor';
  // accent is accepted on AddMemberWizardConfig for future use (custom per-
  // portal coloring of the chrome) but the wizard intentionally keeps all
  // green chrome today so the 4 team pages share one visual rhythm.
  const outletsEndpoint = config?.outletsEndpoint
    ?? (scope === 'account' && config?.accountId ? `/api/v1/account/${config.accountId}/outlets` : '/api/v1/vendor/outlets');
  const teamEndpoint = config?.teamEndpoint
    ?? (scope === 'account' && config?.accountId ? `/api/v1/account/${config.accountId}/users` : '/api/v1/vendor/team');
  const modules = config?.modules ?? (scope === 'account' ? ACCOUNT_MODULES : VENDOR_MODULES);
  // Storefront access toggle is a vendor-team concept (vendor staff acting
  // as a buyer on the storefront). It has no meaning for account members.
  const showStorefront = config?.showStorefront ?? (scope === 'vendor');
  const businessAccountLabel = config?.businessAccountLabel
    ?? (scope === 'account' ? 'Customer Account' : 'Vendor Account');

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  // Step 2
  const [baName, setBaName] = useState('');
  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [outletsLoading, setOutletsLoading] = useState(false);
  const [allOutlets, setAllOutlets] = useState(true);
  const [selectedOutletIds, setSelectedOutletIds] = useState<Set<string>>(new Set());

  // Step 3 — permissions are the source of truth; selectedRoleId is just for chip highlight
  const firstTemplate = roles.find(r => r.isTemplate) ?? roles[0];
  const [selectedRoleId, setSelectedRoleId] = useState(firstTemplate?.id ?? '');
  const [permissions, setPermissions] = useState<PermissionsMap>(
    () => firstTemplate ? structuredClone(firstTemplate.permissions) : {},
  );
  const [sfView, setSfView] = useState(false);
  const [sfOrder, setSfOrder] = useState(false);
  const [sfPay, setSfPay] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteMeta, setInviteMeta] = useState<InviteMeta | null>(null);
  const [invitedMemberName, setInvitedMemberName] = useState('');
  const [savedMemberData, setSavedMemberData] = useState<unknown>(null);

  useEffect(() => {
    if (step === 2 && outlets.length === 0 && !outletsLoading) {
      setOutletsLoading(true);
      fetch(outletsEndpoint)
        .then(r => r.json())
        .then(j => {
          if (!j.success) return;
          // Vendor endpoint returns { businessAccount: {...}, outlets: [...] }.
          // Account endpoint returns a plain array. Handle both shapes.
          if (Array.isArray(j.data)) {
            setBaName(businessAccountLabel);
            setOutlets(j.data ?? []);
          } else {
            setBaName(j.data.businessAccount?.name ?? businessAccountLabel);
            setOutlets(j.data.outlets ?? []);
          }
        })
        .catch(() => {})
        .finally(() => setOutletsLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Show all roles as chips except Storefront ones (custom roles created by the vendor are included).
  const templates = roles.filter(r => !r.name.startsWith('Storefront'));
  const selectedRole = roles.find(r => r.id === selectedRoleId);

  // Clicking a template chip fills the matrix with that role's permissions
  const handleSelectRole = useCallback((role: RoleItem) => {
    setSelectedRoleId(role.id);
    setPermissions(structuredClone(role.permissions));
  }, []);

  // Toggle a single permission cell
  const handlePermissionsChange = useCallback((next: PermissionsMap) => {
    setPermissions(next);
    setSelectedRoleId('');
  }, []);

  const handleTogglePermission = useCallback((mod: string, action: string) => {
    setPermissions(prev => {
      const next: PermissionsMap = { ...prev, [mod]: { ...(prev[mod] ?? {}) } };
      if (next[mod][action]) {
        delete next[mod][action];
        if (Object.keys(next[mod]).length === 0) delete next[mod];
      } else {
        next[mod][action] = true;
      }
      return next;
    });
    // Deselect chip highlight when matrix is manually edited
    setSelectedRoleId('');
  }, []);

  const toggleOutlet = (id: string) => {
    setAllOutlets(false);
    setSelectedOutletIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      const trimmed = identifier.trim();
      if (!trimmed) { setError('Email or phone is required'); return; }
      const parsed = parseIdentifier(trimmed);
      if (!parsed) {
        setError('Enter a valid email address or 10-digit mobile number');
        setIdentifierError('Enter a valid email address or 10-digit mobile number');
        return;
      }
      if (fullName.trim().length < 2) {
        setError('Full name is required (at least 2 characters)');
        return;
      }
      if (password.length < 6) {
        setError('Password is required for new team members (at least 6 characters)');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!allOutlets && selectedOutletIds.size === 0) {
        setError('Select at least one outlet, or choose "All outlets"');
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    setError(null);
    setStep(prev => (prev > 1 ? (prev - 1) as 1 | 2 | 3 : prev));
  };

  const handleSave = async () => {
    const hasPerms = Object.keys(permissions).length > 0;
    if (!hasPerms) { setError('Select at least one permission'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        identifier: identifier.trim(),
        permissions,
      };
      if (fullName.trim()) body.fullName = fullName.trim();
      if (password) body.password = password;
      if (!allOutlets && selectedOutletIds.size > 0) body.outletIds = Array.from(selectedOutletIds);
      if (showStorefront && (sfView || sfOrder || sfPay)) {
        body.storefrontAccess = { view: sfView, order: sfOrder, pay: sfPay };
      }

      const res = await fetch(teamEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'Failed to add member');

      const meta = json.data?.inviteMeta as InviteMeta | undefined;
      if (meta?.tempPassword) {
        setInvitedMemberName(fullName.trim());
        setInviteMeta(meta);
        setSavedMemberData(json.data);
      } else {
        onInvited(json.data);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[20px] w-full max-w-[820px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#ECFDF5] rounded-[10px] flex items-center justify-center">
              <UserPlus size={17} className="text-[#299E60]" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-[#181725]">Add Team Member</h3>
              <p className="text-[11px] text-[#AEAEAE] font-medium">Step {step} of 3 — {STEP_LABELS[step - 1]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-gray-100 transition-colors">
            <X size={16} className="text-[#7C7C7C]" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 shrink-0">
          <div className="flex items-center">
            {([1, 2, 3] as const).map((s, i) => (
              <React.Fragment key={s}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all ${
                  s < step  ? 'bg-[#299E60] text-white' :
                  s === step ? 'bg-[#299E60] text-white ring-4 ring-[#299E60]/20' :
                               'bg-[#F0F0F0] text-[#AEAEAE]'
                }`}>
                  {s < step ? <Check size={14} /> : s}
                </div>
                {i < 2 && (
                  <div className="flex-1 flex items-center gap-1 mx-2">
                    <div className={`flex-1 h-[2px] rounded transition-colors ${s < step ? 'bg-[#299E60]' : 'bg-[#F0F0F0]'}`} />
                    <span className={`text-[10px] font-bold whitespace-nowrap ${s < step ? 'text-[#299E60]' : 'text-[#AEAEAE]'}`}>
                      {STEP_LABELS[s - 1]}
                    </span>
                    <div className={`flex-1 h-[2px] rounded transition-colors ${s < step ? 'bg-[#299E60]' : 'bg-[#F0F0F0]'}`} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {step === 1 && (
            <Step1UserInfo
              identifier={identifier} setIdentifier={setIdentifier}
              identifierError={identifierError} setIdentifierError={setIdentifierError}
              fullName={fullName} setFullName={setFullName}
              password={password} setPassword={setPassword}
            />
          )}
          {step === 2 && (
            <Step2Outlets
              baName={baName}
              outlets={outlets}
              outletsLoading={outletsLoading}
              allOutlets={allOutlets}
              selectedOutletIds={selectedOutletIds}
              onToggleAll={() => { setAllOutlets(true); setSelectedOutletIds(new Set()); }}
              onToggleOutlet={toggleOutlet}
            />
          )}
          {step === 3 && (
            <Step3Role
              templates={templates}
              selectedRoleId={selectedRoleId}
              selectedRole={selectedRole}
              permissions={permissions}
              onSelectRole={handleSelectRole}
              onPermissionsChange={handlePermissionsChange}
              sfView={sfView} setSfView={setSfView}
              sfOrder={sfOrder} setSfOrder={setSfOrder}
              sfPay={sfPay} setSfPay={setSfPay}
              showStorefront={showStorefront}
              scope={scope}
            />
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-[10px] p-3">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#F0F0F0] flex items-center justify-between shrink-0 bg-[#FAFAFA] rounded-b-[20px]">
          {step > 1 ? (
            <button onClick={handleBack}
              className="h-[40px] px-4 flex items-center gap-1.5 text-[13px] font-bold text-[#7C7C7C] hover:text-[#181725] transition-colors">
              <ChevronLeft size={15} /> Back
            </button>
          ) : <div />}

          {step < 3 ? (
            <button onClick={handleNext}
              className="h-[42px] px-6 bg-[#299E60] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#238a54] flex items-center gap-2 transition-colors shadow-sm">
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={handleSave} disabled={submitting}
              className="h-[42px] px-6 bg-[#299E60] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#238a54] disabled:opacity-50 flex items-center gap-2 transition-colors shadow-sm">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? 'Adding member…' : 'Add Member'}
            </button>
          )}
        </div>
      </div>
    </div>

    {inviteMeta && (
      <InviteSuccessModal
        inviteMeta={inviteMeta}
        memberName={invitedMemberName}
        onClose={() => {
          setInviteMeta(null);
          onInvited(savedMemberData as TeamMember | undefined);
          onClose();
        }}
      />
    )}
    </>
  );
}

// ─── Step 1: User Info ────────────────────────────────────────────────────────

function Step1UserInfo({
  identifier, setIdentifier, identifierError, setIdentifierError, fullName, setFullName,
  password, setPassword,
}: {
  identifier: string; setIdentifier: (v: string) => void;
  identifierError: string | null; setIdentifierError: (v: string | null) => void;
  fullName: string; setFullName: (v: string) => void;
  password: string; setPassword: (v: string) => void;
}) {
  const handleBlur = () => {
    const trimmed = identifier.trim();
    if (!trimmed) { setIdentifierError(null); return; }
    if (!parseIdentifier(trimmed)) {
      setIdentifierError('Enter a valid email address or 10-digit mobile number');
    } else {
      setIdentifierError(null);
    }
  };

  return (
    <div className="space-y-4 max-w-[520px]">
      <div>
        <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">
          Email or Phone <span className="text-red-400">*</span>
        </label>
        <input
          type="text" autoFocus autoComplete="off"
          value={identifier}
          onChange={e => { setIdentifier(e.target.value); if (identifierError) setIdentifierError(null); }}
          onBlur={handleBlur}
          placeholder="e.g. teammate@company.com or 9876543210"
          className={`w-full h-[46px] border rounded-[10px] px-4 text-[14px] outline-none focus:ring-2 bg-[#FAFAFA] focus:bg-white transition-all ${
            identifierError
              ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
              : 'border-[#EEEEEE] focus:border-[#299E60]/40 focus:ring-[#299E60]/10'
          }`}
        />
        {identifierError && (
          <p className="text-[11px] text-red-600 mt-1.5">{identifierError}</p>
        )}
        <p className="text-[11px] text-[#AEAEAE] mt-1.5 leading-relaxed">
          Existing accounts get added straight in. For a brand-new user, fill name + password below — we&apos;ll email or SMS them the credentials.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">
            Full Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text" autoComplete="off"
            value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Rahul Sharma"
            className="w-full h-[46px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40 focus:ring-2 focus:ring-[#299E60]/10 bg-[#FAFAFA] focus:bg-white transition-all"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">
            Password <span className="text-red-400">*</span>
          </label>
          <PasswordField
            name="newMemberPassword" autoComplete="new-password"
            value={password} onChange={setPassword}
            placeholder="At least 6 characters"
            inputClassName="w-full h-[46px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40 focus:ring-2 focus:ring-[#299E60]/10 bg-[#FAFAFA] focus:bg-white transition-all"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Outlet Access ────────────────────────────────────────────────────

function Step2Outlets({
  baName, outlets, outletsLoading, allOutlets, selectedOutletIds, onToggleAll, onToggleOutlet,
}: {
  baName: string; outlets: OutletItem[]; outletsLoading: boolean;
  allOutlets: boolean; selectedOutletIds: Set<string>;
  onToggleAll: () => void; onToggleOutlet: (id: string) => void;
}) {
  return (
    <div className="flex gap-5 h-[360px]">
      {/* Left: Business account */}
      <div className="w-[200px] shrink-0">
        <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2">Business Account</p>
        <div className="border-2 border-[#299E60] bg-[#F0FBF5] rounded-[12px] p-4 flex flex-col gap-2">
          <div className="w-9 h-9 bg-[#299E60] rounded-[10px] flex items-center justify-center">
            <Building2 size={16} className="text-white" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#181725] leading-snug">{baName || 'Vendor Account'}</p>
            <p className="text-[11px] text-[#7C7C7C] mt-0.5">Primary account</p>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <div className="w-4 h-4 bg-[#299E60] rounded-full flex items-center justify-center">
              <Check size={10} className="text-white" />
            </div>
            <span className="text-[10px] font-bold text-[#299E60]">Selected</span>
          </div>
        </div>
        <p className="text-[10px] text-[#AEAEAE] mt-2 leading-relaxed">
          This member will be added to your vendor team under this business account.
        </p>
      </div>

      {/* Right: Outlets */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider">
            Outlet Access {outlets.length > 0 && `(${outlets.length})`}
          </p>
          {!allOutlets && selectedOutletIds.size > 0 && (
            <span className="text-[10px] font-bold text-[#299E60] bg-[#ECFDF5] px-2 py-0.5 rounded-full">
              {selectedOutletIds.size} selected
            </span>
          )}
        </div>

        {outletsLoading ? (
          <div className="flex-1 flex items-center justify-center border border-[#EEEEEE] rounded-[12px]">
            <Loader2 size={22} className="animate-spin text-[#299E60]" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto border border-[#EEEEEE] rounded-[12px] divide-y divide-[#F5F5F5]">
            <button onClick={onToggleAll} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#FAFAFA] transition-colors text-left">
              <Checkbox checked={allOutlets} accent="#299E60" />
              <div>
                <p className="text-[13px] font-bold text-[#181725]">All outlets (account-wide)</p>
                <p className="text-[11px] text-[#7C7C7C]">Access all current and future outlets</p>
              </div>
            </button>
            {outlets.map(outlet => (
              <button key={outlet.id} onClick={() => onToggleOutlet(outlet.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAFA] transition-colors text-left">
                <Checkbox checked={!allOutlets && selectedOutletIds.has(outlet.id)} accent="#299E60" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#181725] flex items-center gap-2">
                    {outlet.name}
                    {outlet.code && (
                      <span className="text-[10px] text-[#AEAEAE] font-mono bg-[#F5F5F5] px-1.5 py-0.5 rounded">{outlet.code}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-[#7C7C7C] truncate">
                    {outlet.addressLine}{outlet.city ? `, ${outlet.city}` : ''}{outlet.pincode ? ` — ${outlet.pincode}` : ''}
                  </p>
                </div>
              </button>
            ))}
            {outlets.length === 0 && (
              <div className="px-4 py-10 text-center">
                <p className="text-[13px] font-bold text-[#AEAEAE]">No outlets configured</p>
                <p className="text-[11px] text-[#AEAEAE] mt-1">Member will have account-wide access.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Role & Permissions ───────────────────────────────────────────────

function Step3Role({
  templates, selectedRoleId, selectedRole,
  permissions, onSelectRole, onPermissionsChange,
  sfView, setSfView, sfOrder, setSfOrder, sfPay, setSfPay,
  showStorefront, scope,
}: {
  templates: RoleItem[];
  selectedRoleId: string; selectedRole: RoleItem | undefined;
  permissions: PermissionsMap;
  onSelectRole: (role: RoleItem) => void;
  onPermissionsChange: (next: PermissionsMap) => void;
  sfView: boolean; setSfView: (v: boolean) => void;
  sfOrder: boolean; setSfOrder: (v: boolean) => void;
  sfPay: boolean; setSfPay: (v: boolean) => void;
  showStorefront: boolean;
  scope: Scope;
}) {
  const matrixScope = scope as RoleScope;
  const totalSelected = countMatrixPermissions(permissions, matrixScope);

  return (
    <div className="space-y-5">
      {/* Template role chips */}
      <div>
        <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2">
          Role templates — click to auto-fill permissions
        </p>
        <div className="flex flex-wrap gap-2">
          {templates.map(r => {
            const style = getRoleStyle(r.name);
            const isSelected = r.id === selectedRoleId;
            const { Icon } = style;
            return (
              <button key={r.id} onClick={() => onSelectRole(r)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[12px] font-bold border-2 transition-all hover:shadow-sm"
                style={isSelected
                  ? { background: style.bg, borderColor: style.border, color: style.color }
                  : { background: 'white', borderColor: '#EEEEEE', color: '#7C7C7C' }
                }>
                <Icon size={13} />
                {r.name}
              </button>
            );
          })}
        </div>
        {selectedRole?.description && (
          <p className="text-[12px] text-[#7C7C7C] mt-2">{selectedRole.description}</p>
        )}
        {!selectedRoleId && (
          <p className="text-[11px] text-[#AEAEAE] mt-1 italic">Custom permissions selected ({totalSelected} permissions)</p>
        )}
      </div>

      {/* Permissions matrix — fully interactive */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider">
            Permissions
          </p>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${totalSelected > 0 ? 'bg-[#ECFDF5] text-[#299E60]' : 'bg-[#F5F5F5] text-[#AEAEAE]'}`}>
            {totalSelected} selected
          </span>
        </div>
        <PermissionMatrix
          scope={matrixScope}
          permissions={permissions}
          onChange={onPermissionsChange}
          accent="#299E60"
        />
        <p className="text-[10px] text-[#AEAEAE] mt-1.5">
          Click any checkbox to add or remove a permission. Templates above auto-fill this matrix.
        </p>
      </div>

      {/* Storefront access — vendor scope only. Customer/brand/admin teams
          don't carry this concept (their members already are buyers / brand
          users / staff respectively). */}
      {showStorefront && (
        <div className="bg-[#F0F7FF] border border-[#BFDBFE] rounded-[12px] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Store size={15} className="text-[#2563EB]" />
            <p className="text-[13px] font-bold text-[#181725]">Storefront Access</p>
            <span className="text-[10px] text-[#2563EB] bg-[#DBEAFE] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">As Buyer</span>
          </div>
          <p className="text-[11px] text-[#6B7280] mb-3 leading-relaxed">
            Allow this member to access the HoReCa Hub storefront on behalf of your business.
          </p>
          <div className="space-y-2.5">
            {([
              { label: 'Browse storefront & view products', Icon: Eye,          checked: sfView,  toggle: () => setSfView(!sfView) },
              { label: 'Place orders on storefront',        Icon: ShoppingCart, checked: sfOrder, toggle: () => setSfOrder(!sfOrder) },
              { label: 'Make payments on storefront',       Icon: CreditCard,   checked: sfPay,   toggle: () => setSfPay(!sfPay) },
            ] as const).map(({ label, Icon, checked, toggle }) => (
              <button key={label} onClick={toggle} className="flex items-center gap-3 w-full text-left">
                <Checkbox checked={checked} accent="#2563EB" />
                <Icon size={13} className={checked ? 'text-[#2563EB]' : 'text-[#9CA3AF]'} />
                <span className={`text-[12px] font-medium ${checked ? 'text-[#181725]' : 'text-[#6B7280]'}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared checkbox ──────────────────────────────────────────────────────────

function Checkbox({ checked, accent }: { checked: boolean; accent: string }) {
  return (
    <div
      className="w-[20px] h-[20px] rounded-[5px] border-2 flex items-center justify-center shrink-0 transition-colors"
      style={checked ? { borderColor: accent, backgroundColor: accent } : { borderColor: '#DDDDDD', backgroundColor: 'white' }}
    >
      {checked && <Check size={12} className="text-white" />}
    </div>
  );
}
