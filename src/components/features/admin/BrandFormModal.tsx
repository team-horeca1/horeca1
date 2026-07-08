'use client';

/**
 * BrandFormModal — Quick create (name only) or full storefront setup.
 */

import { useState } from 'react';
import { X, Loader2, Store } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FORM, TextField, FormErrorBanner, useFormFeedback } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';
import {
  BrandProfileForm,
  type BrandProfileValues,
} from '@/components/features/brand/BrandProfileForm';
import { EMPTY_BRAND_PROFILE } from '@/components/features/brand/brandProfileDefaults';
import {
  validateBrandProfile,
  validateFieldBlur,
  derivedFullName,
} from '@/lib/validators/brand-profile';
import { buildAdminBrandPayload } from '@/lib/brandProfileMapper';

interface Props {
  onClose: () => void;
  onCreated: (brand: { id: string; name: string; slug: string }) => void;
}

type Tab = 'overview' | 'market' | 'location' | 'marketing' | 'admin';
type Mode = 'quick' | 'full';

function tabForBrandErrors(errors: Record<string, string>): Tab {
  const keys = Object.keys(errors);
  if (keys.some(k => ['brandTier', 'marketplaceVisibility', 'leadStatus', 'creditSupport', 'remarks'].includes(k))) {
    return 'admin';
  }
  if (keys.some(k => ['website', 'tagline', 'description'].includes(k))) return 'marketing';
  if (keys.some(k => ['gstin', 'pincode', 'addressLine', 'outletName', 'city', 'state'].includes(k))) {
    return 'location';
  }
  if (keys.some(k => ['businessSize', 'distributionPresence', 'targetSegments', 'horecaFocused', 'retailFocused'].includes(k))) {
    return 'market';
  }
  return 'overview';
}

const BRAND_FIELD_ORDER = [
  'email', 'password', 'legalName', 'displayName', 'brandType', 'subType', 'firstName', 'phone',
  'gstin', 'outletName', 'addressLine', 'pincode',
];

