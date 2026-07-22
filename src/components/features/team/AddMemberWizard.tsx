'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  X, ChevronLeft, ChevronRight, UserPlus, Building2, Check,
  Loader2, Store, ShoppingCart, CreditCard, Eye,
  Crown, Shield, Users, DollarSign, Package, Archive, Edit3,
} from 'lucide-react';
import { PasswordField, FormErrorBanner, useFormFeedback } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';
import { InviteSuccessModal, type InviteMeta } from '@/components/features/team/InviteSuccessModal';
import { PermissionMatrix, countMatrixPermissions } from '@/components/features/team/PermissionMatrix';
import { toast } from 'sonner';
import type { RoleScope } from '@/lib/permissions/portalFeatures';
import {
  businessIdsMatchingStoreSelection,
  countVisibleSelectedStores,
  pruneOutletIds,
  resolveStoreScopeAccess,
} from '@/components/features/team/teamStoreSelection';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutletItem {
  id: string;
  name: string;
  code: string | null;
  addressLine: string;
  city: string | null;
  pincode: string | null;
}

interface SupplierStoreItem {
  id: string;
  name: string;
  isActive: boolean;
  isPrimaryStore: boolean;
  addressLine: string | null;
  city: string | null;
  pincode: string | null;
}

export interface SupplierBusinessItem {
  id: string;
  name: string;
  isPrimary: boolean;
  status: string;
  stores: SupplierStoreItem[];
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
  showStorefront?: boolean;  // vendor-only concept; default true for vendor, false otherwise
  skipOutletStep?: boolean;  // admin/brand — skip outlet picker (2-step wizard)
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
  const { data: session } = useSession();
  const activeBusinessAccountId = (session?.user as { activeBusinessAccountId?: string } | undefined)
    ?.activeBusinessAccountId;
  const scope = config?.scope ?? 'vendor';
  const isSupplierInvite = scope === 'vendor';
  // accent is accepted on AddMemberWizardConfig for future use (custom per-
  // portal coloring of the chrome) but the wizard intentionally keeps all
  // green chrome today so the 4 team pages share one visual rhythm.
  const outletsEndpoint = config?.outletsEndpoint
    ?? (scope === 'account' && config?.accountId ? `/api/v1/account/${config.accountId}/outlets` : '/api/v1/vendor/outlets');
  const teamEndpoint = config?.teamEndpoint
    ?? (scope === 'account' && config?.accountId ? `/api/v1/account/${config.accountId}/users` : '/api/v1/vendor/team');
  // Storefront access toggle is a vendor-team concept (vendor staff acting
  // as a buyer on the storefront). It has no meaning for account members.
  const showStorefront = config?.showStorefront ?? (scope === 'vendor');
  const skipOutletStep = config?.skipOutletStep ?? (scope === 'admin' || scope === 'brand');
  const businessAccountLabel = config?.businessAccountLabel
    ?? (scope === 'account' ? 'Customer Account' : 'Vendor Account');
  const totalSteps = skipOutletStep ? 2 : 3;
  const stepLabels = skipOutletStep
    ? ['Member Info', 'Role & Permissions']
    : isSupplierInvite
      ? ['Member Info', 'Store Access', 'Role & Permissions']
      : STEP_LABELS;

  const [step, setStep] = useState(1);

