'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Building2, Loader2, Sparkles, AlertCircle, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAddress } from '@/context/AddressContext';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FORM, FormErrorBanner, useFormFeedback } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';
import {
  CustomerProfileForm,
  type CustomerProfileValues,
} from '@/components/features/customer/CustomerProfileForm';
import { EMPTY_CUSTOMER_PROFILE } from '@/components/features/customer/customerProfileDefaults';
import {
  BrandProfileForm,
  type BrandProfileValues,
} from '@/components/features/brand/BrandProfileForm';
import { EMPTY_BRAND_PROFILE } from '@/components/features/brand/brandProfileDefaults';
import {
  validateCustomerProfile,
  validateFieldBlur as validateCustomerFieldBlur,
  derivedLegalName,
} from '@/lib/validators/customer-profile';
import {
  validateBrandProfile,
  validateFieldBlur as validateBrandFieldBlur,
} from '@/lib/validators/brand-profile';
import { mapToPrimaryOutlet } from '@/lib/customerProfileMapper';
import { buildAddBusinessPayload } from '@/lib/brandProfileMapper';

interface CreateBusinessAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateBusinessAccountModal({
  isOpen,
  onClose,
  onCreated,
}: CreateBusinessAccountModalProps) {
  const router = useRouter();
  const { switchAccount, refresh: refreshAccounts } = useBusinessAccountSwitcher();
  const { setSelectedAddress } = useAddress();

  const [profile, setProfile] = useState<CustomerProfileValues>({ ...EMPTY_CUSTOMER_PROFILE });
  const [brandProfile, setBrandProfile] = useState<BrandProfileValues>({ ...EMPTY_BRAND_PROFILE });
  const [businessType, setBusinessType] = useState<'customer' | 'vendor' | 'brand'>('customer');
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
  const [brandSubmitted, setBrandSubmitted] = useState(false);

  const setFE = (key: string, msg: string) => setFieldErrors(prev => {
    if (!msg && !prev[key]) return prev;
    if (msg && prev[key] === msg) return prev;
    const next = { ...prev };
    if (msg) next[key] = msg; else delete next[key];
    return next;
  });

  useEffect(() => {
    if (!isOpen) {
      setBrandSubmitted(false);
      clearErrors();
      setSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!/^\d{6}$/.test(profile.pincode ?? profile.billingPincode ?? '')) return;
    const city = profile.city ?? profile.billingCity ?? '';
    const state = profile.state ?? profile.billingState ?? '';
    if (city.trim() && state.trim()) return;
    const pincode = profile.pincode ?? profile.billingPincode ?? '';
    fetch(`https://api.postalpincode.in/pincode/${pincode}`)
      .then((r) => r.json())
      .then((data) => {
        const po = data?.[0]?.PostOffice?.[0];
        if (!po) return;
        setProfile(prev => ({
          ...prev,
          city: prev.city?.trim() ? prev.city : (po.District || po.Division || ''),
          billingCity: prev.billingCity?.trim() ? prev.billingCity : (po.District || po.Division || ''),
          state: prev.state?.trim() ? prev.state : (po.State || ''),
          billingState: prev.billingState?.trim() ? prev.billingState : (po.State || ''),
        }));
      })
      .catch(() => {});
  }, [profile.pincode, profile.billingPincode]); // eslint-disable-line react-hooks/exhaustive-deps

  const pincodeValid = /^\d{6}$/.test(profile.pincode ?? profile.billingPincode ?? '');
  const hasCoords = profile.latitude != null && profile.longitude != null;

  const handleSubmit = async () => {
    if (businessType === 'brand') {
      const validation = validateBrandProfile(brandProfile, 'addBusiness');
      if (!validation.success) {
        setFieldErrors(validation.errors);
        applyValidationErrors(validation.errors, validation.message, { toast: false });
        return;
      }

      setSubmitting(true);
      clearErrors();

      try {
        const res = await fetch('/api/v1/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAddBusinessPayload(brandProfile)),
        });

        const json = await parseJsonResponse<{ success: boolean; data?: { account: { id: string }; outlet: { id: string } } }>(res);
        if (!json.success) {
          applyApiError(json);
          setSubmitting(false);
          return;
        }

        if (!json.data) {
          applyValidationErrors({ _server: 'Unexpected server response' }, 'Unexpected server response');
          setSubmitting(false);
          return;
        }
        toast.success('Brand application submitted for review.');
        const newAccount = json.data.account;
        const newOutlet = json.data.outlet;
        await refreshAccounts();
        await switchAccount(newAccount.id, newOutlet.id);
        onCreated?.();
        setBrandSubmitted(true);
        setSubmitting(false);
      } catch {
        applyValidationErrors({ _server: 'Network error — please try again.' }, 'Network error — please try again.');
        setSubmitting(false);
      }
      return;
    }

    const validation = validateCustomerProfile(profile, 'addBusiness');
    if (!validation.success) {
      setFieldErrors(validation.errors);
      applyValidationErrors(validation.errors, validation.message, { dataField: true, toast: false });
      return;
    }

    setSubmitting(true);
    clearErrors();

    const isCustomer = businessType === 'customer';
    const isVendor = businessType === 'vendor';
    const legalName = derivedLegalName(profile);
    const outlet = mapToPrimaryOutlet(profile);

    const payload = {
      legalName,
      displayName: profile.displayName?.trim() || undefined,
      gstin: profile.gstin?.trim() || undefined,
      pan: profile.pan?.trim() || undefined,
      fssaiNumber: profile.fssaiNumber?.trim() || undefined,
      gstTreatment: profile.gstTreatment?.trim() || undefined,
      placeOfSupply: profile.placeOfSupply?.trim() || undefined,
      businessType: profile.businessType?.trim() || businessType,
      subType: profile.subType?.trim() || undefined,
      cuisine: profile.cuisine?.trim() || undefined,
      salutation: profile.salutation?.trim() || undefined,
      firstName: profile.firstName?.trim() || undefined,
      lastName: profile.lastName?.trim() || undefined,
      designation: profile.designation?.trim() || undefined,
      workPhone: profile.workPhone?.trim() || undefined,
      billingAddressLine: profile.addressLine ?? profile.billingAddressLine,
      billingCity: profile.city ?? profile.billingCity,
      billingState: profile.state ?? profile.billingState,
      billingPincode: profile.pincode ?? profile.billingPincode,
      isCustomer,
      isVendor,
      isBrand: false,
      primaryOutlet: {
        name: outlet.name,
        addressLine: outlet.addressLine,
        city: outlet.city ?? undefined,
        state: outlet.state ?? undefined,
        pincode: outlet.pincode ?? undefined,
        flatInfo: outlet.flatInfo ?? undefined,
        landmark: outlet.landmark ?? undefined,
        ...(profile.latitude != null && profile.longitude != null && {
          latitude: profile.latitude,
          longitude: profile.longitude,
        }),
        ...(profile.placeId != null && { placeId: profile.placeId }),
      },
    };

    try {
      const res = await fetch('/api/v1/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await parseJsonResponse<{ success: boolean; data?: { account: { id: string }; outlet: { id: string } } }>(res);
      if (!json.success) {
        applyApiError(json, { dataField: true, onFieldError: (_f, fields) => setFieldErrors(fields) });
        setSubmitting(false);
        return;
      }

      if (!json.data) {
        applyValidationErrors({ _server: 'Unexpected server response' }, 'Unexpected server response');
        setSubmitting(false);
        return;
      }

      toast.success('Business account created successfully!');

      const newAccount = json.data.account;
      const newOutlet = json.data.outlet;

      if (hasCoords && pincodeValid) {
        setSelectedAddress({
          id: `outlet_${newOutlet.id}`,
          label: outlet.name,
          businessName: legalName,
          fullAddress: outlet.addressLine,
          shortAddress: [outlet.city, outlet.state].filter(Boolean).join(', ') || outlet.addressLine.split(',').slice(0, 2).join(','),
          latitude: profile.latitude!,
          longitude: profile.longitude!,
          flatInfo: profile.flatInfo?.trim() || undefined,
          landmark: profile.landmark?.trim() || undefined,
          pincode: (profile.pincode ?? profile.billingPincode ?? '').trim(),
          city: outlet.city ?? undefined,
          state: outlet.state ?? undefined,
          placeId: profile.placeId ?? undefined,
          isDefault: false,
        });
      }

      await refreshAccounts();
      await switchAccount(newAccount.id, newOutlet.id);

      onCreated?.();
      onClose();
      window.location.assign('/');
    } catch {
      applyValidationErrors({ _server: 'Network error — please try again.' }, 'Network error — please try again.');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  if (brandSubmitted) {
    return (
      <div className="fixed inset-0 z-[16000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
        <div className="bg-white rounded-[24px] border border-[#EEEEEE] p-8 max-w-md w-full text-center shadow-[0_20px_50px_rgba(0,0,0,0.08)] animate-in zoom-in-95 duration-150">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-[#299E60]" />
          </div>
          <h3 className="text-[22px] font-[800] text-[#181725] mb-2">Application Submitted</h3>
          <p className="text-[14px] text-gray-500 mb-6">
            Your brand onboarding request has been received. Our team will review your profile and contact you shortly.
          </p>
          <button
            type="button"
            onClick={() => {
              setBrandSubmitted(false);
              onClose();
              router.push('/');
            }}
            className={cn(FORM.primaryBtn, 'inline-flex px-6 py-3 text-[13px]')}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[16000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-[20px] w-full max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-gray-100 animate-in zoom-in-95 duration-150">
        <div className="p-6 border-b border-gray-100 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#53B175] to-[#299E60] flex items-center justify-center shrink-0 shadow-lg shadow-emerald-100">
            <Building2 size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[17px] font-[800] text-[#181725] flex items-center gap-1.5 leading-snug">
              Register New Business
              <Sparkles size={14} className="text-amber-500" />
            </h3>
            <p className="text-[12px] text-gray-400 mt-0.5 leading-normal">
              Create a new entity with its own outlets, team members, and permissions.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-400 hover:text-gray-700" />
          </button>
        </div>

        <FormErrorBanner message={bannerError} className="mx-6" />

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          <div>
            <span className="text-[11px] font-bold text-[#AEAEAE] mb-1.5 block uppercase tracking-wider ml-0.5">Account Role</span>
            <div className="grid grid-cols-3 gap-2">
              {(['customer', 'vendor', 'brand'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBusinessType(t)}
                  className={`h-[42px] px-3 text-[12.5px] font-bold rounded-xl border text-center transition-all ${
                    businessType === t
                      ? 'border-[#299E60] bg-[#EEF8F1]/40 text-[#299E60] shadow-sm shadow-[#299E60]/5'
                      : 'border-[#EEEEEE] bg-white hover:border-gray-300 text-gray-500'
                  }`}
                >
                  {t === 'vendor' ? 'Supplier' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {businessType === 'vendor' && (
            <div className="rounded-2xl border-2 border-[#53B175]/30 bg-green-50/40 p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#53B175]/15 flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} className="text-[#53B175]" />
                </div>
                <div>
                  <p className="font-bold text-[13.5px] text-[#181725] mb-1">Supplier onboarding needs full KYC</p>
                  <p className="text-[11.5px] text-gray-600 leading-relaxed">
                    A supplier profile needs GST, PAN, bank details, billing &amp; pickup
                    addresses, serviceable pincodes and delivery capability — collected in
                    a 7-step wizard.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { onClose(); router.push('/vendor/register'); }}
                className="w-full bg-[#53B175] hover:bg-[#48a068] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-green-100 transition-colors"
              >
                Continue to supplier onboarding <ArrowRight size={16} />
              </button>
            </div>
          )}

          {businessType === 'customer' && (
            <CustomerProfileForm
              value={profile}
              onChange={patch => setProfile(prev => ({ ...prev, ...patch }))}
              errors={fieldErrors}
              onFieldBlur={(field, value) => setFE(field, validateCustomerFieldBlur(field, value))}
              visibleSections={{
                contact: true,
                business: true,
                auth: false,
                tax: true,
                address: true,
              }}
            />
          )}

          {businessType === 'brand' && (
            <BrandProfileForm
              value={brandProfile}
              onChange={patch => setBrandProfile(prev => ({ ...prev, ...patch }))}
              errors={fieldErrors}
              onFieldBlur={(field, value) => setFE(field, validateBrandFieldBlur(field, value))}
              requireLocationFields
              visibleSections={{
                contact: true,
                identity: true,
                market: true,
                auth: false,
                tax: true,
                address: true,
                marketing: true,
              }}
            />
          )}

        </div>

        <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0 bg-gray-50/50">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 text-[13px] font-bold text-gray-500 hover:bg-gray-100/80 rounded-xl transition-colors duration-200"
          >
            Cancel
          </button>
          {businessType !== 'vendor' && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={cn(FORM.primaryBtn, 'px-6 py-2.5 text-[13px] shadow-emerald-100')}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {submitting ? 'Registering…' : 'Create Business'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