export default function BrandFormModal({ onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>('quick');
  const [quickName, setQuickName] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [submitting, setSubmitting] = useState(false);
  const {
    bannerError,
    fieldErrors,
    setFieldErrors,
    clearErrors,
    clearFieldError,
    applyApiError,
    applyValidationErrors,
  } = useFormFeedback();
  const [showPwd, setShowPwd] = useState(false);
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState<BrandProfileValues>({
    ...EMPTY_BRAND_PROFILE,
    leadStatus: 'Lead',
  });

  const handleQuickSave = async () => {
    clearErrors();
    const name = quickName.trim();
    if (!name) {
      applyValidationErrors({ name: 'Brand name is required' }, 'Brand name is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickCreate: true, name }),
      });
      const json = await parseJsonResponse<{ success: boolean; data?: { id: string; name: string; slug: string } }>(res);
      if (!json.success) {
        applyApiError(json, {
          fieldOrder: ['name', 'legalName'],
          onFieldError: () => {},
        });
        return;
      }
      toast.success(`Brand "${name}" saved`);
      if (json.data) onCreated(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      applyValidationErrors({ _server: msg }, msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFullSubmit = async () => {
    clearErrors();
    const validation = validateBrandProfile({ ...profile, password }, 'adminCreate');
    if (!validation.success) {
      setFieldErrors(validation.errors);
      setTab(tabForBrandErrors(validation.errors));
      applyValidationErrors(validation.errors, validation.message, {
        fieldOrder: BRAND_FIELD_ORDER,
        dataField: true,
        toast: false,
      });
      return;
    }
    if (!password || password.length < 6) {
      setTab('overview');
      applyValidationErrors({ password: 'Password must be at least 6 characters' }, 'Password must be at least 6 characters', {
        fieldOrder: BRAND_FIELD_ORDER,
        dataField: true,
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildAdminBrandPayload(
        { ...profile, password },
        {
          fullName: derivedFullName(profile),
          email: profile.email?.trim() ?? '',
          password,
        },
      );
      const res = await fetch('/api/v1/admin/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await parseJsonResponse<{ success: boolean; data?: { id: string; name: string; slug: string } }>(res);
      if (!json.success) {
        applyApiError(json, {
          fieldOrder: BRAND_FIELD_ORDER,
          dataField: true,
          onFieldError: (_field, fields) => {
            setFieldErrors(fields);
            setTab(tabForBrandErrors(fields));
          },
        });
        return;
      }
      toast.success('Brand created with storefront profile');
      if (json.data) onCreated(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      applyValidationErrors({ _server: msg }, msg);
    } finally {
      setSubmitting(false);
    }
  };

  const TABS: Array<{ k: Tab; label: string }> = [
    { k: 'overview', label: 'Overview' },
    { k: 'market', label: 'Market Fit' },
    { k: 'location', label: 'Location & Tax' },
    { k: 'marketing', label: 'Marketing' },
    { k: 'admin', label: 'Admin Ops' },
  ];

  const tabSections: Record<Tab, Parameters<typeof BrandProfileForm>[0]['visibleSections']> = {
    overview: { contact: true, identity: true, auth: true, contactEmail: false },
    market: { market: true },
    location: { tax: true, address: true },
    marketing: { marketing: true },
    admin: { ops: true },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-[20px] w-full max-w-[720px] shadow-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#EEEEEE] shrink-0">
          <div>
            <h3 className="text-[18px] font-[900] text-[#181725]">Add Brand</h3>
            <p className="text-[12px] text-[#AEAEAE] font-medium mt-0.5">
              {mode === 'quick' ? 'Save a brand name for catalog use, or open the full storefront form' : 'Full brand storefront profile'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] text-[#AEAEAE]">
            <X size={18} />
          </button>
        </div>

        <FormErrorBanner message={bannerError} className="mx-6" />

        {mode === 'quick' ? (
          <>
            <div className="p-6 space-y-4">
              <TextField
                label="Brand Name"
                required
                dataField="name"
                value={quickName}
                onChange={v => { setQuickName(v); if (fieldErrors.name) clearFieldError('name'); }}
                placeholder="e.g., Everest"
                error={fieldErrors.name}
              />
            </div>
            <div className="px-6 py-4 border-t border-[#EEEEEE] flex items-center justify-between gap-3 shrink-0">
              <button type="button" onClick={onClose}
                className="h-[42px] px-5 bg-[#F5F5F5] text-[#7C7C7C] rounded-[10px] text-[13px] font-bold hover:bg-[#EEEEEE]">
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('full');
                    setProfile(p => ({ ...p, displayName: quickName.trim() || p.displayName, name: quickName.trim() || p.name, legalName: quickName.trim() || p.legalName }));
                    clearErrors();
                  }}
                  className="h-[42px] px-4 flex items-center gap-2 bg-white border border-[#EEEEEE] text-[#181725] rounded-[10px] text-[13px] font-bold hover:bg-[#F8F9FB]"
                >
                  <Store size={14} />
                  Open Storefront
                </button>
                <button onClick={handleQuickSave} disabled={submitting}
                  className={cn(FORM.primaryBtn, 'h-[42px] px-6 text-[13px]')}>
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save Brand
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-1 px-6 pt-4 border-b border-[#EEEEEE] shrink-0 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.k} type="button" onClick={() => setTab(t.k)}
                  className={cn(
                    'px-4 py-2 text-[12px] font-bold rounded-t-lg whitespace-nowrap transition-colors',
                    tab === t.k ? 'bg-[#EEF8F1] text-[#299E60]' : 'text-gray-400 hover:text-gray-600',
                  )}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {tab === 'overview' && (
                <TextField label="Owner Email" required type="email" value={profile.email ?? ''}
                  dataField="email"
                  error={fieldErrors.email}
                  onChange={v => { setProfile(p => ({ ...p, email: v })); if (fieldErrors.email) clearFieldError('email'); }}
                  onBlur={() => {
                    const msg = validateFieldBlur('email', profile.email ?? '');
                    setFieldErrors(prev => {
                      const next = { ...prev };
                      if (msg) next.email = msg; else delete next.email;
                      return next;
                    });
                  }}
                  placeholder="brand@company.com" />
              )}
              <BrandProfileForm
                value={profile}
                onChange={patch => {
                  setProfile(p => ({ ...p, ...patch }));
                  for (const key of Object.keys(patch)) {
                    if (fieldErrors[key]) clearFieldError(key);
                  }
                }}
                errors={fieldErrors}
                onFieldBlur={(field, value) => {
                  const msg = validateFieldBlur(field, value);
                  setFieldErrors(prev => {
                    const next = { ...prev };
                    if (msg) next[field] = msg; else delete next[field];
                    return next;
                  });
                }}
                requireLocationFields={false}
                visibleSections={tabSections[tab]}
                showPassword={tab === 'overview'}
                password={password}
                onPasswordChange={v => { setPassword(v); if (fieldErrors.password) clearFieldError('password'); }}
                showPasswordToggle
                passwordVisible={showPwd}
                onTogglePassword={() => setShowPwd(v => !v)}
              />
            </div>

            <div className="px-6 py-4 border-t border-[#EEEEEE] flex items-center justify-between gap-3 shrink-0">
              <button type="button" onClick={() => { setMode('quick'); clearErrors(); }}
                className="h-[42px] px-4 text-[13px] font-bold text-[#7C7C7C] hover:text-[#181725]">
                ← Back to quick create
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose}
                  className="h-[42px] px-5 bg-[#F5F5F5] text-[#7C7C7C] rounded-[10px] text-[13px] font-bold hover:bg-[#EEEEEE]">
                  Cancel
                </button>
                <button onClick={handleFullSubmit} disabled={submitting}
                  className={cn(FORM.primaryBtn, 'h-[42px] px-6 text-[13px]')}>
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                  Create Storefront
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