  // Step 1
  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  // Step 2 — account/brand use outlets; vendor/supplier lists every Business + Online Stores
  const [baName, setBaName] = useState('');
  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [businesses, setBusinesses] = useState<SupplierBusinessItem[]>([]);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<Set<string>>(new Set());
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessLoaded, setAccessLoaded] = useState(false);
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
  const {
    bannerError,
    fieldErrors,
    clearErrors,
    applyApiError,
    applyValidationErrors,
  } = useFormFeedback();
  const [inviteMeta, setInviteMeta] = useState<InviteMeta | null>(null);
  const [invitedMemberName, setInvitedMemberName] = useState('');
  const [savedMemberData, setSavedMemberData] = useState<unknown>(null);

  const selectedBusinesses = businesses.filter((b) => selectedBusinessIds.has(b.id));
  const selectedStores = selectedBusinesses.flatMap((b) =>
    b.stores.map((s) => ({ ...s, businessId: b.id, businessName: b.name })),
  );

  useEffect(() => {
    if (!isSupplierInvite || allOutlets) return;
    setSelectedOutletIds((prev) => {
      const pruned = pruneOutletIds(selectedBusinessIds, businesses, prev);
      if (pruned.size === prev.size && [...pruned].every((id) => prev.has(id))) return prev;
      return pruned;
    });
  }, [isSupplierInvite, allOutlets, selectedBusinessIds, businesses]);

  useEffect(() => {
    if (!isSupplierInvite || allOutlets) return;
    if (selectedOutletIds.size === 0) return;
    const nextBa = businessIdsMatchingStoreSelection(
      selectedBusinessIds,
      businesses,
      selectedOutletIds,
    );
    if (
      nextBa.size === selectedBusinessIds.size
      && [...nextBa].every((id) => selectedBusinessIds.has(id))
    ) {
      return;
    }
    setSelectedBusinessIds(nextBa);
    setBaName(
      businesses.filter((b) => nextBa.has(b.id)).map((b) => b.name).join(', ')
      || businessAccountLabel,
    );
  }, [
    isSupplierInvite,
    allOutlets,
    selectedOutletIds,
    selectedBusinessIds,
    businesses,
    businessAccountLabel,
  ]);

  useEffect(() => {
    const outletStep = skipOutletStep ? -1 : 2;
    if (step !== outletStep || accessLoaded || accessLoading) return;

    setAccessLoading(true);

    if (isSupplierInvite) {
      fetch('/api/v1/supplier/businesses')
        .then((r) => r.json())
        .then((j: {
          success?: boolean;
          data?: Array<{
            id: string;
            legalName: string;
            displayName: string | null;
            status: string;
            isPrimary: boolean;
            stores: Array<{
              id: string;
              name: string;
              isActive: boolean;
              isPrimaryStore: boolean;
              addressLine: string | null;
              city: string | null;
              pincode: string | null;
            }>;
          }>;
        }) => {
          if (!j.success || !Array.isArray(j.data)) return;
          const mapped: SupplierBusinessItem[] = j.data.map((b) => ({
            id: b.id,
            name: b.displayName?.trim() || b.legalName,
            isPrimary: b.isPrimary,
            status: b.status,
            stores: (b.stores ?? []).map((s) => ({
              id: s.id,
              name: s.name,
              isActive: s.isActive,
              isPrimaryStore: s.isPrimaryStore,
              addressLine: s.addressLine,
              city: s.city,
              pincode: s.pincode,
            })),
          }));
          setBusinesses(mapped);
          const preferred =
            mapped.find((b) => b.id === activeBusinessAccountId)
            ?? mapped.find((b) => b.isPrimary)
            ?? mapped[0]
            ?? null;
          setSelectedBusinessIds(preferred ? new Set([preferred.id]) : new Set());
          setBaName(preferred?.name ?? businessAccountLabel);
          setAllOutlets(true);
          setSelectedOutletIds(new Set());
        })
        .catch(() => {})
        .finally(() => {
          setAccessLoading(false);
          setAccessLoaded(true);
        });
      return;
    }

    fetch(outletsEndpoint)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return;
        // Vendor/account outlet endpoints: { businessAccount, outlets } or plain array.
        if (Array.isArray(j.data)) {
          setBaName(businessAccountLabel);
          setOutlets(j.data ?? []);
        } else {
          setBaName(j.data.businessAccount?.name ?? businessAccountLabel);
          setOutlets(j.data.outlets ?? []);
        }
      })
      .catch(() => {})
      .finally(() => {
        setAccessLoading(false);
        setAccessLoaded(true);
      });
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

  const toggleBusiness = (businessId: string) => {
    let didChange = false;
    let nextIds = new Set<string>();

    setSelectedBusinessIds((prev) => {
      // Keep at least one business — and do NOT wipe store picks on a no-op click.
      if (prev.has(businessId) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(businessId)) next.delete(businessId);
      else next.add(businessId);
      didChange = true;
      nextIds = next;
      return next;
    });

    if (!didChange) return;

    setBaName(
      businesses.filter((b) => nextIds.has(b.id)).map((b) => b.name).join(', ')
      || businessAccountLabel,
    );

    setSelectedOutletIds((prevIds) => {
      const pruned = pruneOutletIds(nextIds, businesses, prevIds);
      if (pruned.size === prevIds.size && [...pruned].every((id) => prevIds.has(id))) return prevIds;
      return pruned;
    });
  };

  const toggleOutlet = (id: string) => {
    // Leaving "All stores": uncheck the clicked store and keep the rest explicitly selected.
    // "All stores" is only re-entered via the explicit All toggle (covers future stores).
    if (allOutlets) {
      const allIds = selectedStores.map((s) => s.id);
      setAllOutlets(false);
      setSelectedOutletIds(new Set(allIds.filter((sid) => sid !== id)));
      return;
    }
    setSelectedOutletIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goToStepForField = (field?: string) => {
    if (!field) return;
    if (['identifier', 'fullName', 'password', 'phone', 'email'].includes(field)) {
      setStep(1);
      return;
    }
    if (!skipOutletStep && (field === 'outlets' || field === 'storeIds' || field === 'businessAccountId' || field === 'businessAccountIds')) {
      setStep(2);
    }
  };

  const handleNext = () => {
    clearErrors();
    setIdentifierError(null);
    if (step === 1) {
      const trimmed = identifier.trim();
      const stepErrors: Record<string, string> = {};
      if (!trimmed) stepErrors.identifier = 'Email or phone is required';
      else if (!parseIdentifier(trimmed)) {
        stepErrors.identifier = 'Enter a valid email address or 10-digit mobile number';
      }
      if (fullName.trim().length < 2) stepErrors.fullName = 'Full name is required (at least 2 characters)';
      if (password.length < 6) stepErrors.password = 'Password is required for new team members (at least 6 characters)';
      if (Object.keys(stepErrors).length > 0) {
        if (stepErrors.identifier) setIdentifierError(stepErrors.identifier);
        applyValidationErrors(stepErrors, 'Please fix the fields below', {
          fieldOrder: ['identifier', 'fullName', 'password'],
          dataField: true,
        });
        return;
      }
      setStep(2);
    } else if (!skipOutletStep && step === 2) {
      if (isSupplierInvite) {
        if (selectedBusinessIds.size === 0) {
          applyValidationErrors({ businessAccountIds: 'Select at least one business account' }, undefined, { dataField: true });
          return;
        }
        if (selectedStores.length === 0) {
          applyValidationErrors(
            { storeIds: 'Selected business(es) have no Online Stores yet — create a store first' },
            undefined,
            { dataField: true },
          );
          return;
        }
        if (!allOutlets && selectedOutletIds.size === 0) {
          applyValidationErrors({ storeIds: 'Select at least one store, or choose "All stores"' }, undefined, {
            dataField: true,
          });
          return;
        }
      } else if (!allOutlets && selectedOutletIds.size === 0) {
        applyValidationErrors({ outlets: 'Select at least one outlet, or choose "All outlets"' }, undefined, {
          dataField: true,
        });
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    clearErrors();
    setIdentifierError(null);
    setStep((prev) => (prev > 1 ? prev - 1 : prev));
  };

  const isRoleStep = skipOutletStep ? step === 2 : step === 3;
  const isOutletStep = !skipOutletStep && step === 2;

  const handleSave = async () => {
    const hasPerms = Object.keys(permissions).length > 0;
    if (!hasPerms) {
      applyValidationErrors({}, 'Select at least one permission');
      return;
    }
    setSubmitting(true);
    clearErrors();
    setIdentifierError(null);
    try {
      // Prefer roleId when a template chip is selected so owner roles
      // (Super Admin / Vendor Admin / Brand Admin) stay templates — not Custom-*.
      const body: Record<string, unknown> = {
        identifier: identifier.trim(),
      };
      if (selectedRoleId) {
        body.roleId = selectedRoleId;
      } else {
        body.permissions = permissions;
      }
      if (fullName.trim()) body.fullName = fullName.trim();
      if (password) body.password = password;
      if (isSupplierInvite && selectedBusinessIds.size > 0) {
        if (allOutlets) {
          body.businessAccountIds = Array.from(selectedBusinessIds);
          body.scope = 'business';
        } else {
          const scoped = resolveStoreScopeAccess(
            selectedBusinessIds,
            businesses,
            selectedOutletIds,
          );
          if (!scoped) {
            applyValidationErrors({ storeIds: 'Select at least one store, or choose "All stores"' }, undefined, {
              dataField: true,
            });
            setSubmitting(false);
            return;
          }
          body.businessAccountIds = scoped.businessAccountIds;
          body.scope = 'store';
          body.storeIds = scoped.storeIds;
        }
      } else if (!allOutlets && selectedOutletIds.size > 0) {
        body.outletIds = Array.from(selectedOutletIds);
      }
      if (showStorefront && (sfView || sfOrder || sfPay)) {
        body.storefrontAccess = { view: sfView, order: sfOrder, pay: sfPay };
      }

      const res = await fetch(teamEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await parseJsonResponse<{
        success?: boolean;
        data?: TeamMember & { inviteMeta?: InviteMeta };
        error?: { message?: string; details?: { field?: string } };
      }>(res);
      if (!json.success) {
        applyApiError(json, {
          fieldOrder: ['identifier', 'fullName', 'password'],
          dataField: true,
          onFieldError: (field, fields) => {
            if (fields.identifier) setIdentifierError(fields.identifier);
            goToStepForField(field);
          },
        });
        return;
      }

      const meta = json.data?.inviteMeta;
      if (meta?.tempPassword) {
        setInvitedMemberName(fullName.trim());
        setInviteMeta(meta);
        setSavedMemberData(json.data);
      } else {
        onInvited(json.data);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add member';
      applyValidationErrors({ _server: msg }, msg, { toast: false });
      toast.error(msg);
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
              <p className="text-[11px] text-[#AEAEAE] font-medium">Step {step} of {totalSteps} — {stepLabels[step - 1]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-gray-100 transition-colors">
            <X size={16} className="text-[#7C7C7C]" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 shrink-0">
          <div className="flex items-center">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s, i) => (
              <React.Fragment key={s}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all ${
                  s < step  ? 'bg-[#299E60] text-white' :
                  s === step ? 'bg-[#299E60] text-white ring-4 ring-[#299E60]/20' :
                               'bg-[#F0F0F0] text-[#AEAEAE]'
                }`}>
                  {s < step ? <Check size={14} /> : s}
                </div>
                {i < totalSteps - 1 && (
                  <div className="flex-1 flex items-center gap-1 mx-2">
                    <div className={`flex-1 h-[2px] rounded transition-colors ${s < step ? 'bg-[#299E60]' : 'bg-[#F0F0F0]'}`} />
                    <span className={`text-[10px] font-bold whitespace-nowrap ${s < step ? 'text-[#299E60]' : 'text-[#AEAEAE]'}`}>
                      {stepLabels[s - 1]}
                    </span>
                    <div className={`flex-1 h-[2px] rounded transition-colors ${s < step ? 'bg-[#299E60]' : 'bg-[#F0F0F0]'}`} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <FormErrorBanner message={bannerError} className="mx-6" />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {step === 1 && (
            <Step1UserInfo
              identifier={identifier} setIdentifier={setIdentifier}
              identifierError={identifierError ?? fieldErrors.identifier ?? null}
              setIdentifierError={setIdentifierError}
              fullName={fullName} setFullName={setFullName}
              password={password} setPassword={setPassword}
              fieldErrors={fieldErrors}
            />
          )}
          {isOutletStep && (
            <Step2Outlets
              mode={isSupplierInvite ? 'supplier' : 'outlets'}
              baName={baName}
              businesses={businesses}
              selectedBusinessIds={selectedBusinessIds}
              onToggleBusiness={toggleBusiness}
              storeGroups={isSupplierInvite
                ? selectedBusinesses.map((b) => ({
                    businessId: b.id,
                    businessName: b.name,
                    stores: b.stores.map((s) => ({
                      id: s.id,
                      name: s.name,
                      code: s.isPrimaryStore ? 'Primary' : null,
                      addressLine: s.addressLine ?? '',
                      city: s.city,
                      pincode: s.pincode,
                    })),
                  }))
                : []}
              outlets={isSupplierInvite ? [] : outlets}
              outletsLoading={accessLoading}
              allOutlets={allOutlets}
              selectedOutletIds={selectedOutletIds}
              onToggleAll={() => { setAllOutlets(true); setSelectedOutletIds(new Set()); }}
              onToggleOutlet={toggleOutlet}
            />
          )}
          {isRoleStep && (
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

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#F0F0F0] flex items-center justify-between shrink-0 bg-[#FAFAFA] rounded-b-[20px]">
          {step > 1 ? (
            <button onClick={handleBack}
              className="h-[40px] px-4 flex items-center gap-1.5 text-[13px] font-bold text-[#7C7C7C] hover:text-[#181725] transition-colors">
              <ChevronLeft size={15} /> Back
            </button>
          ) : <div />}

          {step < totalSteps ? (
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
  password, setPassword, fieldErrors = {},
}: {
  identifier: string; setIdentifier: (v: string) => void;
  identifierError: string | null; setIdentifierError: (v: string | null) => void;
  fullName: string; setFullName: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  fieldErrors?: Record<string, string>;
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
      <div data-field="identifier">
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
        <div data-field="fullName">
          <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">
            Full Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text" autoComplete="off"
            value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Rahul Sharma"
            className={`w-full h-[46px] border rounded-[10px] px-4 text-[14px] outline-none focus:ring-2 bg-[#FAFAFA] focus:bg-white transition-all ${
              fieldErrors.fullName ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-[#EEEEEE] focus:border-[#299E60]/40 focus:ring-[#299E60]/10'
            }`}
          />
          {fieldErrors.fullName && <p className="text-[11px] text-red-600 mt-1.5">{fieldErrors.fullName}</p>}
        </div>
        <div data-field="password">
          <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">
            Password <span className="text-red-400">*</span>
          </label>
          <PasswordField
            name="newMemberPassword" autoComplete="new-password"
            value={password} onChange={setPassword}
            inputClassName={`w-full h-[46px] border rounded-[10px] px-4 text-[14px] outline-none focus:ring-2 bg-[#FAFAFA] focus:bg-white transition-all ${
              fieldErrors.password
                ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                : 'border-[#EEEEEE] focus:border-[#299E60]/40 focus:ring-[#299E60]/10'
            }`}
          />
          {fieldErrors.password && <p className="text-[11px] text-red-600 mt-1.5">{fieldErrors.password}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Outlet / Store Access ────────────────────────────────────────────

function storeLocationLabel(outlet: OutletItem): string {
  const city = outlet.city?.trim() || '';
  const pin = outlet.pincode?.trim() || '';
  if (city && pin) return `${city} · ${pin}`;
  if (city) return city;
  if (pin) return pin;
  const line = (outlet.addressLine ?? '').trim().replace(/\s+/g, ' ');
  if (!line) return '';
  return line.length > 40 ? `${line.slice(0, 37)}…` : line;
}

function StoreRow({
  outlet,
  checked,
  muted,
  onToggle,
}: {
  outlet: OutletItem;
  checked: boolean;
  muted?: boolean;
  onToggle: () => void;
}) {
  const location = storeLocationLabel(outlet);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
        muted ? 'bg-[#FAFAFA]/80 hover:bg-[#F5F5F5]' : 'hover:bg-[#FAFAFA]'
      }`}
    >
      <Checkbox checked={checked} accent="#299E60" />
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-bold truncate ${muted ? 'text-[#4B5563]' : 'text-[#181725]'}`}>
          {outlet.name}
          {outlet.code ? (
            <span className="ml-1.5 text-[10px] font-mono font-medium text-[#AEAEAE]">{outlet.code}</span>
          ) : null}
        </p>
        {location ? (
          <p className="text-[11px] text-[#AEAEAE] truncate mt-0.5">{location}</p>
        ) : null}
      </div>
    </button>
  );
}

/** Shared business + store picker used by Add Member and Edit Member. */
export function Step2Outlets({
  mode = 'outlets',
  baName,
  businesses = [],
  selectedBusinessIds = new Set<string>(),
  onToggleBusiness,
  storeGroups = [],
  outlets,
  outletsLoading,
  allOutlets,
  selectedOutletIds,
  onToggleAll,
  onToggleOutlet,
}: {
  mode?: 'outlets' | 'supplier';
  baName: string;
  businesses?: SupplierBusinessItem[];
  selectedBusinessIds?: Set<string>;
  onToggleBusiness?: (id: string) => void;
  storeGroups?: Array<{ businessId: string; businessName: string; stores: OutletItem[] }>;
  outlets: OutletItem[];
  outletsLoading: boolean;
  allOutlets: boolean;
  selectedOutletIds: Set<string>;
  onToggleAll: () => void;
  onToggleOutlet: (id: string) => void;
}) {
  const isSupplier = mode === 'supplier';
  const flatStores = isSupplier
    ? storeGroups.flatMap((g) => g.stores)
    : outlets;
  const visibleSelectedCount = countVisibleSelectedStores(
    flatStores.map((s) => s.id),
    selectedOutletIds,
  );
  const accessLabel = isSupplier ? 'Store Access' : 'Outlet Access';
  const allLabel = isSupplier ? 'All stores' : 'All outlets';
  const allHint = isSupplier
    ? 'Current and future stores under selected businesses'
    : 'Current and future outlets';
  const emptyTitle = isSupplier ? 'No Online Stores yet' : 'No outlets configured';
  const emptyHint = isSupplier
    ? 'Select a business with stores, or create a store first.'
    : 'Member will have account-wide access.';
  const showGrouped = isSupplier && storeGroups.length > 1;

  return (
    <div className="flex gap-4 h-[min(320px,42vh)] min-h-[240px]">
      {/* Left: Business account(s) */}
      <div className="w-[200px] shrink-0 flex flex-col min-h-0">
        <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2">
          Business{isSupplier && businesses.length > 1 ? 'es' : ''}
        </p>
        {outletsLoading ? (
          <div className="flex-1 flex items-center justify-center border border-[#EEEEEE] rounded-[12px]">
            <Loader2 size={20} className="animate-spin text-[#299E60]" />
          </div>
        ) : isSupplier && businesses.length > 0 ? (
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
            {businesses.map((biz) => {
              const selected = selectedBusinessIds.has(biz.id);
              return (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => onToggleBusiness?.(biz.id)}
                  className={`w-full text-left rounded-[10px] px-3 py-2.5 flex items-center gap-2.5 border transition-colors ${
                    selected
                      ? 'border-[#299E60] bg-[#F0FBF5]'
                      : 'border-[#EEEEEE] bg-white hover:border-[#299E60]/40 hover:bg-[#FAFAFA]'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 ${
                    selected ? 'bg-[#299E60]' : 'bg-[#F3F4F6]'
                  }`}>
                    <Building2 size={13} className={selected ? 'text-white' : 'text-[#7C7C7C]'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[#181725] truncate leading-tight">{biz.name}</p>
                    <p className="text-[10px] text-[#AEAEAE] mt-0.5">
                      {biz.stores.length} {biz.stores.length === 1 ? 'store' : 'stores'}
                      {biz.isPrimary ? ' · Primary' : ''}
                    </p>
                  </div>
                  <Checkbox checked={selected} accent="#299E60" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="border border-[#299E60] bg-[#F0FBF5] rounded-[10px] px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#299E60] rounded-[8px] flex items-center justify-center shrink-0">
              <Building2 size={13} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-[#181725] truncate">{baName || 'Vendor Account'}</p>
              <p className="text-[10px] text-[#AEAEAE] mt-0.5">Primary</p>
            </div>
            <Checkbox checked accent="#299E60" />
          </div>
        )}
        {isSupplier && (
          <p className="text-[10px] text-[#AEAEAE] mt-2 leading-snug">
            Pick businesses, then stores on the right.
          </p>
        )}
      </div>

      {/* Right: Outlets / Online Stores */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider">
            {accessLabel}
            {flatStores.length > 0 ? ` (${flatStores.length})` : ''}
          </p>
          {allOutlets ? (
            <span className="text-[10px] font-bold text-[#299E60] bg-[#ECFDF5] px-2 py-0.5 rounded-full shrink-0">
              All included
            </span>
          ) : visibleSelectedCount > 0 ? (
            <span className="text-[10px] font-bold text-[#299E60] bg-[#ECFDF5] px-2 py-0.5 rounded-full shrink-0">
              {visibleSelectedCount} selected
            </span>
          ) : null}
        </div>

        {outletsLoading ? (
          <div className="flex-1 flex items-center justify-center border border-[#EEEEEE] rounded-[12px]">
            <Loader2 size={22} className="animate-spin text-[#299E60]" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto border border-[#EEEEEE] rounded-[12px]">
            <button
              type="button"
              onClick={onToggleAll}
              className={`w-full flex items-center gap-3 px-3.5 py-3 text-left border-b border-[#F0F0F0] transition-colors ${
                allOutlets ? 'bg-[#F0FBF5]' : 'hover:bg-[#FAFAFA]'
              }`}
            >
              <Checkbox checked={allOutlets} accent="#299E60" />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[#181725]">{allLabel}</p>
                <p className="text-[11px] text-[#7C7C7C] leading-snug">{allHint}</p>
                {allOutlets && (
                  <p className="text-[10px] text-[#299E60] font-medium mt-1">
                    Click a store below to limit access
                  </p>
                )}
              </div>
            </button>

            {showGrouped
              ? storeGroups.map((group, idx) => (
                  <div key={group.businessId} className={idx > 0 ? 'border-t border-[#F0F0F0]' : ''}>
                    <div className="px-3.5 py-1.5 bg-[#FAFAFA] sticky top-0 z-[1]">
                      <p className="text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wider truncate">
                        {group.businessName}
                      </p>
                    </div>
                    {group.stores.length === 0 ? (
                      <p className="px-3.5 py-2.5 text-[11px] text-[#AEAEAE]">No stores</p>
                    ) : (
                      group.stores.map((outlet) => (
                        <StoreRow
                          key={outlet.id}
                          outlet={outlet}
                          checked={allOutlets || selectedOutletIds.has(outlet.id)}
                          muted={allOutlets}
                          onToggle={() => onToggleOutlet(outlet.id)}
                        />
                      ))
                    )}
                  </div>
                ))
              : flatStores.map((outlet) => (
                  <StoreRow
                    key={outlet.id}
                    outlet={outlet}
                    checked={allOutlets || selectedOutletIds.has(outlet.id)}
                    muted={allOutlets}
                    onToggle={() => onToggleOutlet(outlet.id)}
                  />
                ))}

            {flatStores.length === 0 && (
              <div className="px-4 py-10 text-center">
                <p className="text-[13px] font-bold text-[#AEAEAE]">{emptyTitle}</p>
                <p className="text-[11px] text-[#AEAEAE] mt-1">{emptyHint}</p>
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
