'use client';

// Admin → Vendors → Add Vendor wizard.
//
// Replaces the old short-form modal that only collected 7 fields and
// created a half-built vendor that the new user then had to complete via
// /vendor/settings. This wizard mirrors the public /vendor/register flow
// (minus OTP) so the vendor is fully onboarded the moment admin clicks
// "Create vendor": legal name, trade name, vendor type, GST, PAN, full
// bank details, authorized person, billing address, pickup outlet,
// serviceable pincodes, delivery capability, FSSAI/Udyam/CIN.
//
// Backend contract: POST /api/v1/admin/vendors with the body shape
// validated against src/lib/validators/vendor-kyc.ts schemas.

import { useState, useEffect, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, Loader2, AlertCircle, Check,
  Info, UserPlus, Building2, IndianRupee, MapPin, Truck, Eye, EyeOff, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  GST_RE, PAN_RE, IFSC_RE, PHONE_RE, PINCODE_RE,
  VENDOR_TYPES, DELIVERY_CAPABILITIES,
  type VendorType, type DeliveryCapability,
} from '@/lib/validators/vendor-kyc';
import {
  VendorProfileForm,
  type VendorProfileValues,
} from '@/components/features/vendor/VendorProfileForm';
import { EMPTY_VENDOR_PROFILE } from '@/components/features/vendor/vendorProfileDefaults';
import {
  validateVendorProfile,
  validateFieldBlur as validateVendorFieldBlur,
  resolveVendorTypeSlug,
} from '@/lib/validators/vendor-profile';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { cn } from '@/lib/utils';
import { FORM, FormField as Field, FormInput, SectionLabel, selectClass, textareaClass, FormErrorBanner, useFormFeedback } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';

interface Props {
  onClose: () => void;
  onCreated: (vendor: { id: string; businessName: string; slug: string; user: { id: string; fullName: string; email: string } }) => void;
  createEndpoint?: string;
}

const STEP_LABELS = ['Owner & Business', 'KYC & Bank', 'Address & Operations'];

interface AddressInput { addressLine: string; city: string; state: string; pincode: string }
const blankAddress = (): AddressInput => ({ addressLine: '', city: '', state: '', pincode: '' });

const VENDOR_TYPE_LABEL: Partial<Record<VendorType, string>> = {
  distributor:  'Distributor',
  wholesaler:   'Wholesaler',
  brand_store:  'Brand Store',
  manufacturer: 'Manufacturer',
  dark_store:   'Dark Store',
  sub_distributor: 'Sub Distributor',
  importer: 'Importer',
  trader: 'Trader',
  packaging_supplier: 'Packaging Supplier',
};

const DELIVERY_LABEL: Record<DeliveryCapability, string> = {
  own_fleet:   'Own fleet',
  third_party: 'Third-party (e.g. Dunzo/Porter)',
  both:        'Both — own + third-party',
};

function vendorStepForField(field?: string): 1 | 2 | 3 {
  if (!field) return 1;
  if (['fullName', 'phone', 'email', 'password', 'businessName'].includes(field)) return 1;
  if (
    ['billingAddressLine', 'billingAddressCity', 'billingAddressState', 'billingAddressPincode',
      'pickupAddressLine', 'pickupAddressCity', 'pickupAddressState', 'pickupAddressPincode',
      'outletName', 'serviceablePincodes', 'deliveryCapability'].includes(field)
  ) return 3;
  return 2;
}

