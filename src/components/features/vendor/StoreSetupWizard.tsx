'use client';

/**
 * Multi-step Add Online Store wizard — mirrors register Steps 3–7.
 * Reuses VendorProfileForm for contact / tax / addresses.
 */

import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import {
  VendorProfileForm,
  type VendorProfileValues,
} from '@/components/features/vendor/VendorProfileForm';
import { EMPTY_VENDOR_PROFILE } from '@/components/features/vendor/vendorProfileDefaults';
import {
  FormField,
  FormInput,
  FormSelect,
  TextField,
} from '@/components/ui/form';
import { validateFieldBlur as validateVendorFieldBlur } from '@/lib/validators/vendor-profile';
import { IFSC_RE, PINCODE_RE } from '@/lib/validators/vendor-kyc';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 1, label: 'Contact' },
  { id: 2, label: 'GST & PAN' },
  { id: 3, label: 'Bank' },
  { id: 4, label: 'Addresses' },
  { id: 5, label: 'Service' },
] as const;

export type StoreSetupPayload = {
  storeName: string;
  storeDisplayName?: string;
  authorizedPersonName?: string;
  authorizedPersonPhone?: string;
  authorizedPersonEmail?: string;
  gstNumber?: string;
  panNumber?: string;
  fssaiNumber?: string;
  udyamNumber?: string;
  cinNumber?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  bankAccountType?: 'savings' | 'current';
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
  pickupAddressLine?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupPincode?: string;
  deliveryCapability?: 'own_fleet' | 'third_party' | 'both';
  serviceablePincodes?: string[];
};

type Props = {
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (payload: StoreSetupPayload) => Promise<void>;
};

