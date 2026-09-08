'use client';

import { useState, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FORM } from '@/components/ui/form';
import {
  CustomerProfileForm,
  type CustomerProfileValues,
} from '@/components/features/customer/CustomerProfileForm';
import { EMPTY_CUSTOMER_PROFILE } from '@/components/features/customer/customerProfileDefaults';
import {
  validateCustomerProfile,
  validateFieldBlur,
} from '@/lib/validators/customer-profile';

interface CompleteProfileOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function CompleteProfileOverlay({ isOpen, onClose, onSaved }: CompleteProfileOverlayProps) {
  const [profile, setProfile] = useState<CustomerProfileValues>({ ...EMPTY_CUSTOMER_PROFILE });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  const patchProfile = useCallback((patch: Partial<CustomerProfileValues>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
    setApiError('');
  }, []);

  const handleFieldBlur = useCallback((field: string, value: string) => {
    const msg = validateFieldBlur(field, value);
    setFieldErrors((prev) => {
      if (!msg && !prev[field]) return prev;
      const next = { ...prev };
      if (msg) next[field] = msg;
      else delete next[field];
      return next;
    });
  }, []);

  const handleSave = async () => {
    setApiError('');
    const validation = validateCustomerProfile({ ...profile, password }, 'completeProfile');
    if (!validation.success) {
      setFieldErrors(validation.errors);
      setApiError(validation.message ?? 'Please fix the highlighted fields');
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const res = await fetch('/api/v1/me/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          salutation: profile.salutation ?? '',
          designation: profile.designation ?? '',
          businessType: profile.businessType ?? '',
          subType: profile.subType ?? '',
          cuisine: profile.cuisine ?? '',
          workPhone: profile.workPhone ?? '',
          password,
          gstTreatment: profile.gstTreatment ?? '',
          placeOfSupply: profile.placeOfSupply ?? '',
          gstin: (profile.gstin ?? '').toUpperCase().trim(),
          pan: (profile.pan ?? '').toUpperCase().trim(),
          fssaiNumber: profile.fssaiNumber ?? '',
          outletName: profile.outletName ?? '',
          addressLine: profile.addressLine ?? profile.billingAddressLine ?? '',
          flatInfo: profile.flatInfo ?? '',
          landmark: profile.landmark ?? '',
          city: profile.city ?? profile.billingCity ?? '',
          state: profile.state ?? profile.billingState ?? '',
          pincode: profile.pincode ?? profile.billingPincode ?? '',
          latitude: profile.latitude ?? null,
          longitude: profile.longitude ?? null,
          placeId: profile.placeId ?? null,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setApiError(data.error?.message || data.error || 'Could not save profile');
        return;
      }
      toast.success('Profile updated');
      onSaved();
      onClose();
    } catch {
      setApiError('Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
      <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[720px] md:mt-[4vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-white flex flex-col relative z-10 overflow-hidden">
        <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-10">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary mb-0.5">Almost there</p>
            <h2 className="text-[17px] md:text-[20px] font-[700] text-[#181725]">Complete your profile</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">Optional — you can skip any field and finish later.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 top-3"
            aria-label="Close"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 pb-6">
          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-[13px] text-red-600 font-medium">
              {apiError}
            </div>
          )}
          <CustomerProfileForm
            value={profile}
            onChange={patchProfile}
            errors={fieldErrors}
            onFieldBlur={handleFieldBlur}
            layout="wide"
            mode="full"
            businessTypeInput="text"
            omitCoreFields
            visibleSections={{ contact: true, business: true, auth: true, tax: true, address: true }}
            collapsedSections={['tax', 'address']}
            showPassword
            password={password}
            onPasswordChange={setPassword}
            showPasswordToggle
            passwordVisible={showPassword}
            onTogglePassword={() => setShowPassword((v) => !v)}
          />
        </div>

        <div className="shrink-0 border-t border-gray-100 px-4 md:px-6 py-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={cn(FORM.primaryBtn, 'w-full')}
          >
            {saving && <Loader2 size={18} className="animate-spin" />}
            Save &amp; continue
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full py-2 text-[13px] font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
