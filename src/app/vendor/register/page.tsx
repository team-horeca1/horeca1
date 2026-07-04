'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, Phone, Building2, FileText, Landmark,
  MapPin, Truck, ShieldCheck, X, Plus, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { FORM, FormField as Field, FormInput, inputClass, selectClass } from '@/components/ui/form';
import {
  VendorProfileForm,
  type VendorProfileValues,
} from '@/components/features/vendor/VendorProfileForm';
import { EMPTY_VENDOR_PROFILE } from '@/components/features/vendor/vendorProfileDefaults';
import {
  validateVendorProfile,
  validateFieldBlur as validateVendorFieldBlur,
  derivedLegalName,
  derivedTradeName,
  derivedFullName,
  derivedAuthorizedPersonName,
  resolveVendorTypeSlug,
  type VendorProfileInput,
} from '@/lib/validators/vendor-profile';
import { ExistingPhoneModal } from '@/components/auth/ExistingPhoneModal';
import { accountLabelFromCheck } from '@/lib/auth/phoneCheckLabels';
import type { PhoneCheckResult } from '@/lib/auth/checkPhoneLookup';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import { getEffectiveVendorTypeSelections } from '@/lib/validators/vendor-profile';

const EMAIL_REGISTER_ALLOWED = isRegisterEmailOtpEnabled();

const STEP_TITLES = [
  { id: 1, label: EMAIL_REGISTER_ALLOWED ? 'Verify Contact' : 'Verify Mobile', icon: Phone },
  { id: 2, label: 'Business Profile', icon: Building2 },
  { id: 3, label: 'Contact & Ops', icon: FileText },
  { id: 4, label: 'GST & PAN', icon: FileText },
  { id: 5, label: 'Bank Details', icon: Landmark },
  { id: 6, label: 'Addresses', icon: MapPin },
  { id: 7, label: 'Service & KYC', icon: ShieldCheck },
];

// CSV-aligned vendor types are defined in VendorProfileForm / vendor-kyc VENDOR_TYPES.

const PHONE_RE = /^\d{10}$/;
const PINCODE_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// ─── Per-field validators ─────────────────────────────────────────────────
// Returns an error message for an invalid value, or '' for valid.
// `optional` skips validation when the value is blank; required fields use
// `mustExist` to surface the "is required" error on blur.
const V = {
  required: (v: string, label: string) => v.trim() ? '' : `${label} is required`,
  minLen:   (v: string, label: string, n: number) => v.trim().length < n ? `${label} must be at least ${n} characters` : '',
  email:    (v: string) => !v.trim() ? '' : EMAIL_RE.test(v.trim()) ? '' : 'Enter a valid email address',
  phone10:  (v: string) => PHONE_RE.test(v) ? '' : 'Enter a valid 10-digit number',
  pincode:  (v: string) => PINCODE_RE.test(v) ? '' : 'Pincode must be 6 digits',
  gst:      (v: string) => GST_RE.test(v.toUpperCase()) ? '' : 'Format: 22ABCDE1234F1Z5',
  pan:      (v: string) => PAN_RE.test(v.toUpperCase()) ? '' : 'Format: ABCDE1234F',
  ifsc:     (v: string) => IFSC_RE.test(v.toUpperCase()) ? '' : 'Format: HDFC0001234',
  password: (v: string) => !v ? '' : v.length < 6 ? 'Password must be at least 6 characters' : '',
};

type Address = { addressLine: string; city: string; state: string; pincode: string };

const blankAddress = (): Address => ({ addressLine: '', city: '', state: '', pincode: '' });

const RESEND_COOLDOWN = 60;

type ApiErrorPayload = {
  message?: string;
  details?: {
    issues?: Array<{ path: string; message: string }>;
    fields?: Record<string, unknown>;
  };
};

/** Map API field path → wizard step (2–7). */
function stepForApiField(path: string): number {
  const f = path.toLowerCase();
  if (/vendortype|subtype|categor|businesssize|coverage|warehouse|fleet|monthlysupply/.test(f)) return 2;
  if (/authorized|password/.test(f) || f === 'email' || f.endsWith('.email')) return 3;
  if (/gst|pan/.test(f)) return 4;
  if (/bank/.test(f)) return 5;
  if (/billing|pickup|primaryoutlet|addressline/.test(f)) return 6;
  if (/pincode|serviceable|delivery|fssai|udyam|cin/.test(f)) return 7;
  if (f === 'legalname' || f === 'displayname') return 2;
  return 3;
}

/** Map API path → inline form field key used by VendorProfileForm / step validators. */
function formFieldKeyFromApiPath(path: string): string {
  const stripped = path.replace(/^vendorDetails\./, '');
  const nestedMap: Record<string, string> = {
    'billingAddress.addressLine': 'billingAddressLine',
    'billingAddress.city': 'billingCity',
    'billingAddress.state': 'billingState',
    'billingAddress.pincode': 'billingPincode',
    'primaryOutlet.addressLine': 'pickupAddressLine',
    'primaryOutlet.city': 'pickupCity',
    'primaryOutlet.state': 'pickupState',
    'primaryOutlet.pincode': 'pickupPincode',
    'primaryOutlet.name': 'tradeName',
    gstin: 'gstNumber',
    pan: 'panNumber',
  };
  if (nestedMap[stripped]) return nestedMap[stripped];
  return stripped.replace(/\./g, '');
}

function inferStepFromMessage(message: string): number | null {
  const m = message.toLowerCase();
  if (m.includes('vendor type') || m.includes('sub-type')) return 2;
  if (m.includes('phone') || m.includes('email') || m.includes('password') || m.includes('authorized')) return 3;
  if (m.includes('gst') || m.includes('pan')) return 4;
  if (m.includes('bank') || m.includes('ifsc')) return 5;
  if (m.includes('address') || m.includes('pickup') || m.includes('billing')) return 6;
  if (m.includes('pincode') || m.includes('delivery') || m.includes('serviceable')) return 7;
  return null;
}