export function AddVendorWizard({ onClose, onCreated, createEndpoint = '/api/v1/admin/vendors' }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const { bannerError, clearErrors, applyApiError, applyValidationErrors } = useFormFeedback();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [vendorProfile, setVendorProfile] = useState<VendorProfileValues>({ ...EMPTY_VENDOR_PROFILE });

  // Step 1 — Owner + Business basics
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [vendorType, setVendorType] = useState<VendorType | ''>('');
  const [gstin, setGstin] = useState('');

  // Step 2 — KYC + Bank
  const [panNumber, setPanNumber] = useState('');
  const [authorizedPersonName, setAuthorizedPersonName] = useState('');
  const [authorizedPersonPhone, setAuthorizedPersonPhone] = useState('');
  const [authorizedPersonEmail, setAuthorizedPersonEmail] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountType, setBankAccountType] = useState<'savings' | 'current'>('current');
  const [billingAddress, setBillingAddress] = useState<AddressInput>(blankAddress());

  // Step 3 — Address & Operations
  const [pickupSameAsBilling, setPickupSameAsBilling] = useState(true);
  const [pickupAddress, setPickupAddress] = useState<AddressInput>(blankAddress());
  const [outletName, setOutletName] = useState('');
  const [pincodes, setPincodes] = useState<string[]>([]);
  const [pincodeInput, setPincodeInput] = useState('');
  const [deliveryCapability, setDeliveryCapability] = useState<DeliveryCapability | ''>('');
  const [fssaiNumber, setFssaiNumber] = useState('');
  const [udyamNumber, setUdyamNumber] = useState('');
  const [cinNumber, setCinNumber] = useState('');
  const [description, setDescription] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('');

  const effectivePickup = pickupSameAsBilling ? billingAddress : pickupAddress;

  // ── Step validation.
  const validateStep = (s: number): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (s === 1) {
      if (fullName.trim().length < 2) errors.fullName = 'Owner full name is required (min 2 chars)';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address';
      if (password.length < 6) errors.password = 'Password must be at least 6 characters';
      if (!PHONE_RE.test(phone)) errors.phone = 'Phone number must be exactly 10 digits';
      if (businessName.trim().length < 2) errors.businessName = 'Legal name is required (min 2 chars)';
      const profileValidation = validateVendorProfile(
        { ...vendorProfile, legalName: businessName, tradeName, email, password, phone },
        'adminCreate',
        'identity',
      );
      Object.assign(errors, profileValidation.errors);
      if (gstin.trim() && !GST_RE.test(gstin.trim())) errors.gstin = 'Format: 22ABCDE1234F1Z5';
    } else if (s === 2) {
      if (panNumber.trim() && !PAN_RE.test(panNumber.trim())) errors.panNumber = 'Format: ABCDE1234F';
      if (authorizedPersonName.trim().length < 2) errors.authorizedPersonName = 'Authorized person name is required (min 2 chars)';
      if (!PHONE_RE.test(authorizedPersonPhone)) errors.authorizedPersonPhone = 'Authorized phone must be exactly 10 digits';
      if (authorizedPersonEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorizedPersonEmail.trim())) {
        errors.authorizedPersonEmail = 'Enter a valid email address';
      }
      if (bankAccountName.trim().length < 2) errors.bankAccountName = 'Account holder name is required (min 2 chars)';
      if (bankAccountNumber.trim().length < 8) errors.bankAccountNumber = 'Account number must be at least 8 digits';
      if (!IFSC_RE.test(bankIfsc.trim())) errors.bankIfsc = 'IFSC must be 11 characters (e.g. HDFC0001234)';
      if (bankName.trim().length < 2) errors.bankName = 'Bank name is required';
      if (billingAddress.addressLine.trim().length < 5) errors.billingAddressLine = 'Address line must be at least 5 characters';
      if (!billingAddress.city.trim()) errors.billingAddressCity = 'City is required';
      if (!billingAddress.state.trim()) errors.billingAddressState = 'State is required';
      if (!PINCODE_RE.test(billingAddress.pincode)) errors.billingAddressPincode = 'Pincode must be exactly 6 digits';
    } else if (s === 3) {
      if (outletName.trim().length < 1) errors.outletName = 'Outlet name is required';
      if (effectivePickup.addressLine.trim().length < 5) errors.pickupAddressLine = 'Pickup address line must be at least 5 characters';
      if (!effectivePickup.city.trim()) errors.pickupAddressCity = 'City is required';
      if (!effectivePickup.state.trim()) errors.pickupAddressState = 'State is required';
      if (!PINCODE_RE.test(effectivePickup.pincode)) errors.pickupAddressPincode = 'Pincode must be exactly 6 digits';
      if (pincodes.length === 0) errors.serviceablePincodes = 'Add at least one serviceable pincode';
      if (!deliveryCapability) errors.deliveryCapability = 'Select delivery capability';
    }
    return errors;
  };

  const handleNext = () => {
    clearErrors();
    const errors = validateStep(step);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      applyValidationErrors(errors, 'Please complete the required fields and fix any errors.', { toast: false });
      return;
    }
    setFieldErrors({});
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };
  const handleBack = () => { clearErrors(); setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s)); };

  const handleAddPincode = () => {
    const value = pincodeInput.trim();
    if (!PINCODE_RE.test(value)) {
      toast.error('Enter a valid 6-digit pincode');
      return;
    }
    if (pincodes.includes(value)) {
      setPincodeInput('');
      return;
    }
    setPincodes((prev) => [...prev, value]);
    setPincodeInput('');
  };

  const handleRemovePincode = (p: string) => {
    setPincodes((prev) => prev.filter((x) => x !== p));
  };

  const handleSubmit = async () => {
    clearErrors();
    const errors1 = validateStep(1);
    const errors2 = validateStep(2);
    const errors3 = validateStep(3);
    const allErrors = { ...errors1, ...errors2, ...errors3 };
    if (Object.keys(allErrors).length > 0) {
      setFieldErrors(allErrors);
      if (Object.keys(errors1).length > 0) setStep(1);
      else if (Object.keys(errors2).length > 0) setStep(2);
      else setStep(3);
      applyValidationErrors(allErrors, 'Some fields are incomplete or invalid. Please check all steps.', { toast: false });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const body = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim(),
        businessName: businessName.trim(),
        tradeName: tradeName.trim() || undefined,
        gstin: gstin.trim() || undefined,
        description: description.trim() || undefined,
        minOrderValue: minOrderValue ? Number(minOrderValue) : undefined,
        subType: vendorProfile.subType,
        categoriesHandled: vendorProfile.categoriesHandled,
        businessSize: vendorProfile.businessSize,
        coverage: vendorProfile.coverage,
        warehouseCount: vendorProfile.warehouseCount,
        deliveryFleet: vendorProfile.deliveryFleet,
        monthlySupplyBand: vendorProfile.monthlySupplyBand,
        salutation: vendorProfile.salutation,
        firstName: vendorProfile.firstName,
        lastName: vendorProfile.lastName,
        designation: vendorProfile.designation,
        primaryOutlet: {
          name: outletName.trim(),
          addressLine: effectivePickup.addressLine.trim(),
          city: effectivePickup.city.trim() || undefined,
          state: effectivePickup.state.trim() || undefined,
          pincode: effectivePickup.pincode.trim() || undefined,
        },
        vendorDetails: {
          vendorType: resolveVendorTypeSlug({ ...vendorProfile, vendorType }) || vendorType,
          subType: vendorProfile.subType,
          categoriesHandled: vendorProfile.categoriesHandled,
          businessSize: vendorProfile.businessSize,
          coverage: vendorProfile.coverage,
          warehouseCount: vendorProfile.warehouseCount,
          deliveryFleet: vendorProfile.deliveryFleet,
          monthlySupplyBand: vendorProfile.monthlySupplyBand,
          panNumber: panNumber.trim().toUpperCase(),
          authorizedPersonName: authorizedPersonName.trim(),
          authorizedPersonPhone: authorizedPersonPhone.trim(),
          authorizedPersonEmail: authorizedPersonEmail.trim() || undefined,
          billingAddress: {
            addressLine: billingAddress.addressLine.trim(),
            city: billingAddress.city.trim(),
            state: billingAddress.state.trim(),
            pincode: billingAddress.pincode.trim(),
          },
          bankAccountName: bankAccountName.trim(),
          bankAccountNumber: bankAccountNumber.trim(),
          bankIfsc: bankIfsc.trim().toUpperCase(),
          bankName: bankName.trim(),
          bankAccountType,
          serviceablePincodes: pincodes,
          deliveryCapability,
          fssaiNumber: fssaiNumber.trim() || undefined,
          udyamNumber: udyamNumber.trim() || undefined,
          cinNumber: cinNumber.trim() || undefined,
        },
      };
      const res = await fetch(createEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await parseJsonResponse<{
        success: boolean;
        data?: { vendor?: { id: string; businessName: string; slug: string; user: { id: string; fullName: string; email: string } }; businessName?: string };
      }>(res);
      if (!json.success) {
        applyApiError(json, {
          onFieldError: (field, fields) => {
            setFieldErrors((prev) => ({ ...prev, ...fields }));
            setStep(vendorStepForField(field));
          },
        });
        return;
      }
      const created = json.data?.vendor ?? json.data;
      if (!created || typeof created !== 'object' || !('businessName' in created)) {
        applyValidationErrors({ _server: 'Unexpected server response' }, 'Unexpected server response');
        return;
      }
      toast.success(`${created.businessName} created`);
      onCreated(created as { id: string; businessName: string; slug: string; user: { id: string; fullName: string; email: string } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create vendor';
      applyValidationErrors({ _server: msg }, msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[15000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[20px] w-full max-w-[820px] shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-[#EEEEEE] shrink-0 bg-[#FAFAFA] rounded-t-[20px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#6B1D2E] to-[#6B1D2E] rounded-[10px] flex items-center justify-center shadow-md shadow-green-100">
              <UserPlus size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-[17px] font-[800] text-[#181725] tracking-tight">Add Vendor</h3>
              <p className="text-[11px] text-gray-400 font-bold mt-0.5 uppercase tracking-wide">
                Step {step} of 3 — {STEP_LABELS[step - 1]}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-7 pt-5 pb-3.5 shrink-0 bg-[#FAFAFA]/50 border-b border-[#EEEEEE]">
          <div className="flex items-center justify-between max-w-[650px] mx-auto">
            {([1, 2, 3] as const).map((s, i) => (
              <Step key={s} num={s} label={STEP_LABELS[s - 1]} current={step} showConnector={i < 2} />
            ))}
          </div>
        </div>

        <FormErrorBanner message={bannerError} className="mx-6" />

        {/* Body — autoComplete handled per-input (autoComplete on the outer
            <div> isn't a valid React prop and TS bails). */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {/* Disclaimer always visible at the top */}
          {step === 1 && (
            <div className="flex items-start gap-2 p-3 mb-4 bg-blue-50 border border-blue-100 rounded-[10px]">
              <Info size={14} className="text-blue-600 mt-0.5 shrink-0" />
              <p className="text-[11.5px] text-blue-800 leading-relaxed">
                Creates a <strong>new HCID</strong> — a fresh User, BusinessAccount, and Vendor profile.
                The vendor signs in with the email + password you set here. Use the vendor&apos;s own credentials, not yours.
              </p>
            </div>
          )}

          {/* Step 1 — Owner + Business */}
          {step === 1 && (
            <div className="space-y-4">
              <SectionLabel>Owner Account</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Owner Full Name" required error={fieldErrors.fullName}>
                  <Input
                    name="vendor-owner-name" value={fullName}
                    onChange={(v) => { setFullName(v); setFieldErrors(prev => ({ ...prev, fullName: '' })); }}
                    hasError={!!fieldErrors.fullName} placeholder="Rajesh Kumar"
                  />
                </Field>
                <Field label="Owner Phone (10-digit)" required error={fieldErrors.phone}>
                  <Input
                    name="vendor-owner-phone" value={phone}
                    onChange={(v) => {
                      setPhone(v.replace(/\D/g, '').slice(0, 10));
                      setFieldErrors(prev => ({ ...prev, phone: '' }));
                    }}
                    hasError={!!fieldErrors.phone}
                    placeholder="9876543210" inputMode="tel"
                  />
                </Field>
              </div>
              <Field label="Owner Email" required error={fieldErrors.email}>
                <Input
                  name="vendor-owner-email" type="email" value={email}
                  onChange={(v) => { setEmail(v); setFieldErrors(prev => ({ ...prev, email: '' })); }}
                  hasError={!!fieldErrors.email} placeholder="rajesh@dailyfreshfoods.com"
                />
              </Field>
              <Field label="Owner Password" required error={fieldErrors.password}>
                <div className="relative">
                  <Input
                    name="vendor-owner-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(v) => { setPassword(v); setFieldErrors(prev => ({ ...prev, password: '' })); }}
                    hasError={!!fieldErrors.password}
                    placeholder="Min 6 characters"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>

              <div className="pt-2 border-t border-[#EEEEEE]" />
              <VendorProfileForm
                value={{
                  ...vendorProfile,
                  legalName: businessName,
                  tradeName,
                  displayName: tradeName,
                  gstin,
                  email,
                }}
                onChange={patch => {
                  setVendorProfile(prev => ({ ...prev, ...patch }));
                  if (patch.legalName !== undefined) setBusinessName(patch.legalName);
                  if (patch.tradeName !== undefined) setTradeName(patch.tradeName);
                  if (patch.displayName !== undefined) setTradeName(patch.displayName);
                  if (patch.gstin !== undefined) setGstin(patch.gstin);
                  if (patch.vendorBusinessType) {
                    const slug = resolveVendorTypeSlug({ ...vendorProfile, ...patch });
                    if (slug) setVendorType(slug as VendorType);
                  }
                }}
                errors={fieldErrors}
                onFieldBlur={(field, value) => {
                  const msg = validateVendorFieldBlur(field, value);
                  setFieldErrors(prev => {
                    const next = { ...prev };
                    if (msg) next[field] = msg; else delete next[field];
                    return next;
                  });
                }}
                visibleSections={{ identity: true, ops: true, tax: true }}
              />
            </div>
          )}

          {/* Step 2 — KYC + Bank */}
          {step === 2 && (
            <div className="space-y-4 min-h-[480px]">
              <SectionLabel>Identity</SectionLabel>
              <Field label="PAN (optional)" error={fieldErrors.panNumber}>
                <Input
                  name="vendor-pan" value={panNumber}
                  onChange={(v) => {
                    setPanNumber(v.toUpperCase().slice(0, 10));
                    setFieldErrors(prev => ({ ...prev, panNumber: '' }));
                  }}
                  hasError={!!fieldErrors.panNumber}
                  placeholder="ABCDE1234F"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Authorized Person Name" required error={fieldErrors.authorizedPersonName}>
                  <Input
                    name="vendor-ap-name" value={authorizedPersonName}
                    onChange={(v) => {
                      setAuthorizedPersonName(v);
                      setFieldErrors(prev => ({ ...prev, authorizedPersonName: '' }));
                    }}
                    hasError={!!fieldErrors.authorizedPersonName}
                    placeholder="Rajesh Kumar"
                  />
                </Field>
                <Field label="Authorized Person Phone" required error={fieldErrors.authorizedPersonPhone}>
                  <Input
                    name="vendor-ap-phone" value={authorizedPersonPhone}
                    onChange={(v) => {
                      setAuthorizedPersonPhone(v.replace(/\D/g, '').slice(0, 10));
                      setFieldErrors(prev => ({ ...prev, authorizedPersonPhone: '' }));
                    }}
                    hasError={!!fieldErrors.authorizedPersonPhone}
                    placeholder="9876543210" inputMode="tel"
                  />
                </Field>
              </div>
              <Field label="Authorized Person Email" error={fieldErrors.authorizedPersonEmail}>
                <Input
                  name="vendor-ap-email" type="email" value={authorizedPersonEmail}
                  onChange={(v) => {
                    setAuthorizedPersonEmail(v);
                    setFieldErrors(prev => ({ ...prev, authorizedPersonEmail: '' }));
                  }}
                  hasError={!!fieldErrors.authorizedPersonEmail}
                  placeholder="rajesh@dailyfresh.com"
                />
              </Field>

              <div className="pt-2 border-t border-[#EEEEEE]" />
              <SectionLabel><IndianRupee size={12} className="inline mr-1" />Bank Details</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Account Holder Name" required error={fieldErrors.bankAccountName}>
                  <Input
                    name="vendor-bank-name" value={bankAccountName}
                    onChange={(v) => {
                      setBankAccountName(v);
                      setFieldErrors(prev => ({ ...prev, bankAccountName: '' }));
                    }}
                    hasError={!!fieldErrors.bankAccountName}
                    placeholder="Daily Fresh Foods Pvt Ltd"
                  />
                </Field>
                <Field label="Account Number" required error={fieldErrors.bankAccountNumber}>
                  <Input
                    name="vendor-bank-acc" value={bankAccountNumber}
                    onChange={(v) => {
                      setBankAccountNumber(v.replace(/\D/g, '').slice(0, 30));
                      setFieldErrors(prev => ({ ...prev, bankAccountNumber: '' }));
                    }}
                    hasError={!!fieldErrors.bankAccountNumber}
                    placeholder="50100123456789"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="IFSC" required error={fieldErrors.bankIfsc}>
                  <Input
                    name="vendor-ifsc" value={bankIfsc}
                    onChange={(v) => {
                      setBankIfsc(v.toUpperCase().slice(0, 11));
                      setFieldErrors(prev => ({ ...prev, bankIfsc: '' }));
                    }}
                    hasError={!!fieldErrors.bankIfsc}
                    placeholder="HDFC0001234"
                  />
                </Field>
                <Field label="Bank Name" required error={fieldErrors.bankName}>
                  <Input
                    name="vendor-bank" value={bankName}
                    onChange={(v) => {
                      setBankName(v);
                      setFieldErrors(prev => ({ ...prev, bankName: '' }));
                    }}
                    hasError={!!fieldErrors.bankName}
                    placeholder="HDFC Bank"
                  />
                </Field>
              </div>
              <Field label="Account Type" required>
                <div className="flex items-center gap-2">
                  {(['savings', 'current'] as const).map((t) => (
                    <button
                      key={t} type="button"
                      onClick={() => setBankAccountType(t)}
                      className={`flex-1 h-[40px] rounded-[10px] text-[12.5px] font-bold border-2 capitalize transition-all
                        ${bankAccountType === t ? 'border-[#6B1D2E] bg-[#ECFDF5] text-[#6B1D2E]' : 'border-[#EEEEEE] bg-white text-[#7C7C7C]'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="pt-2 border-t border-[#EEEEEE]" />
              <SectionLabel><MapPin size={12} className="inline mr-1" />Billing Address (Bill From on invoices)</SectionLabel>
              <AddressFields
                value={billingAddress}
                onChange={(v) => {
                  setBillingAddress(v);
                  setFieldErrors(prev => ({
                    ...prev,
                    billingAddressLine: '',
                    billingAddressCity: '',
                    billingAddressState: '',
                    billingAddressPincode: '',
                  }));
                }}
                errors={{
                  addressLine: fieldErrors.billingAddressLine,
                  city: fieldErrors.billingAddressCity,
                  state: fieldErrors.billingAddressState,
                  pincode: fieldErrors.billingAddressPincode,
                }}
                fieldPrefix="vendor-billing"
              />
            </div>
          )}

          {/* Step 3 — Address & Operations */}
          {step === 3 && (
            <div className="space-y-4 min-h-[480px]">
              <SectionLabel><MapPin size={12} className="inline mr-1" />Pickup / Warehouse Outlet</SectionLabel>
              <Field label="Outlet name" required hint="e.g. 'Mumbai Warehouse', 'Main Store'" error={fieldErrors.outletName}>
                <Input
                  name="vendor-outlet-name" value={outletName}
                  onChange={(v) => { setOutletName(v); setFieldErrors(prev => ({ ...prev, outletName: '' })); }}
                  hasError={!!fieldErrors.outletName}
                  placeholder="Main Warehouse"
                />
              </Field>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={pickupSameAsBilling}
                  onChange={(e) => {
                    setPickupSameAsBilling(e.target.checked);
                    setFieldErrors(prev => ({
                      ...prev,
                      pickupAddressLine: '',
                      pickupAddressCity: '',
                      pickupAddressState: '',
                      pickupAddressPincode: '',
                    }));
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-[12.5px] text-[#181725]">Pickup address is same as billing address</span>
              </label>
              {!pickupSameAsBilling && (
                <AddressFields
                  value={pickupAddress}
                  onChange={(v) => {
                    setPickupAddress(v);
                    setFieldErrors(prev => ({
                      ...prev,
                      pickupAddressLine: '',
                      pickupAddressCity: '',
                      pickupAddressState: '',
                      pickupAddressPincode: '',
                    }));
                  }}
                  errors={{
                    addressLine: fieldErrors.pickupAddressLine,
                    city: fieldErrors.pickupAddressCity,
                    state: fieldErrors.pickupAddressState,
                    pincode: fieldErrors.pickupAddressPincode,
                  }}
                  fieldPrefix="vendor-pickup"
                />
              )}

              <div className="pt-2 border-t border-[#EEEEEE]" />
              <SectionLabel><Truck size={12} className="inline mr-1" />Operations</SectionLabel>
              <Field label="Serviceable Pincodes" required hint="Press Enter or click + after each 6-digit pincode" error={fieldErrors.serviceablePincodes}>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text" inputMode="numeric"
                    value={pincodeInput}
                    onChange={(e) => setPincodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPincode();
                        setFieldErrors(prev => ({ ...prev, serviceablePincodes: '' }));
                      }
                    }}
                    placeholder="400001"
                    className={`flex-1 h-[40px] border rounded-[10px] px-3 text-[13px] outline-none bg-[#FAFAFA] focus:bg-white transition-all ${
                      fieldErrors.serviceablePincodes
                        ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
                        : 'border-[#EEEEEE] focus:border-[#6B1D2E]/40 focus:ring-2 focus:ring-[#6B1D2E]/10'
                    }`}
                  />
                  <button
                    type="button" onClick={() => {
                      handleAddPincode();
                      setFieldErrors(prev => ({ ...prev, serviceablePincodes: '' }));
                    }}
                    disabled={!PINCODE_RE.test(pincodeInput)}
                    className="h-[40px] px-3 bg-[#6B1D2E] hover:bg-[#5A1926] disabled:bg-gray-300 text-white rounded-[10px] text-[12.5px] font-bold flex items-center gap-1"
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pincodes.length === 0 ? (
                    <p className="text-[11.5px] text-[#AEAEAE] italic">No pincodes added yet</p>
                  ) : pincodes.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1.5 text-[11.5px] font-mono font-bold bg-[#ECFDF5] text-[#6B1D2E] px-2 py-1 rounded-full">
                      {p}
                      <button type="button" onClick={() => handleRemovePincode(p)} className="hover:text-[#181725]">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              </Field>

              <Field label="Delivery Capability" required error={fieldErrors.deliveryCapability}>
                <div className="grid grid-cols-3 gap-2">
                  {DELIVERY_CAPABILITIES.map((d) => (
                    <button
                      key={d} type="button"
                      onClick={() => {
                        setDeliveryCapability(d);
                        setFieldErrors(prev => ({ ...prev, deliveryCapability: '' }));
                      }}
                      className={`p-3 rounded-[10px] text-[12px] font-bold border-2 text-left transition-all
                        ${deliveryCapability === d
                          ? 'border-[#6B1D2E] bg-[#ECFDF5] text-[#6B1D2E]'
                          : fieldErrors.deliveryCapability
                            ? 'border-red-400 bg-white text-[#7C7C7C]'
                            : 'border-[#EEEEEE] bg-white text-[#7C7C7C]'}`}
                    >
                      {DELIVERY_LABEL[d]}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="FSSAI">
                  <Input name="vendor-fssai" value={fssaiNumber} onChange={setFssaiNumber} placeholder="14-digit license" />
                </Field>
                <Field label="Udyam">
                  <Input name="vendor-udyam" value={udyamNumber} onChange={setUdyamNumber} placeholder="UDYAM-XX-00-0000000" />
                </Field>
                <Field label="CIN">
                  <Input name="vendor-cin" value={cinNumber} onChange={setCinNumber} placeholder="CIN" />
                </Field>
              </div>

              <div className="pt-2 border-t border-[#EEEEEE]" />
              <SectionLabel><Building2 size={12} className="inline mr-1" />Storefront (optional)</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min Order Value (₹)">
                  <Input
                    name="vendor-mov" value={minOrderValue}
                    onChange={(v) => { setMinOrderValue(v.replace(/\D/g, '').slice(0, 7)); setFieldErrors(prev => ({ ...prev, minOrderValue: '' })); }}
                    placeholder="500" inputMode="numeric"
                  />
                </Field>
              </div>
              <Field label="Description" hint="Shown on the storefront header">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the vendor…"
                  rows={2}
                  className={textareaClass()}
                />
              </Field>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#F0F0F0] flex items-center justify-between shrink-0 bg-[#FAFAFA] rounded-b-[20px]">
          {step > 1 ? (
            <button
              onClick={handleBack}
              className="h-[40px] px-4 flex items-center gap-1.5 text-[13px] font-bold text-[#7C7C7C] hover:text-[#181725] transition-colors"
            >
              <ChevronLeft size={15} /> Back
            </button>
          ) : <div />}

          {step < 3 ? (
            <button
              onClick={handleNext}
              className={cn(FORM.primaryBtn, 'h-[42px] px-6 text-[13px]')}
            >
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={cn(FORM.primaryBtn, 'h-[42px] px-6 text-[13px]')}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {submitting ? 'Creating vendor…' : 'Create Vendor'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step indicator ──────────────────────────────────────────────────────
function Step({ num, label, current, showConnector }: { num: 1 | 2 | 3; label: string; current: number; showConnector: boolean }) {
  const isActive = num === current;
  const isCompleted = num < current;
  return (
    <>
      <div className="flex items-center gap-2">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300 shrink-0 ${
            isCompleted ? 'bg-gradient-to-r from-[#6B1D2E] to-[#6B1D2E] text-white shadow-md shadow-green-100' :
            isActive    ? 'bg-gradient-to-r from-[#6B1D2E] to-[#6B1D2E] text-white ring-4 ring-[#6B1D2E]/10 shadow-md shadow-green-100' :
                          'bg-[#FAFAFA] border border-[#EEEEEE] text-gray-400'
          }`}
        >
          {isCompleted ? <Check size={12} className="stroke-[3]" /> : num}
        </div>
        <span className={`text-[11.5px] font-extrabold transition-colors duration-300 ${
          isActive || isCompleted ? 'text-gray-800' : 'text-gray-400'
        }`}>
          {label}
        </span>
      </div>
      {showConnector && (
        <div className="flex-1 mx-3 flex items-center">
          <div className={`w-full h-[2px] rounded transition-colors duration-300 ${isCompleted ? 'bg-[#6B1D2E]' : 'bg-[#EEEEEE]'}`} />
        </div>
      )}
    </>
  );
}

// ── Address sub-block ───────────────────────────────────────────────────
function AddressFields({
  value, onChange, fieldPrefix, errors,
}: {
  value: AddressInput;
  onChange: (v: AddressInput) => void;
  fieldPrefix: string;
  errors?: Record<string, string>;
}) {
  const lastFetchedPin = useRef('');

  useEffect(() => {
    const pin = value.pincode;
    if (!/^\d{6}$/.test(pin)) return;
    if (pin === lastFetchedPin.current) return;

    lastFetchedPin.current = pin;
    fetch(`https://api.postalpincode.in/pincode/${pin}`)
      .then((r) => r.json())
      .then((data) => {
        const po = data?.[0]?.PostOffice?.[0];
        if (!po) return;
        onChange({
          ...value,
          city: po.District || po.Division || value.city,
          state: po.State || value.state,
        });
      })
      .catch(() => {});
  }, [value.pincode, value, onChange]);

  const handlePick = (place: import('@/components/ui/AddressAutocomplete').AddressPickPayload) => {
    if (place.pincode) {
      lastFetchedPin.current = place.pincode;
    }
    onChange({
      addressLine: place.fullAddress,
      city: place.city || value.city,
      state: place.state || value.state,
      pincode: place.pincode || value.pincode,
    });
  };

  return (
    <div className="space-y-3">
      <AddressAutocomplete
        label="Search from maps"
        placeholder="Type location, e.g. Vashi Rockville Diner..."
        initialValue={value.addressLine}
        hint="Selecting a place from maps auto-fills address details below."
        onPick={handlePick}
        className="mb-2"
      />
      <Field label="Address line" required error={errors?.addressLine}>
        <Input
          name={`${fieldPrefix}-line`} value={value.addressLine}
          onChange={(v) => onChange({ ...value, addressLine: v })}
          hasError={!!errors?.addressLine}
          placeholder="Plot 22, MIDC Phase II"
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="City" required error={errors?.city}>
          <Input
            name={`${fieldPrefix}-city`} value={value.city}
            onChange={(v) => onChange({ ...value, city: v })}
            hasError={!!errors?.city}
            placeholder="Mumbai"
          />
        </Field>
        <Field label="State" required error={errors?.state}>
          <Input
            name={`${fieldPrefix}-state`} value={value.state}
            onChange={(v) => onChange({ ...value, state: v })}
            hasError={!!errors?.state}
            placeholder="Maharashtra"
          />
        </Field>
        <Field label="Pincode" required error={errors?.pincode}>
          <Input
            name={`${fieldPrefix}-pin`} value={value.pincode}
            onChange={(v) => onChange({ ...value, pincode: v.replace(/\D/g, '').slice(0, 6) })}
            hasError={!!errors?.pincode}
            placeholder="400001" inputMode="numeric"
          />
        </Field>
      </div>
    </div>
  );
}

// ── Primitives ──────────────────────────────────────────────────────────
// Field + SectionLabel come from the shared form module (imported above).
// Local Input is a thin wrapper that keeps autoComplete defaulting to 'off'
// (admin creates vendors on the vendor's behalf — browser autofill would
// otherwise pollute the fields).
function Input({
  value, onChange, type = 'text', placeholder, name, inputMode, autoComplete, hasError, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  name?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  autoComplete?: string;
  hasError?: boolean;
  disabled?: boolean;
}) {
  return (
    <FormInput
      value={value} onChange={onChange} hasError={hasError}
      type={type} placeholder={placeholder} name={name}
      inputMode={inputMode} autoComplete={autoComplete ?? 'off'} disabled={disabled}
    />
  );
}