export function StoreSetupWizard({ submitting = false, onCancel, onSubmit }: Props) {
  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [storeName, setStoreName] = useState('');
  const [profile, setProfile] = useState<VendorProfileValues>({ ...EMPTY_VENDOR_PROFILE });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pickupSameAsBilling, setPickupSameAsBilling] = useState(true);

  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountType, setBankAccountType] = useState<'savings' | 'current' | ''>('');

  const [pincodes, setPincodes] = useState<string[]>([]);
  const [pincodeInput, setPincodeInput] = useState('');
  const [deliveryCapability, setDeliveryCapability] = useState<'own_fleet' | 'third_party' | 'both' | ''>('');
  const [udyamNumber, setUdyamNumber] = useState('');
  const [cinNumber, setCinNumber] = useState('');

  const setFE = (field: string, msg: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: msg }));
  };

  const addPincode = () => {
    const p = pincodeInput.trim();
    if (!PINCODE_RE.test(p)) {
      setFE('serviceablePincodes', 'Enter a valid 6-digit pincode');
      return;
    }
    if (!pincodes.includes(p)) setPincodes((prev) => [...prev, p]);
    setPincodeInput('');
    setFE('serviceablePincodes', '');
  };

  const validateStep = (n: number): boolean => {
    const errors: Record<string, string> = {};
    if (n === 1) {
      if (storeName.trim().length < 2) errors.storeName = 'Store name is required';
      const contact = (profile.authorizedPersonName ?? '').trim();
      if (contact.length < 2) errors.authorizedPersonName = 'Contact person is required';
      const phone = (profile.phone ?? profile.authorizedPersonPhone ?? '').replace(/\D/g, '').slice(-10);
      const email = (profile.email ?? profile.authorizedPersonEmail ?? '').trim();
      if (phone.length !== 10 && !email) {
        errors.authorizedPersonPhone = 'Enter mobile or email';
      }
    }
    if (n === 3) {
      if (bankAccountName.trim().length < 2) errors.bankAccountName = 'Account holder name is required';
      if (bankAccountNumber.replace(/\D/g, '').length < 8) errors.bankAccountNumber = 'Enter a valid account number';
      if (!IFSC_RE.test(bankIfsc.trim().toUpperCase())) errors.bankIfsc = 'Invalid IFSC';
      if (bankName.trim().length < 2) errors.bankName = 'Bank name is required';
      if (!bankAccountType) errors.bankAccountType = 'Select account type';
    }
    if (n === 4) {
      const line = (profile.billingAddressLine ?? profile.billingAddress?.addressLine ?? '').trim();
      const city = (profile.billingCity ?? profile.billingAddress?.city ?? '').trim();
      const state = (profile.billingState ?? profile.billingAddress?.state ?? '').trim();
      const pin = (profile.billingPincode ?? profile.billingAddress?.pincode ?? '').trim();
      if (line.length < 5) errors.billingAddressLine = 'Billing address is required';
      if (!city) errors.billingCity = 'City is required';
      if (!state) errors.billingState = 'State is required';
      if (!PINCODE_RE.test(pin)) errors.billingPincode = 'Invalid pincode';
      if (!pickupSameAsBilling) {
        if (!(profile.pickupAddressLine ?? '').trim()) errors.pickupAddressLine = 'Pickup address is required';
        if (!(profile.pickupCity ?? '').trim()) errors.pickupCity = 'Pickup city is required';
        if (!(profile.pickupState ?? '').trim()) errors.pickupState = 'Pickup state is required';
        if (!PINCODE_RE.test((profile.pickupPincode ?? '').trim())) errors.pickupPincode = 'Invalid pickup pincode';
      }
    }
    if (n === 5) {
      if (pincodes.length === 0) errors.serviceablePincodes = 'Add at least one serviceable pincode';
      if (!deliveryCapability) errors.deliveryCapability = 'Select delivery capability';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    const next = Math.min(5, step + 1);
    setStep(next);
    setMaxReached((m) => Math.max(m, next));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const goToStep = (target: number) => {
    if (target < 1 || target > maxReached || target === step) return;
    setStep(target);
  };

  const handleSubmit = async () => {
    if (!validateStep(5)) return;
    const billingLine = (profile.billingAddressLine ?? profile.billingAddress?.addressLine ?? '').trim();
    const billingCity = (profile.billingCity ?? profile.billingAddress?.city ?? '').trim();
    const billingState = (profile.billingState ?? profile.billingAddress?.state ?? '').trim();
    const billingPin = (profile.billingPincode ?? profile.billingAddress?.pincode ?? '').trim();
    const pickupLine = pickupSameAsBilling ? billingLine : (profile.pickupAddressLine ?? '').trim();
    const pickupCity = pickupSameAsBilling ? billingCity : (profile.pickupCity ?? '').trim();
    const pickupState = pickupSameAsBilling ? billingState : (profile.pickupState ?? '').trim();
    const pickupPin = pickupSameAsBilling ? billingPin : (profile.pickupPincode ?? '').trim();

    await onSubmit({
      storeName: storeName.trim(),
      storeDisplayName: storeName.trim(),
      authorizedPersonName: (profile.authorizedPersonName ?? '').trim() || undefined,
      authorizedPersonPhone: (profile.phone ?? profile.authorizedPersonPhone ?? '').replace(/\D/g, '').slice(-10) || undefined,
      authorizedPersonEmail: (profile.email ?? profile.authorizedPersonEmail ?? '').trim() || undefined,
      gstNumber: (profile.gstin ?? profile.gstNumber ?? '').trim().toUpperCase() || undefined,
      panNumber: (profile.pan ?? profile.panNumber ?? '').trim().toUpperCase() || undefined,
      fssaiNumber: (profile.fssaiNumber ?? '').trim() || undefined,
      udyamNumber: udyamNumber.trim() || undefined,
      cinNumber: cinNumber.trim() || undefined,
      bankAccountName: bankAccountName.trim(),
      bankAccountNumber: bankAccountNumber.replace(/\D/g, ''),
      bankIfsc: bankIfsc.trim().toUpperCase(),
      bankName: bankName.trim(),
      bankAccountType: bankAccountType || undefined,
      addressLine: billingLine || undefined,
      city: billingCity || undefined,
      state: billingState || undefined,
      pincode: billingPin || undefined,
      pickupAddressLine: pickupLine || undefined,
      pickupCity: pickupCity || undefined,
      pickupState: pickupState || undefined,
      pickupPincode: pickupPin || undefined,
      deliveryCapability: deliveryCapability || undefined,
      serviceablePincodes: pincodes,
    });
  };

  return (
    <div className="bg-white rounded-[16px] w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-xl border border-[#EEEEEE]">
      <div className="px-5 py-4 border-b border-[#F0F0F0] sticky top-0 bg-white z-10">
        <h3 className="text-[16px] font-bold text-[#181725]">Add Online Store</h3>
        <p className="text-[12px] text-[#7C7C7C] mt-0.5">
          Same setup as register (Steps 3–7). This store stays off the marketplace until a super-admin Approve &amp; Verify.
        </p>
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {STEPS.map((s) => {
            const clickable = s.id <= maxReached;
            const active = step === s.id;
            const done = step > s.id;
            const className = cn(
              'text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors',
              active
                ? 'bg-[#299E60] text-white'
                : done || clickable
                  ? 'bg-[#E8F7EF] text-[#299E60]'
                  : 'bg-[#F3F4F6] text-[#AEAEAE]',
              clickable && !active && 'hover:bg-[#D1FAE5] cursor-pointer',
              !clickable && 'cursor-default',
            );
            if (!clickable) {
              return (
                <span key={s.id} className={className}>
                  {s.id}. {s.label}
                </span>
              );
            }
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goToStep(s.id)}
                className={className}
                aria-current={active ? 'step' : undefined}
              >
                {s.id}. {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {step === 1 && (
          <>
            <TextField
              label="Store name"
              required
              value={storeName}
              error={fieldErrors.storeName}
              onChange={(v) => {
                setStoreName(v);
                if (fieldErrors.storeName) setFE('storeName', v.trim().length < 2 ? 'Store name is required' : '');
              }}
              placeholder="e.g. Acme Foods — Andheri"
            />
            <VendorProfileForm
              value={profile}
              onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
              errors={fieldErrors}
              onFieldBlur={(field, value) => setFE(field, validateVendorFieldBlur(field, value))}
              visibleSections={{ contact: true }}
              layout="wide"
            />
          </>
        )}

        {step === 2 && (
          <VendorProfileForm
            value={profile}
            onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
            errors={fieldErrors}
            onFieldBlur={(field, value) => setFE(field, validateVendorFieldBlur(field, value))}
            visibleSections={{ tax: true }}
            layout="wide"
          />
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <TextField
              label="Account holder name"
              required
              className="sm:col-span-2"
              value={bankAccountName}
              error={fieldErrors.bankAccountName}
              onChange={setBankAccountName}
              placeholder="As per bank records"
            />
            <TextField
              label="Account number"
              required
              value={bankAccountNumber}
              error={fieldErrors.bankAccountNumber}
              onChange={(v) => setBankAccountNumber(v.replace(/\D/g, '').slice(0, 18))}
              placeholder="123456789012"
            />
            <TextField
              label="IFSC code"
              required
              value={bankIfsc}
              error={fieldErrors.bankIfsc}
              onChange={(v) => setBankIfsc(v.toUpperCase().slice(0, 11))}
              placeholder="HDFC0001234"
            />
            <TextField
              label="Bank name"
              required
              value={bankName}
              error={fieldErrors.bankName}
              onChange={setBankName}
              placeholder="HDFC Bank"
            />
            <FormField label="Account type" required error={fieldErrors.bankAccountType}>
              <FormSelect
                value={bankAccountType}
                onChange={(v) => setBankAccountType(v as 'savings' | 'current' | '')}
                hasError={!!fieldErrors.bankAccountType}
              >
                <option value="">Select</option>
                <option value="current">Current</option>
                <option value="savings">Savings</option>
              </FormSelect>
            </FormField>
          </div>
        )}

        {step === 4 && (
          <VendorProfileForm
            value={profile}
            onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
            errors={fieldErrors}
            onFieldBlur={(field, value) => setFE(field, validateVendorFieldBlur(field, value))}
            visibleSections={{ billing: true, pickup: true }}
            pickupSameAsBilling={pickupSameAsBilling}
            onPickupSameAsBillingChange={setPickupSameAsBilling}
            layout="wide"
          />
        )}

        {step === 5 && (
          <div className="space-y-4">
            <FormField label="Serviceable pincodes" required error={fieldErrors.serviceablePincodes}>
              <div className="flex gap-2">
                <FormInput
                  value={pincodeInput}
                  onChange={(v) => setPincodeInput(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Add 6-digit pincode"
                />
                <button
                  type="button"
                  onClick={addPincode}
                  className="px-4 py-2 bg-[#299E60] hover:bg-[#238a54] text-white rounded-[10px] font-bold flex items-center gap-1"
                >
                  <Plus size={16} /> Add
                </button>
              </div>
              {pincodes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {pincodes.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1.5 bg-[#ECFDF5] text-[#299E60] px-3 py-1.5 rounded-full text-[13px] font-bold"
                    >
                      {p}
                      <button
                        type="button"
                        onClick={() => setPincodes((prev) => prev.filter((x) => x !== p))}
                        className="hover:bg-[#299E60]/10 rounded-full p-0.5"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </FormField>
            <FormField label="Delivery capability" required error={fieldErrors.deliveryCapability}>
              <FormSelect
                value={deliveryCapability}
                onChange={(v) => setDeliveryCapability(v as typeof deliveryCapability)}
                hasError={!!fieldErrors.deliveryCapability}
              >
                <option value="">Select</option>
                <option value="own_fleet">Own fleet</option>
                <option value="third_party">Third party</option>
                <option value="both">Both</option>
              </FormSelect>
            </FormField>
            <TextField
              label="Udyam number (optional)"
              value={udyamNumber}
              onChange={setUdyamNumber}
              placeholder="Optional"
            />
            <TextField
              label="CIN (optional)"
              value={cinNumber}
              onChange={setCinNumber}
              placeholder="Optional"
            />
          </div>
        )}

        <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-1">
          <button
            type="button"
            onClick={step === 1 ? onCancel : goBack}
            disabled={submitting}
            className="flex-1 h-[36px] border border-[#EEEEEE] rounded-[8px] text-[13px] font-semibold text-[#7C7C7C] hover:bg-[#F8F9FB]"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 5 ? (
            <button
              type="button"
              onClick={goNext}
              className="flex-1 h-[36px] bg-[#299E60] hover:bg-[#238a54] text-white rounded-[8px] text-[13px] font-bold"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="flex-1 h-[36px] bg-[#299E60] hover:bg-[#238a54] text-white rounded-[8px] text-[13px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Create store
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