export default function VendorRegisterPage() {
  const router = useRouter();
  // Auth-aware mode: when a user is already signed in, the wizard runs in
  // "add a vendor under my existing HCID" mode instead of "new public
  // signup" mode. This skips step 1 (OTP — the user is already
  // authenticated) and routes the final submit to /api/v1/account so the
  // new vendor lives under their existing User record. Session is read once
  // when the wizard mounts; we don't react to mid-flow auth changes.
  const { data: session, status: sessionStatus } = useSession();
  const isAuthMode = sessionStatus === 'authenticated';
  const { switchAccount } = useBusinessAccountSwitcher();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<{ hcid: string } | null>(null);

  // Step 1 — phone verify
  const [phone, setPhone] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifyChannel, setVerifyChannel] = useState<'phone' | 'email'>('phone');
  const [registerEmail, setRegisterEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  // Step 2–3 — mastersheet profile (VendorProfileForm)
  const [vendorProfile, setVendorProfile] = useState<VendorProfileValues>({ ...EMPTY_VENDOR_PROFILE });

  // Legacy step 3 fields kept for submit compatibility (synced from vendorProfile)
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authorizedPersonName, setAuthorizedPersonName] = useState('');
  const [authorizedPersonPhone, setAuthorizedPersonPhone] = useState('');
  const [authorizedPersonEmail, setAuthorizedPersonEmail] = useState('');

  // Step 4
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [panFile, setPanFile] = useState<File | null>(null);
  const [gstFile, setGstFile] = useState<File | null>(null);

  // Step 5
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountType, setBankAccountType] = useState<'savings' | 'current'>('current');
  const [chequeFile, setChequeFile] = useState<File | null>(null);

  // Step 6
  const [billingAddress, setBillingAddress] = useState<Address>(blankAddress());
  const [pickupAddress, setPickupAddress] = useState<Address>(blankAddress());
  const [pickupSameAsBilling, setPickupSameAsBilling] = useState(false);

  // Step 7
  const [pincodes, setPincodes] = useState<string[]>([]);
  const [pincodeInput, setPincodeInput] = useState('');
  const [deliveryCapability, setDeliveryCapability] = useState<'own_fleet' | 'third_party' | 'both' | ''>('');
  const [fssaiNumber, setFssaiNumber] = useState('');
  const [udyamNumber, setUdyamNumber] = useState('');
  const [cinNumber, setCinNumber] = useState('');

  const [existingPhoneModal, setExistingPhoneModal] = useState<{
    phone: string;
    hcidDisplay?: string;
    accountLabel: string;
    suggestedAction: 'login_to_link' | 'login_only';
    contactType?: 'phone' | 'email';
  } | null>(null);

  const getMergedVendorProfile = useCallback((): VendorProfileInput => ({
    ...vendorProfile,
    fullName: fullName || derivedFullName(vendorProfile),
    email,
    password,
    phone,
    mobilePhone: phone,
    authorizedPersonPhone: vendorProfile.authorizedPersonPhone || authorizedPersonPhone || phone,
    authorizedPersonEmail: vendorProfile.authorizedPersonEmail || authorizedPersonEmail,
    authorizedPersonName: vendorProfile.authorizedPersonName || authorizedPersonName,
    legalName: derivedLegalName(vendorProfile) || businessName,
    businessName: derivedLegalName(vendorProfile) || businessName,
    tradeName: derivedTradeName(vendorProfile) || tradeName,
    displayName: derivedTradeName(vendorProfile) || tradeName,
  }), [
    vendorProfile, fullName, email, password, phone, authorizedPersonPhone,
    authorizedPersonEmail, authorizedPersonName, businessName, tradeName,
  ]);

  const getEffectivePickup = useCallback(
    (): Address => (pickupSameAsBilling ? billingAddress : pickupAddress),
    [pickupSameAsBilling, billingAddress, pickupAddress],
  );

  // ─── Auth-mode seeding ──────────────────────────────────────────────────
  // When the user is already logged in we fetch their existing phone +
  // fullName from /api/v1/auth/me (the session payload doesn't carry phone),
  // mark the OTP step as already done, and jump straight to step 2. Runs
  // exactly once when sessionStatus flips to 'authenticated'.
  const authSeedDone = useRef(false);
  useEffect(() => {
    if (!isAuthMode || authSeedDone.current) return;
    authSeedDone.current = true;
    // An authenticated user adding a vendor under their existing HCID is
    // already phone-verified — the OTP step doesn't apply. Advance past it
    // SYNCHRONOUSLY here (not inside the fetch .then). The previous version
    // set this dedupe ref before an async fetch and only called setStep(2) in
    // the resolved callback; under React 18 StrictMode's double-invoke (dev),
    // the first run's cleanup flagged the result `cancelled` and the second
    // run bailed on the ref — so the jump was silently dropped and the wizard
    // stayed stuck on step 1.
    setPhoneVerified(true);
    setOtpSent(true);
    setStep(2);
    // Best-effort prefill of known details. Functional updaters avoid
    // clobbering anything the user may have already typed on a later step
    // while this request was in flight. Submit in auth mode uses the session,
    // not this phone, so failure here is harmless.
    fetch('/api/v1/auth/me').then(r => r.json()).then(j => {
      if (!j.success) return;
      const me = j.data ?? {};
      if (me.phone) setPhone(prev => prev || String(me.phone));
      if (me.fullName) setFullName(prev => prev || String(me.fullName));
      if (me.email) setEmail(prev => prev || String(me.email));
    }).catch(() => { /* prefill is optional */ });
  }, [isAuthMode]);

  // ─── Inline field errors ────────────────────────────────────────────────
  // Set by onBlur on each input. Continue button reads these to block
  // forward navigation when the current step has any active error.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const setFE = useCallback((key: string, msg: string) => {
    setFieldErrors(prev => {
      if (msg && prev[key] === msg) return prev;
      if (!msg && !prev[key]) return prev;
      const next = { ...prev };
      if (msg) next[key] = msg; else delete next[key];
      return next;
    });
  }, []);

  // Run all validators for the active step. Returns true if any field in the
  // step is invalid OR a required field hasn't been touched yet.
  const validateAllForStep = useCallback((s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 3) {
      const merged = getMergedVendorProfile();
      const v = validateVendorProfile(merged, 'selfRegister', 'contact');
      Object.assign(e, v.errors);
      if (isAuthMode && e.password) delete e.password;
    } else if (s === 4) {
      if (gstNumber.trim()) {
        const x = V.gst(gstNumber); if (x) e.gstNumber = x;
      }
      if (panNumber.trim()) {
        const x = V.pan(panNumber); if (x) e.panNumber = x;
      }
    } else if (s === 5) {
      const x = V.minLen(bankAccountName, 'Account holder name', 2); if (x) e.bankAccountName = x;
      if (bankAccountNumber.trim().length < 8) e.bankAccountNumber = 'Enter a valid account number';
      const x3 = V.ifsc(bankIfsc); if (x3) e.bankIfsc = x3;
      const x4 = V.minLen(bankName, 'Bank name', 2); if (x4) e.bankName = x4;
    } else if (s === 6) {
      const effectivePickup = pickupSameAsBilling ? billingAddress : pickupAddress;
      const check = (a: Address, prefix: string) => {
        if (a.addressLine.trim().length < 5) e[`${prefix}AddressLine`] = 'Enter the full address';
        if (!a.city.trim()) e[`${prefix}City`] = 'City is required';
        if (!a.state.trim()) e[`${prefix}State`] = 'State is required';
        const p = V.pincode(a.pincode); if (p) e[`${prefix}Pincode`] = p;
      };
      check(billingAddress, 'billing');
      check(effectivePickup, 'pickup');
    }
    return e;
  }, [
    getMergedVendorProfile, isAuthMode, gstNumber, panNumber,
    bankAccountName, bankAccountNumber, bankIfsc, bankName,
    billingAddress, pickupAddress, pickupSameAsBilling,
  ]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startResendTimer = useCallback(() => {
    setResendTimer(RESEND_COOLDOWN);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(prev => { if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; } return prev - 1; });
    }, 1000);
  }, []);

  const openExistingPhoneModal = (
    contact: string,
    data: PhoneCheckResult,
    contactType: 'phone' | 'email' = 'phone',
  ) => {
    setExistingPhoneModal({
      phone: contact,
      hcidDisplay: data.hcidDisplay,
      accountLabel: accountLabelFromCheck(data),
      suggestedAction: data.suggestedAction === 'login_only' ? 'login_only' : 'login_to_link',
      contactType,
    });
  };

  // ─── Step 1: Phone or email OTP ─────────────────────────────────────────
  const resetOtpState = () => {
    setOtpSent(false);
    setPhoneVerified(false);
    setEmailVerified(false);
    setOtpDigits(['', '', '', '']);
  };

  const handleSendOtp = async () => {
    setError('');
    const useEmail = EMAIL_REGISTER_ALLOWED && verifyChannel === 'email';
    if (useEmail) {
      if (!EMAIL_RE.test(registerEmail.trim())) {
        setError('Enter a valid email address');
        return;
      }
    } else if (!PHONE_RE.test(phone)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setOtpLoading(true);
    try {
      if (!isAuthMode) {
        if (useEmail) {
          const checkRes = await fetch('/api/v1/auth/check-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: registerEmail.trim().toLowerCase(), intent: 'vendor' }),
          });
          const checkData = await checkRes.json();
          if (checkData.success && checkData.data?.exists) {
            openExistingPhoneModal(registerEmail.trim().toLowerCase(), checkData.data as PhoneCheckResult, 'email');
            return;
          }
        } else {
          const checkRes = await fetch('/api/v1/auth/check-phone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, intent: 'vendor' }),
          });
          const checkData = await checkRes.json();
          if (checkData.success && checkData.data?.exists) {
            openExistingPhoneModal(phone, checkData.data as PhoneCheckResult, 'phone');
            return;
          }
        }
      }

      const res = await fetch('/api/v1/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          useEmail
            ? { email: registerEmail.trim().toLowerCase(), mode: 'register', intent: 'vendor' }
            : { phone, mode: 'register', intent: 'vendor' },
        ),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.code === 'EMAIL_EXISTS' && data.data) {
          openExistingPhoneModal(registerEmail.trim().toLowerCase(), data.data as PhoneCheckResult, 'email');
          return;
        }
        setError(data.error || 'Failed to send OTP');
        return;
      }
      setOtpSent(true);
      startResendTimer();
      setTimeout(() => otpRefs[0].current?.focus(), 80);
    } catch { setError('Failed to send OTP. Please try again.'); }
    finally { setOtpLoading(false); }
  };

  const handleVerifyOtp = async (code: string) => {
    if (code.length !== 4) return;
    setError('');
    setOtpLoading(true);
    const useEmail = EMAIL_REGISTER_ALLOWED && verifyChannel === 'email';
    try {
      const res = await fetch('/api/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          useEmail
            ? { email: registerEmail.trim().toLowerCase(), code }
            : { phone, code },
        ),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Invalid or expired OTP');
        setOtpDigits(['', '', '', '']);
        setTimeout(() => otpRefs[0].current?.focus(), 50);
        return;
      }
      if (useEmail) {
        const verified = registerEmail.trim().toLowerCase();
        setEmailVerified(true);
        setEmail(verified);
        setAuthorizedPersonEmail(verified);
      } else {
        setPhoneVerified(true);
      }
      setStep(2);
    } catch { setError('Verification failed. Please try again.'); }
    finally { setOtpLoading(false); }
  };

  const handleOtpInput = (i: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      const next = ['', '', '', ''];
      for (let j = 0; j < digits.length; j++) next[j] = digits[j];
      setOtpDigits(next);
      otpRefs[Math.min(digits.length, 3)]?.current?.focus();
      if (digits.length === 4) handleVerifyOtp(digits);
      return;
    }
    const digit = value.replace(/\D/g, '');
    const next = [...otpDigits];
    next[i] = digit;
    setOtpDigits(next);
    if (digit && i < 3) otpRefs[i + 1].current?.focus();
    if (digit && next.every(d => d)) handleVerifyOtp(next.join(''));
  };

  // ─── Pincode chip input ─────────────────────────────────────────────────
  const addPincode = () => {
    const p = pincodeInput.trim();
    if (!PINCODE_RE.test(p)) { setError('Pincode must be 6 digits'); return; }
    if (pincodes.includes(p)) { setPincodeInput(''); return; }
    setPincodes([...pincodes, p]);
    setPincodeInput('');
    setError('');
  };
  const removePincode = (p: string) => setPincodes(pincodes.filter(x => x !== p));

  // ─── Pickup same as billing ─────────────────────────────────────────────
  useEffect(() => {
    if (pickupSameAsBilling) setPickupAddress({ ...billingAddress });
  }, [pickupSameAsBilling, billingAddress]);

  const lastFetchedBillingPin = useRef('');
  const lastFetchedPickupPin = useRef('');

  // Auto-fill billing city & state when a valid 6-digit pincode is typed manually
  useEffect(() => {
    const pin = billingAddress.pincode;
    if (!/^\d{6}$/.test(pin)) return;
    if (pin === lastFetchedBillingPin.current) return;

    lastFetchedBillingPin.current = pin;
    fetch(`https://api.postalpincode.in/pincode/${pin}`)
      .then((r) => r.json())
      .then((data) => {
        const po = data?.[0]?.PostOffice?.[0];
        if (!po) return;
        setBillingAddress(prev => ({
          ...prev,
          city: po.District || po.Division || prev.city,
          state: po.State || prev.state,
        }));
      })
      .catch(() => {});
  }, [billingAddress.pincode]);

  // Auto-fill pickup city & state when a valid 6-digit pincode is typed manually
  useEffect(() => {
    if (pickupSameAsBilling) return;
    const pin = pickupAddress.pincode;
    if (!/^\d{6}$/.test(pin)) return;
    if (pin === lastFetchedPickupPin.current) return;

    lastFetchedPickupPin.current = pin;
    fetch(`https://api.postalpincode.in/pincode/${pin}`)
      .then((r) => r.json())
      .then((data) => {
        const po = data?.[0]?.PostOffice?.[0];
        if (!po) return;
        setPickupAddress(prev => ({
          ...prev,
          city: po.District || po.Division || prev.city,
          state: po.State || prev.state,
        }));
      })
      .catch(() => {});
  }, [pickupAddress.pincode, pickupSameAsBilling]);

  // ─── Validation per step ────────────────────────────────────────────────
  // Each input also runs validators on blur via setFE() so the user sees
  // errors inline as they go. This function is the final gate Continue
  // calls — it re-runs the validators for the active step, flushes any
  // missed errors into fieldErrors, and returns a single banner-level
  // message when the step can't advance.
  const validateStepAt = useCallback((s: number): string | null => {
    if (s === 1) {
      if (phoneVerified || emailVerified) return null;
      return EMAIL_REGISTER_ALLOWED
        ? 'Please verify your mobile number or email first'
        : 'Please verify your mobile number first';
    }
    if (s === 2) {
      const v = validateVendorProfile(getMergedVendorProfile(), 'selfRegister', 'identity');
      if (!v.success) {
        setFieldErrors(v.errors);
        return v.message ?? 'Please fix the highlighted fields before continuing';
      }
      return null;
    }
    if (s === 3) {
      const v = validateVendorProfile(getMergedVendorProfile(), 'selfRegister', 'contact');
      const errors = { ...v.errors };
      if (isAuthMode) delete errors.password;
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return v.message ?? 'Please fix the highlighted fields before continuing';
      }
      return null;
    }
    if (s === 7) {
      if (pincodes.length === 0) return 'Add at least one serviceable pincode';
      if (!deliveryCapability) return 'Select your delivery capability';
      return null;
    }
    const stepErrors = validateAllForStep(s);
    if (Object.keys(stepErrors).length > 0) {
      setFieldErrors(prev => ({ ...prev, ...stepErrors }));
      return 'Please fix the highlighted fields before continuing';
    }
    return null;
  }, [
    phoneVerified, emailVerified, getMergedVendorProfile, isAuthMode, validateAllForStep,
    pincodes.length, deliveryCapability,
  ]);

  const validateStepsRange = useCallback((from: number, to: number): { ok: true } | { ok: false; step: number; message: string } => {
    for (let s = from; s <= to; s++) {
      const err = validateStepAt(s);
      if (err) return { ok: false, step: s, message: err };
    }
    return { ok: true };
  }, [validateStepAt]);

  const validateStep = (s: number): string | null => validateStepAt(s);

  const handleNext = () => {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError('');
    if (step < 7) setStep(step + 1);
    else handleSubmit();
  };

  const handleBack = () => {
    setError('');
    // In auth mode the OTP step is bypassed entirely — clamping at step 2
    // keeps the user from accidentally falling onto a Verify Mobile screen
    // that doesn't apply to them.
    const floor = isAuthMode ? 2 : 1;
    if (step > floor) setStep(step - 1);
  };

  // ─── Final submit ───────────────────────────────────────────────────────
  // Two branches:
  //   • Public mode (no session)   → POST /api/v1/vendor/onboarding/submit,
  //                                  sign out, redirect to /login?phone=
  //   • Auth mode (logged in user) → POST /api/v1/account with vendorDetails
  //                                  block, switch session to the new
  //                                  business account, redirect to dashboard
  // Staged KYC files (PAN / GST cert / cancelled cheque) are uploaded AFTER the
  // vendor row exists. Public applicants have no session yet, so they POST to
  // the OTP-gated onboarding endpoint with their vendorId + phone; logged-in
  // applicants use the authenticated endpoint once their new account is active.
  // Uploads are best-effort (allSettled) — docs are optional and can be
  // re-uploaded later in vendor settings, so a failed file never blocks signup.
  const stagedDocs = (): Array<{ type: string; file: File }> =>
    ([
      { type: 'pan', file: panFile },
      { type: 'gst', file: gstFile },
      { type: 'bank_proof', file: chequeFile },
    ].filter((d) => d.file) as Array<{ type: string; file: File }>);

  const uploadOnboardingDocs = async (vendorId: string) => {
    await Promise.allSettled(
      stagedDocs().map(({ type, file }) => {
        const fd = new FormData();
        fd.append('phone', phone);
        fd.append('vendorId', vendorId);
        fd.append('type', type);
        fd.append('file', file);
        return fetch('/api/v1/vendor/onboarding/documents', { method: 'POST', body: fd });
      }),
    );
  };

  const uploadAuthedDocs = async () => {
    await Promise.allSettled(
      stagedDocs().map(({ type, file }) => {
        const fd = new FormData();
        fd.append('type', type);
        fd.append('file', file);
        return fetch('/api/v1/vendor/documents/upload', { method: 'POST', body: fd });
      }),
    );
  };

  const applySubmitError = useCallback((apiErr: ApiErrorPayload | string | undefined) => {
    const message = typeof apiErr === 'string'
      ? apiErr
      : apiErr?.message || 'Failed to submit. Please check the highlighted fields.';
    setError(message);

    const issues = typeof apiErr === 'object' ? apiErr?.details?.issues : undefined;
    const formErrors: Record<string, string> = {};

    if (issues?.length) {
      for (const issue of issues) {
        formErrors[formFieldKeyFromApiPath(issue.path)] = issue.message;
      }
      setFieldErrors(prev => ({ ...prev, ...formErrors }));
      setStep(stepForApiField(issues[0].path));
      return;
    }

    const hinted = inferStepFromMessage(message);
    if (hinted) setStep(hinted);
  }, []);

  const resolveTypeSlug = useCallback((profile: VendorProfileValues) => {
    const selections = getEffectiveVendorTypeSelections(profile);
    return resolveVendorTypeSlug(profile) ?? selections[0]?.slug ?? 'distributor';
  }, []);

  const handleSubmit = async () => {
    setError('');
    const range = validateStepsRange(2, 7);
    if (!range.ok) {
      setStep(range.step);
      setError(range.message);
      return;
    }

    setSubmitting(true);
    const effectivePickup = getEffectivePickup();
    try {
      if (isAuthMode) {
        // ── AUTH MODE: add a vendor under existing HCID ───────────────────
        const typeSlug = resolveTypeSlug(vendorProfile);
        const merged = getMergedVendorProfile();
        const authPhone = (merged.authorizedPersonPhone ?? '').replace(/\D/g, '').slice(-10);
        const authEmail = (merged.authorizedPersonEmail ?? merged.email ?? '').trim().toLowerCase();
        const body = {
          legalName: derivedLegalName(vendorProfile) || businessName.trim(),
          displayName: derivedTradeName(vendorProfile) || tradeName.trim(),
          gstin: (gstNumber || vendorProfile.gstin || '').toUpperCase().trim(),
          pan: (panNumber || vendorProfile.pan || '').toUpperCase().trim(),
          businessType: vendorProfile.vendorBusinessType || 'vendor',
          subType: vendorProfile.subType,
          isCustomer: true,
          isVendor: true,
          isBrand: false,
          primaryOutlet: {
            name: derivedTradeName(vendorProfile) || tradeName.trim() || businessName.trim(),
            addressLine: effectivePickup.addressLine,
            city: effectivePickup.city,
            state: effectivePickup.state,
            pincode: effectivePickup.pincode,
          },
          vendorDetails: {
            vendorType: typeSlug,
            subType: vendorProfile.subType,
            vendorTypeSelections: getEffectiveVendorTypeSelections(vendorProfile),
            categoriesHandled: vendorProfile.categoriesHandled,
            businessSize: vendorProfile.businessSize,
            coverage: vendorProfile.coverage,
            warehouseCount: vendorProfile.warehouseCount,
            deliveryFleet: vendorProfile.deliveryFleet,
            monthlySupplyBand: vendorProfile.monthlySupplyBand,
            panNumber: (panNumber || vendorProfile.pan || '').toUpperCase().trim(),
            authorizedPersonName: derivedAuthorizedPersonName(vendorProfile),
            authorizedPersonPhone: authPhone.length === 10 ? authPhone : '',
            authorizedPersonEmail: authEmail || '',
            billingAddress,
            bankAccountName: bankAccountName.trim(),
            bankAccountNumber: bankAccountNumber.trim(),
            bankIfsc: bankIfsc.toUpperCase().trim(),
            bankName: bankName.trim(),
            bankAccountType,
            serviceablePincodes: pincodes,
            deliveryCapability,
            fssaiNumber: fssaiNumber.trim(),
            udyamNumber: udyamNumber.trim(),
            cinNumber: cinNumber.trim(),
          },
        };
        const res = await fetch('/api/v1/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!data.success) {
          applySubmitError(data.error);
          return;
        }
        // Switch session context to the new business account so the vendor
        // dashboard resolves to THIS vendor and not the user's old one.
        try {
          await switchAccount(data.data.account.id, data.data.outlet.id);
        } catch { /* non-fatal — user can switch manually */ }
        // New account is now active — attach any KYC files the user picked.
        await uploadAuthedDocs();
        setSubmitted({ hcid: '' });
        // Redirect after a brief moment so the success screen is visible.
        setTimeout(() => { window.location.assign('/vendor/dashboard'); }, 1200);
        return;
      }

      // ── PUBLIC MODE: brand-new user signup ──────────────────────────────
      const legal = derivedLegalName(vendorProfile) || businessName.trim();
      const trade = derivedTradeName(vendorProfile) || tradeName.trim();
      const ownerName = fullName.trim() || derivedFullName(vendorProfile);
      const authName = derivedAuthorizedPersonName(vendorProfile);
      const typeSlug = resolveTypeSlug(vendorProfile);
      const typeSelections = getEffectiveVendorTypeSelections(vendorProfile);
      const merged = getMergedVendorProfile();
      const authPhone = (merged.authorizedPersonPhone ?? '').replace(/\D/g, '').slice(-10);
      const authEmail = (merged.authorizedPersonEmail ?? merged.email ?? registerEmail).trim().toLowerCase();
      const body = {
        phone: phoneVerified ? phone : '',
        verifiedEmail: emailVerified ? registerEmail.trim().toLowerCase() : '',
        vendorType: typeSlug,
        vendorBusinessType: vendorProfile.vendorBusinessType,
        vendorTypeSelections: typeSelections,
        subType: vendorProfile.subType,
        categoriesHandled: vendorProfile.categoriesHandled,
        businessSize: vendorProfile.businessSize,
        coverage: vendorProfile.coverage,
        warehouseCount: vendorProfile.warehouseCount,
        deliveryFleet: vendorProfile.deliveryFleet,
        monthlySupplyBand: vendorProfile.monthlySupplyBand,
        fullName: ownerName,
        businessName: legal,
        tradeName: trade,
        email: (email || vendorProfile.email || '').trim().toLowerCase(),
        password: password || vendorProfile.password,
        authorizedPersonName: authName,
        authorizedPersonPhone: authPhone.length === 10 ? authPhone : '',
        authorizedPersonEmail: authEmail || '',
        gstNumber: (gstNumber || vendorProfile.gstin || vendorProfile.gstNumber || '').toUpperCase().trim(),
        panNumber: (panNumber || vendorProfile.pan || vendorProfile.panNumber || '').toUpperCase().trim(),
        salutation: vendorProfile.salutation || null,
        firstName: vendorProfile.firstName || null,
        lastName: vendorProfile.lastName || null,
        designation: vendorProfile.designation || null,
        fssaiNumber: (fssaiNumber || vendorProfile.fssaiNumber || '').trim(),
        bankAccountName: bankAccountName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        bankIfsc: bankIfsc.toUpperCase().trim(),
        bankName: bankName.trim(),
        bankAccountType,
        billingAddress,
        pickupAddress: effectivePickup,
        serviceablePincodes: pincodes,
        deliveryCapability,
        udyamNumber: udyamNumber.trim(),
        cinNumber: cinNumber.trim(),
      };
      const res = await fetch('/api/v1/vendor/onboarding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        applySubmitError(data.error);
        return;
      }
      // Vendor row now exists — attach staged KYC files via the OTP-gated
      // onboarding endpoint BEFORE we sign out (the used OTP is still valid).
      if (data.data?.vendorId) {
        await uploadOnboardingDocs(data.data.vendorId);
      }
      // Sign out whatever session was active before the user opened the
      // wizard — otherwise /profile and the navbar still show the OLD
      // account they were logged into. Also clears any leftover admin
      // impersonation cookies for good measure.
      try {
        await Promise.all([
          fetch('/api/v1/admin/impersonate', { method: 'DELETE' }).catch(() => {}),
          fetch('/api/v1/admin/impersonate/brand', { method: 'DELETE' }).catch(() => {}),
        ]);
        await signOut({ redirect: false });
      } catch { /* non-fatal */ }
      setSubmitted({ hcid: data.data?.hcidDisplay ?? '' });
    } catch (err) {
      applySubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    }
    finally { setSubmitting(false); }
  };

  // While the session is resolving we don't yet know whether this is the
  // public signup flow or the "add a vendor under my HCID" flow. Hold the
  // wizard behind a loader so an authenticated user never flashes the
  // Verify-Mobile step before the auth-seed effect jumps them to step 2.
  // Guard on !session: only the genuine initial load should hold the wizard
  // behind a loader. A background session revalidation (window-focus refetch)
  // briefly flips status to 'loading' while session stays populated — without
  // this guard it would unmount the whole multi-step form and wipe everything
  // the applicant has typed so far.
  if (sessionStatus === 'loading' && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#299E60]" />
      </div>
    );
  }

  // ─── SUCCESS SCREEN ─────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={48} className="text-[#299E60]" />
          </div>
          <h1 className="text-[24px] font-[800] text-gray-800 mb-3">Application Submitted</h1>
          <p className="text-[14px] text-gray-500 mb-6 leading-relaxed">
            {isAuthMode
              ? 'Your new vendor business is created and under review. Switching you to the new account now…'
              : 'Thank you for applying! Your vendor account is under review. Log in below to track your application status — our team will verify your KYC documents and contact you shortly.'}
          </p>
          {submitted.hcid && !isAuthMode && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-6">
              <p className="text-[12px] text-gray-400 mb-1">Your HCID</p>
              <p className="text-[16px] font-bold text-gray-800 tracking-wider">{submitted.hcid}</p>
            </div>
          )}
          {isAuthMode ? (
            <div className="flex items-center justify-center gap-2 text-[13px] text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              Redirecting to your vendor dashboard…
            </div>
          ) : (
            <>
              <button
                onClick={() => router.push(
                  emailVerified
                    ? `/login?email=${encodeURIComponent(registerEmail.trim().toLowerCase())}`
                    : `/login?phone=${encodeURIComponent(phone)}`,
                )}
                className={cn(FORM.primaryBtn, 'w-full py-3')}
              >
                Continue to log in
              </button>
              <button
                onClick={() => router.push('/')}
                className="w-full mt-2 text-[13px] text-gray-400 font-bold hover:text-gray-600 transition-colors py-2"
              >
                Back to home
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── WIZARD ─────────────────────────────────────────────────────────────
  const progress = ((step - 1) / 6) * 100;

  return (
    <div className="flex flex-col">
      {/* Header — strong, branded onboarding banner */}
      <div className="bg-gradient-to-r from-[#53B175] to-[#299E60] px-4 md:px-10 py-5 md:py-7 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] md:text-[12px] font-bold uppercase tracking-[0.18em] text-white/70 mb-1">
              {isAuthMode ? 'Add Vendor Business' : 'Vendor Application'}
            </p>
            <h1 className="text-[20px] md:text-[26px] font-[900] text-white leading-tight">
              {isAuthMode ? 'Register a new vendor under your HCID' : 'Become a Horeca1 Vendor'}
            </h1>
            <p className="text-[12px] md:text-[13px] text-white/80 mt-1">
              {isAuthMode
                ? 'Complete the KYC below — our team reviews within 24 hours.'
                : 'Complete 7 quick steps — our team reviews within 24 hours.'}
            </p>
          </div>
          <button onClick={() => router.push('/')}
            className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-full px-3 py-1.5 transition-colors">
            Exit <X size={14} />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white px-4 md:px-8 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-bold text-gray-600">Step {step} of 7</span>
            <span className="text-[12px] font-bold text-[#299E60]">{Math.round(progress)}% complete</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#299E60] transition-all duration-300" style={{ width: `${progress + (100 / 7)}%` }} />
          </div>
          <div className="mt-3 hidden md:flex items-center justify-between">
            {STEP_TITLES.map((s) => {
              const done = s.id < step;
              const active = s.id === step;
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex flex-col items-center text-center flex-1">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors',
                    done ? 'bg-[#299E60] text-white' :
                    active ? 'bg-[#299E60]/10 text-[#299E60] ring-2 ring-[#299E60]' :
                    'bg-gray-100 text-gray-400',
                  )}>
                    {done ? <CheckCircle2 size={16} /> : <Icon size={14} />}
                  </div>
                  <span className={cn('mt-1.5 text-[10px]', active ? 'text-[#299E60] font-bold' : 'text-gray-400')}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <main className="px-4 md:px-8 py-6 md:py-8 pb-28 md:pb-24">
        <div className="max-w-2xl mx-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5 text-[13px] text-red-600 font-medium">
              {error}
            </div>
          )}

          {step === 1 && (
            <section>
              {!isAuthMode && (
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-[#299E60] transition-colors mb-4"
                >
                  <ArrowLeft size={14} /> Choose a different signup type
                </Link>
              )}
              <h2 className="text-[22px] font-[800] text-gray-800 mb-1">
                {EMAIL_REGISTER_ALLOWED ? 'Verify your contact' : 'Verify your mobile number'}
              </h2>
              <p className="text-[13px] text-gray-500 mb-6">
                {EMAIL_REGISTER_ALLOWED
                  ? 'We\'ll send a 4-digit OTP to your mobile or email.'
                  : 'We\'ll send a 4-digit OTP to confirm.'}
              </p>

              {EMAIL_REGISTER_ALLOWED && (
                <div className="flex gap-2 mb-5 p-1 bg-gray-100 rounded-xl">
                  {(['phone', 'email'] as const).map(ch => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => {
                        setVerifyChannel(ch);
                        resetOtpState();
                        setError('');
                      }}
                      className={cn(
                        'flex-1 py-2.5 rounded-lg text-[12px] font-bold transition-colors',
                        verifyChannel === ch
                          ? 'bg-white text-[#299E60] shadow-sm'
                          : 'text-gray-500 hover:text-gray-700',
                      )}
                    >
                      {ch === 'phone' ? 'Mobile' : 'Email'}
                    </button>
                  ))}
                </div>
              )}

              {(!EMAIL_REGISTER_ALLOWED || verifyChannel === 'phone') ? (
              <Field label="Mobile number" required>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-[13px] font-bold text-gray-500 z-10">+91</span>
                  <input type="tel" inputMode="numeric" maxLength={10}
                    value={phone}
                    onChange={e => {
                      const next = e.target.value.replace(/\D/g, '').slice(0, 10);
                      if (next !== phone && (otpSent || phoneVerified)) {
                        resetOtpState();
                      }
                      setPhone(next);
                      setError('');
                    }}
                    placeholder="10 digit mobile number"
                    className={inputClass(false, 'pl-12')} />
                </div>
              </Field>
              ) : (
              <Field label="Email address" required>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={e => {
                    const next = e.target.value;
                    if (next !== registerEmail && (otpSent || emailVerified)) {
                      resetOtpState();
                    }
                    setRegisterEmail(next);
                    setError('');
                  }}
                  placeholder="you@company.com"
                  className={inputClass(false)}
                />
              </Field>
              )}

              {!otpSent ? (
                <button
                  onClick={handleSendOtp}
                  disabled={
                    otpLoading
                    || (verifyChannel === 'email'
                      ? !EMAIL_RE.test(registerEmail.trim())
                      : !PHONE_RE.test(phone))
                  }
                  className={cn(FORM.primaryBtn, 'mt-4 py-3 px-6')}>
                  {otpLoading && <Loader2 size={16} className="animate-spin" />} Send OTP
                </button>
              ) : (
                <div className="mt-6">
                  <Field
                    label={
                      verifyChannel === 'email'
                        ? `Enter the 4-digit OTP sent to ${registerEmail.trim().toLowerCase()}`
                        : `Enter the 4-digit OTP sent to +91 ${phone}`
                    }
                    required
                  >
                    <div className="flex gap-3">
                      {otpDigits.map((d, i) => (
                        <input key={i} ref={otpRefs[i]} type="text" inputMode="numeric" maxLength={4}
                          value={d} onChange={e => handleOtpInput(i, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Backspace' && !otpDigits[i] && i > 0) otpRefs[i - 1].current?.focus(); }}
                          disabled={otpLoading || phoneVerified || emailVerified}
                          className={cn(
                            'w-[56px] h-[56px] text-center text-[22px] font-[800] border-2 rounded-xl outline-none transition-all',
                            d ? 'border-[#299E60] bg-green-50 text-[#299E60]' : 'border-gray-200 bg-white',
                            'focus:border-[#299E60] focus:ring-4 focus:ring-[#299E60]/10',
                          )}
                        />
                      ))}
                    </div>
                  </Field>
                  <div className="mt-3 flex items-center gap-4 text-[13px]">
                    {phoneVerified || emailVerified ? (
                      <span className="text-[#299E60] font-bold flex items-center gap-1"><CheckCircle2 size={14} /> Verified</span>
                    ) : resendTimer > 0 ? (
                      <span className="text-gray-400">Resend OTP in <strong>{resendTimer}s</strong></span>
                    ) : (
                      <button onClick={handleSendOtp} disabled={otpLoading} className="text-[#299E60] font-bold hover:underline">Resend OTP</button>
                    )}
                    {/* Always available — user may circle back from a later step
                        to fix the phone. Resets step-1 state only; everything
                        the user filled in steps 2-7 stays in component state. */}
                    <button
                      onClick={() => {
                        resetOtpState();
                        setError('');
                      }}
                      className="text-gray-500 hover:underline">
                      {verifyChannel === 'email' ? 'Change email' : 'Change number'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section>
              <h2 className="text-[22px] font-[800] text-gray-800 mb-1">What kind of business are you?</h2>
              <p className="text-[13px] text-gray-500 mb-6">Select your vendor type and operational profile.</p>
              <VendorProfileForm
                value={vendorProfile}
                onChange={patch => setVendorProfile(prev => ({ ...prev, ...patch }))}
                errors={fieldErrors}
                onFieldBlur={(field, value) => {
                  const msg = validateVendorFieldBlur(field, value);
                  setFE(field, msg);
                }}
                visibleSections={{ identity: true, ops: true }}
                layout="wide"
              />
            </section>
          )}

          {step === 3 && (
            <section>
              <h2 className="text-[22px] font-[800] text-gray-800 mb-1">Basic Details</h2>
              <p className="text-[13px] text-gray-500 mb-6">Tell us about your business and the person we&apos;ll be in touch with.</p>
              <VendorProfileForm
                value={{ ...vendorProfile, fullName, email, password }}
                onChange={patch => {
                  setVendorProfile(prev => ({ ...prev, ...patch }));
                  if (patch.fullName !== undefined) setFullName(patch.fullName);
                  if (patch.email !== undefined) setEmail(patch.email);
                  if (patch.password !== undefined) setPassword(patch.password);
                  if (patch.legalName !== undefined) setBusinessName(patch.legalName);
                  if (patch.tradeName !== undefined) setTradeName(patch.tradeName);
                  if (patch.displayName !== undefined) setTradeName(patch.displayName);
                  if (patch.authorizedPersonName !== undefined) setAuthorizedPersonName(patch.authorizedPersonName);
                  if (patch.authorizedPersonPhone !== undefined) setAuthorizedPersonPhone(patch.authorizedPersonPhone);
                  if (patch.authorizedPersonEmail !== undefined) setAuthorizedPersonEmail(patch.authorizedPersonEmail);
                }}
                errors={fieldErrors}
                onFieldBlur={(field, value) => setFE(field, validateVendorFieldBlur(field, value))}
                visibleSections={{ contact: true, auth: !isAuthMode, ops: false }}
                showPassword
                password={password}
                onPasswordChange={setPassword}
                layout="wide"
              />
            </section>
          )}

          {step === 4 && (
            <section>
              <h2 className="text-[22px] font-[800] text-gray-800 mb-1">GST & PAN</h2>
              <p className="text-[13px] text-gray-500 mb-6">Optional — add them now or leave blank and provide later.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="GSTIN (optional)" error={fieldErrors.gstNumber}>
                  <Input value={gstNumber}
                    onChange={v => {
                      const val = v.toUpperCase().slice(0, 15);
                      setGstNumber(val);
                      if (fieldErrors.gstNumber) {
                        setFE('gstNumber', val.trim() ? V.gst(val) : '');
                      }
                    }}
                    onBlur={() => setFE('gstNumber', gstNumber.trim() ? V.gst(gstNumber) : '')}
                    hasError={!!fieldErrors.gstNumber}
                    placeholder="22ABCDE1234F1Z5" />
                </Field>
                <Field label="PAN (optional)" error={fieldErrors.panNumber}>
                  <Input value={panNumber}
                    onChange={v => {
                      const val = v.toUpperCase().slice(0, 10);
                      setPanNumber(val);
                      if (fieldErrors.panNumber) {
                        setFE('panNumber', val.trim() ? V.pan(val) : '');
                      }
                    }}
                    onBlur={() => setFE('panNumber', panNumber.trim() ? V.pan(panNumber) : '')}
                    hasError={!!fieldErrors.panNumber}
                    placeholder="ABCDE1234F" />
                </Field>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <FileField label="PAN card document" hint="Scan or photo of the PAN card"
                  value={panFile} onChange={setPanFile} />
                <FileField label="GST certificate" hint="GST registration certificate"
                  value={gstFile} onChange={setGstFile} />
              </div>

              <p className="text-[12px] text-gray-400 mt-4">
                You can skip these for now — add or update them anytime. Our team verifies KYC during approval.
              </p>
            </section>
          )}

          {step === 5 && (
            <section>
              <h2 className="text-[22px] font-[800] text-gray-800 mb-1">Bank Details</h2>
              <p className="text-[13px] text-gray-500 mb-6">For settlement of your orders. Your account will be verified via a ₹1 penny-drop.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Account holder name" required className="md:col-span-2" error={fieldErrors.bankAccountName}>
                  <Input value={bankAccountName} onChange={v => { setBankAccountName(v); if (fieldErrors.bankAccountName) setFE('bankAccountName', V.minLen(v, 'Account holder name', 2)); }}
                    onBlur={() => setFE('bankAccountName', V.minLen(bankAccountName, 'Account holder name', 2))}
                    hasError={!!fieldErrors.bankAccountName}
                    placeholder="As per bank records" />
                </Field>
                <Field label="Account number" required error={fieldErrors.bankAccountNumber}>
                  <Input value={bankAccountNumber} onChange={v => { const n = v.replace(/\D/g, '').slice(0, 18); setBankAccountNumber(n); if (fieldErrors.bankAccountNumber) setFE('bankAccountNumber', n.length < 8 ? 'Enter a valid account number' : ''); }}
                    onBlur={() => setFE('bankAccountNumber', bankAccountNumber.length < 8 ? 'Enter a valid account number' : '')}
                    hasError={!!fieldErrors.bankAccountNumber}
                    placeholder="123456789012" />
                </Field>
                <Field label="IFSC code" required error={fieldErrors.bankIfsc}>
                  <Input value={bankIfsc} onChange={v => { const n = v.toUpperCase().slice(0, 11); setBankIfsc(n); if (fieldErrors.bankIfsc) setFE('bankIfsc', V.ifsc(n)); }}
                    onBlur={() => setFE('bankIfsc', V.ifsc(bankIfsc))}
                    hasError={!!fieldErrors.bankIfsc}
                    placeholder="HDFC0001234" />
                </Field>
                <Field label="Bank name" required error={fieldErrors.bankName}>
                  <Input value={bankName} onChange={v => { setBankName(v); if (fieldErrors.bankName) setFE('bankName', V.minLen(v, 'Bank name', 2)); }}
                    onBlur={() => setFE('bankName', V.minLen(bankName, 'Bank name', 2))}
                    hasError={!!fieldErrors.bankName}
                    placeholder="HDFC Bank" />
                </Field>
                <Field label="Account type" required>
                  <select value={bankAccountType} onChange={e => setBankAccountType(e.target.value as 'savings' | 'current')}
                    className={selectClass()}>
                    <option value="current">Current</option>
                    <option value="savings">Savings</option>
                  </select>
                </Field>
              </div>

              <div className="mt-6">
                <FileField label="Cancelled cheque" hint="A cancelled cheque helps us verify your bank account faster"
                  value={chequeFile} onChange={setChequeFile} />
              </div>
            </section>
          )}

          {step === 6 && (
            <section>
              <h2 className="text-[22px] font-[800] text-gray-800 mb-1">Addresses</h2>
              <p className="text-[13px] text-gray-500 mb-6">Billing address goes on invoices. Pickup address is where our delivery partner collects orders.</p>

              <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
                <h3 className="font-bold text-[15px] text-gray-800 mb-3">Billing Address</h3>
                <div className="space-y-3">
                  <AddressAutocomplete
                    label="Search from maps"
                    placeholder="Type location, e.g. Vashi Rockville Diner..."
                    hint="Selecting a place from maps auto-fills address details below."
                    onPick={(place) => {
                      if (place.pincode) {
                        lastFetchedBillingPin.current = place.pincode;
                      }
                      setBillingAddress({
                        addressLine: place.fullAddress,
                        city: place.city || billingAddress.city,
                        state: place.state || billingAddress.state,
                        pincode: place.pincode || billingAddress.pincode,
                      });
                      setFieldErrors(prev => ({
                        ...prev,
                        billingAddressLine: '',
                        billingCity: '',
                        billingState: '',
                        billingPincode: ''
                      }));
                    }}
                    className="mb-2"
                  />
                  <Field label="Address Line" required error={fieldErrors.billingAddressLine}>
                    <Input value={billingAddress.addressLine}
                      onChange={v => { setBillingAddress({ ...billingAddress, addressLine: v }); if (fieldErrors.billingAddressLine) setFE('billingAddressLine', v.trim().length < 5 ? 'Enter the full address' : ''); }}
                      onBlur={() => setFE('billingAddressLine', billingAddress.addressLine.trim().length < 5 ? 'Enter the full address' : '')}
                      hasError={!!fieldErrors.billingAddressLine}
                      placeholder="Building, street, area" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="City" required error={fieldErrors.billingCity}>
                      <Input value={billingAddress.city}
                        onChange={v => { setBillingAddress({ ...billingAddress, city: v }); if (fieldErrors.billingCity) setFE('billingCity', v.trim() ? '' : 'City is required'); }}
                        onBlur={() => setFE('billingCity', billingAddress.city.trim() ? '' : 'City is required')}
                        hasError={!!fieldErrors.billingCity} />
                    </Field>
                    <Field label="State" required error={fieldErrors.billingState}>
                      <Input value={billingAddress.state}
                        onChange={v => { setBillingAddress({ ...billingAddress, state: v }); if (fieldErrors.billingState) setFE('billingState', v.trim() ? '' : 'State is required'); }}
                        onBlur={() => setFE('billingState', billingAddress.state.trim() ? '' : 'State is required')}
                        hasError={!!fieldErrors.billingState} />
                    </Field>
                  </div>
                  <Field label="Pincode" required error={fieldErrors.billingPincode}>
                    <Input value={billingAddress.pincode}
                      onChange={v => { const n = v.replace(/\D/g, '').slice(0, 6); setBillingAddress({ ...billingAddress, pincode: n }); if (fieldErrors.billingPincode) setFE('billingPincode', V.pincode(n)); }}
                      onBlur={() => setFE('billingPincode', V.pincode(billingAddress.pincode))}
                      hasError={!!fieldErrors.billingPincode}
                      placeholder="6-digit pincode" />
                  </Field>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-[15px] text-gray-800">Pickup / Warehouse Address</h3>
                  <label className="flex items-center gap-2 text-[12px] text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={pickupSameAsBilling} onChange={e => setPickupSameAsBilling(e.target.checked)}
                      className="accent-[#299E60]" />
                    Same as billing
                  </label>
                </div>
                <div className="space-y-3">
                  {!pickupSameAsBilling && (
                    <AddressAutocomplete
                      label="Search from maps"
                      placeholder="Type location, e.g. Vashi Rockville Diner..."
                      hint="Selecting a place from maps auto-fills address details below."
                      onPick={(place) => {
                        if (place.pincode) {
                          lastFetchedPickupPin.current = place.pincode;
                        }
                        setPickupAddress({
                          addressLine: place.fullAddress,
                          city: place.city || pickupAddress.city,
                          state: place.state || pickupAddress.state,
                          pincode: place.pincode || pickupAddress.pincode,
                        });
                        setFieldErrors(prev => ({
                          ...prev,
                          pickupAddressLine: '',
                          pickupCity: '',
                          pickupState: '',
                          pickupPincode: ''
                        }));
                      }}
                      className="mb-2"
                    />
                  )}
                  <Field label="Address Line" required error={!pickupSameAsBilling ? fieldErrors.pickupAddressLine : undefined}>
                    <Input value={pickupAddress.addressLine} disabled={pickupSameAsBilling}
                      onChange={v => { setPickupAddress({ ...pickupAddress, addressLine: v }); if (fieldErrors.pickupAddressLine) setFE('pickupAddressLine', v.trim().length < 5 ? 'Enter the full address' : ''); }}
                      onBlur={() => setFE('pickupAddressLine', pickupAddress.addressLine.trim().length < 5 ? 'Enter the full address' : '')}
                      hasError={!pickupSameAsBilling && !!fieldErrors.pickupAddressLine}
                      placeholder="Warehouse / godown address" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="City" required error={!pickupSameAsBilling ? fieldErrors.pickupCity : undefined}>
                      <Input value={pickupAddress.city} disabled={pickupSameAsBilling}
                        onChange={v => { setPickupAddress({ ...pickupAddress, city: v }); if (fieldErrors.pickupCity) setFE('pickupCity', v.trim() ? '' : 'City is required'); }}
                        onBlur={() => setFE('pickupCity', pickupAddress.city.trim() ? '' : 'City is required')}
                        hasError={!pickupSameAsBilling && !!fieldErrors.pickupCity} />
                    </Field>
                    <Field label="State" required error={!pickupSameAsBilling ? fieldErrors.pickupState : undefined}>
                      <Input value={pickupAddress.state} disabled={pickupSameAsBilling}
                        onChange={v => { setPickupAddress({ ...pickupAddress, state: v }); if (fieldErrors.pickupState) setFE('pickupState', v.trim() ? '' : 'State is required'); }}
                        onBlur={() => setFE('pickupState', pickupAddress.state.trim() ? '' : 'State is required')}
                        hasError={!pickupSameAsBilling && !!fieldErrors.pickupState} />
                    </Field>
                  </div>
                  <Field label="Pincode" required error={!pickupSameAsBilling ? fieldErrors.pickupPincode : undefined}>
                    <Input value={pickupAddress.pincode} disabled={pickupSameAsBilling}
                      onChange={v => { const n = v.replace(/\D/g, '').slice(0, 6); setPickupAddress({ ...pickupAddress, pincode: n }); if (fieldErrors.pickupPincode) setFE('pickupPincode', V.pincode(n)); }}
                      onBlur={() => setFE('pickupPincode', V.pincode(pickupAddress.pincode))}
                      hasError={!pickupSameAsBilling && !!fieldErrors.pickupPincode}
                      placeholder="6-digit pincode" />
                  </Field>
                </div>
              </div>
            </section>
          )}

          {step === 7 && (
            <section>
              <h2 className="text-[22px] font-[800] text-gray-800 mb-1">Service Area & KYC</h2>
              <p className="text-[13px] text-gray-500 mb-6">Where can you deliver, and any additional certifications.</p>

              <Field label="Serviceable pincodes" required>
                <div className="flex gap-2">
                  <input value={pincodeInput}
                    onChange={e => setPincodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPincode(); } }}
                    placeholder="Add 6-digit pincode"
                    className="flex-1 px-4 py-3 bg-[#FAFAFA] focus:bg-white border border-[#EEEEEE] rounded-[10px] text-[13px] outline-none focus:border-[#299E60]/40 focus:ring-2 focus:ring-[#299E60]/10 transition-all" />
                  <button onClick={addPincode} className="px-4 py-3 bg-[#299E60] hover:bg-[#238a54] text-white rounded-[10px] font-bold flex items-center gap-1 transition-colors">
                    <Plus size={16} /> Add
                  </button>
                </div>
                {pincodes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pincodes.map(p => (
                      <span key={p} className="inline-flex items-center gap-1.5 bg-[#ECFDF5] text-[#299E60] px-3 py-1.5 rounded-full text-[13px] font-bold">
                        {p}
                        <button onClick={() => removePincode(p)} className="hover:bg-[#299E60]/10 rounded-full p-0.5">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <span className="text-[12px] text-gray-400 self-center ml-2">{pincodes.length} pincode{pincodes.length !== 1 ? 's' : ''} added</span>
                  </div>
                )}
              </Field>

              <div className="mt-6">
                <Field label="Delivery capability" required>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {([
                      { id: 'own_fleet', label: 'Own fleet', desc: 'I deliver using my own vehicles' },
                      { id: 'third_party', label: '3rd party', desc: 'I use external logistics' },
                      { id: 'both', label: 'Both', desc: 'Mix of own + 3PL' },
                    ] as const).map(o => (
                      <button key={o.id} onClick={() => setDeliveryCapability(o.id)}
                        className={cn(
                          'p-3 border-2 rounded-lg text-left transition-all',
                          deliveryCapability === o.id ? 'border-[#299E60] bg-[#ECFDF5]' : 'border-gray-200 hover:border-gray-300',
                        )}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Truck size={14} className="text-[#299E60]" />
                          <span className="font-bold text-[13px] text-gray-800">{o.label}</span>
                        </div>
                        <div className="text-[11px] text-gray-500">{o.desc}</div>
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100">
                <h3 className="font-bold text-[15px] text-gray-800 mb-1">Additional KYC (optional)</h3>
                <p className="text-[12px] text-gray-500 mb-4">Speed up approval by providing applicable certificates.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="FSSAI">
                    <Input value={fssaiNumber} onChange={setFssaiNumber} placeholder="14-digit license" />
                  </Field>
                  <Field label="Udyam">
                    <Input value={udyamNumber} onChange={setUdyamNumber} placeholder="UDYAM-XX-00-0000000" />
                  </Field>
                  <Field label="CIN">
                    <Input value={cinNumber} onChange={setCinNumber} placeholder="Company Identification No." />
                  </Field>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer action bar — pinned to viewport bottom */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 md:px-8 py-3 md:py-4 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button onClick={handleBack} disabled={step <= (isAuthMode ? 2 : 1) || submitting}
            className="px-5 py-3 text-gray-600 font-bold rounded-lg hover:bg-gray-50 disabled:opacity-30 flex items-center gap-2">
            <ArrowLeft size={16} /> Back
          </button>

          {step === 1 && !phoneVerified ? (
            <span className="text-[12px] text-gray-400">Verify your number to continue</span>
          ) : (
            <button onClick={handleNext} disabled={submitting}
              className={cn(FORM.primaryBtn, 'px-6 py-3')}>
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {step === 7 ? 'Submit Application' : 'Continue'}
              {!submitting && step < 7 && <ArrowRight size={16} />}
            </button>
          )}
        </div>
      </footer>

      <ExistingPhoneModal
        isOpen={!!existingPhoneModal}
        phone={existingPhoneModal?.phone ?? ''}
        hcidDisplay={existingPhoneModal?.hcidDisplay}
        accountLabel={existingPhoneModal?.accountLabel ?? 'Customer'}
        intent="vendor"
        redirectTo="/vendor/register"
        suggestedAction={existingPhoneModal?.suggestedAction ?? 'login_to_link'}
        contactType={existingPhoneModal?.contactType ?? 'phone'}
        onClose={() => setExistingPhoneModal(null)}
        onUseDifferentNumber={() => {
          setExistingPhoneModal(null);
          if (existingPhoneModal?.contactType === 'email') {
            setRegisterEmail('');
          } else {
            setPhone('');
          }
          resetOtpState();
          setError('');
        }}
      />
    </div>
  );
}

// ─── Tiny UI helpers ──────────────────────────────────────────────────────
// Field comes from the shared form module (imported as `Field`).

// Direct file picker — stages a File in parent state (uploaded after the vendor
// row is created). Accepts PDF + common image types, matching the server.
function FileField({
  label, hint, value, onChange,
}: {
  label: string;
  hint?: string;
  value: File | null;
  onChange: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-bold text-gray-700 ml-0.5">{label}</label>
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
      <button type="button" onClick={() => ref.current?.click()}
        className="w-full flex items-center gap-2 px-4 py-3 bg-[#FAFAFA] border border-dashed border-[#299E60]/40 rounded-[10px] text-[13px] text-left hover:bg-[#ECFDF5]/60 transition-colors">
        <Upload size={15} className="text-[#299E60] shrink-0" />
        <span className={cn('truncate', value ? 'text-gray-800 font-bold' : 'text-gray-400')}>
          {value ? value.name : 'Choose file from your computer…'}
        </span>
      </button>
      {value ? (
        <button type="button"
          onClick={() => { onChange(null); if (ref.current) ref.current.value = ''; }}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400 hover:text-red-500 ml-0.5">
          <X size={11} /> Remove
        </button>
      ) : hint ? (
        <p className="text-[11px] text-gray-400 ml-0.5">{hint}</p>
      ) : null}
    </div>
  );
}

function Input({
  value, onChange, type = 'text', placeholder, disabled, onBlur, hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  onBlur?: () => void;
  hasError?: boolean;
}) {
  return (
    <FormInput
      value={value} onChange={onChange} hasError={hasError}
      type={type} placeholder={placeholder} disabled={disabled} onBlur={onBlur}
    />
  );
}
