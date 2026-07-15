'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, Phone, Building2, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FORM, FormErrorBanner } from '@/components/ui/form';
import {
  BrandProfileForm,
  type BrandProfileValues,
} from '@/components/features/brand/BrandProfileForm';
import { EMPTY_BRAND_PROFILE } from '@/components/features/brand/brandProfileDefaults';
import {
  validateBrandProfile,
  validateFieldBlur,
} from '@/lib/validators/brand-profile';
import { buildBrandProfile, buildAddBusinessPayload } from '@/lib/brandProfileMapper';
import { focusFirstFormError } from '@/lib/formErrorFocus';
import { extractApiError, parseJsonResponse } from '@/lib/apiError';
import { ExistingPhoneModal } from '@/components/auth/ExistingPhoneModal';
import { accountLabelFromCheck } from '@/lib/auth/phoneCheckLabels';
import type { PhoneCheckResult } from '@/lib/auth/checkPhoneLookup';
import { toast } from 'sonner';
import {
  isRegisterEmailOtpEnabled,
  resolveRegisterVerifyChannel,
} from '@/lib/config/registerEmailOtp';

const EMAIL_REGISTER_ALLOWED = isRegisterEmailOtpEnabled();

const STEP_TITLES = [
  { id: 1, label: EMAIL_REGISTER_ALLOWED ? 'Verify Contact' : 'Verify Mobile', icon: Phone },
  { id: 2, label: 'Brand Profile', icon: Building2 },
];

const RESEND_COOLDOWN = 60;

const BRAND_FIELD_ORDER = [
  'legalName', 'displayName', 'brandType', 'subType', 'firstName', 'phone', 'email', 'password',
  'outletName', 'addressLine', 'pincode', 'gstin',
];

export default function BrandRegisterPage() {
  const { data: session, status: sessionStatus } = useSession();
  const isAuthMode = sessionStatus === 'authenticated';
  const { switchAccount, refresh: refreshAccounts } = useBusinessAccountSwitcher();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<{ hcid: string } | null>(null);

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
  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const [profile, setProfile] = useState<BrandProfileValues>({ ...EMPTY_BRAND_PROFILE });
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [existingPhoneModal, setExistingPhoneModal] = useState<{
    phone: string;
    hcidDisplay?: string;
    accountLabel: string;
    suggestedAction: 'login_to_link' | 'login_only';
    contactType?: 'phone' | 'email';
  } | null>(null);

  const authSeedDone = useRef(false);
  useEffect(() => {
    if (!isAuthMode || authSeedDone.current) return;
    authSeedDone.current = true;
    setPhoneVerified(true);
    setOtpSent(true);
    setStep(2);
    fetch('/api/v1/auth/me').then(r => r.json()).then(j => {
      if (!j.success) return;
      const me = j.data ?? {};
      const mePhone = me.phone ? String(me.phone).replace(/\D/g, '').slice(-10) : '';
      if (mePhone) {
        setPhone(mePhone);
        setProfile(prev => ({ ...prev, phone: mePhone, mobilePhone: mePhone }));
      }
      if (me.email) setProfile(prev => ({ ...prev, email: prev.email || String(me.email) }));
      if (me.fullName) {
        setProfile(prev => ({
          ...prev,
          firstName: prev.firstName || String(me.fullName).split(' ')[0] || '',
          lastName: prev.lastName || String(me.fullName).split(' ').slice(1).join(' ') || '',
        }));
      }
    }).catch(() => { /* prefill is optional */ });
  }, [isAuthMode]);

  const startResendTimer = useCallback(() => {
    setResendTimer(RESEND_COOLDOWN);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const resetOtpState = () => {
    setOtpSent(false);
    setPhoneVerified(false);
    setEmailVerified(false);
    setOtpDigits(['', '', '', '']);
  };

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

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    const email = registerEmail.trim().toLowerCase();
    const channel = resolveRegisterVerifyChannel({
      email,
      phone: digits,
      preferred: verifyChannel,
    });
    if (!channel) {
      setError(
        EMAIL_REGISTER_ALLOWED
          ? 'Enter a mobile number or email address'
          : 'Enter a valid 10-digit mobile number',
      );
      return;
    }
    if (channel !== verifyChannel) setVerifyChannel(channel);
    const useEmail = channel === 'email';
    setOtpLoading(true);
    setError('');
    try {
      if (!isAuthMode) {
        if (useEmail) {
          const checkRes = await fetch('/api/v1/auth/check-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, intent: 'brand' }),
          });
          const checkData = await checkRes.json();
          if (checkData.success && checkData.data?.exists) {
            openExistingPhoneModal(email, checkData.data as PhoneCheckResult, 'email');
            return;
          }
        } else {
          const checkRes = await fetch('/api/v1/auth/check-phone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: digits, intent: 'brand' }),
          });
          const checkData = await checkRes.json();
          if (checkData.success && checkData.data?.exists) {
            openExistingPhoneModal(digits, checkData.data as PhoneCheckResult, 'phone');
            return;
          }
        }
      }

      const res = await fetch('/api/v1/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          useEmail
            ? { email, mode: 'register', intent: 'brand' }
            : { phone: digits, mode: 'register', intent: 'brand' },
        ),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to send OTP');
        return;
      }
      setOtpSent(true);
      startResendTimer();
      setTimeout(() => otpRefs[0].current?.focus(), 100);
    } catch {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async (code: string) => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    const email = registerEmail.trim().toLowerCase();
    const channel = resolveRegisterVerifyChannel({
      email,
      phone: digits,
      preferred: verifyChannel,
    });
    const useEmail = channel === 'email';
    setOtpLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          useEmail
            ? { email, code }
            : { phone: digits, code },
        ),
      });
      const data = await res.json();
      if (!data.success) {
        setError('Invalid or expired OTP');
        setOtpDigits(['', '', '', '']);
        otpRefs[0].current?.focus();
        return;
      }
      if (useEmail) {
        setEmailVerified(true);
        setProfile(prev => ({ ...prev, email }));
      } else {
        setPhoneVerified(true);
        setProfile(prev => ({ ...prev, phone: digits, mobilePhone: digits }));
      }
      setStep(2);
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpInput = (i: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      const next = ['', '', '', ''];
      for (let j = 0; j < digits.length; j++) next[j] = digits[j];
      setOtpDigits(next);
      setError('');
      otpRefs[Math.min(digits.length, 3)]?.current?.focus();
      if (digits.length === 4) verifyOtp(digits);
      return;
    }
    const digit = value.replace(/\D/g, '');
    const next = [...otpDigits];
    next[i] = digit;
    setOtpDigits(next);
    setError('');
    if (digit && i < 3) otpRefs[i + 1].current?.focus();
    if (digit && next.every(d => d)) verifyOtp(next.join(''));
  };

  const applySubmitError = (apiErr: unknown) => {
    const parsed = extractApiError(
      typeof apiErr === 'object' && apiErr !== null && 'success' in apiErr
        ? apiErr
        : { success: false, error: apiErr },
      'Failed to submit. Please check the highlighted fields.',
    );
    setError(parsed.message);
    toast.error(parsed.message);
    if (parsed.fields && Object.keys(parsed.fields).length > 0) {
      setFieldErrors(parsed.fields);
      focusFirstFormError(parsed.fields, { fieldOrder: BRAND_FIELD_ORDER, dataField: true });
    }
  };

  const handleSubmit = async () => {
    const validationContext = isAuthMode ? 'addBusiness' : 'publicRegister';
    const validation = validateBrandProfile(
      isAuthMode ? profile : { ...profile, password },
      validationContext,
    );
    if (!validation.success) {
      setFieldErrors(validation.errors);
      const msg = validation.message ?? 'Please fix the highlighted fields';
      setError(msg);
      toast.error(msg);
      focusFirstFormError(validation.errors, { fieldOrder: BRAND_FIELD_ORDER, dataField: true });
      return;
    }

    setSubmitting(true);
    setError('');
    setFieldErrors({});

    try {
      if (isAuthMode) {
        const res = await fetch('/api/v1/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAddBusinessPayload(profile)),
        });
        const json = await parseJsonResponse<{ success: boolean; data?: { account: { id: string }; outlet: { id: string } } }>(res);
        if (!json.success || !json.data) {
          applySubmitError(json);
          setSubmitting(false);
          return;
        }
        await refreshAccounts();
        await switchAccount(json.data.account.id, json.data.outlet.id);
        let hcidDisplay = '—';
        try {
          const meRes = await fetch('/api/v1/auth/me');
          const meJson = await meRes.json();
          if (meJson.success && meJson.data?.hcidDisplay) {
            hcidDisplay = String(meJson.data.hcidDisplay);
          }
        } catch { /* optional */ }
        setSubmitted({ hcid: hcidDisplay });
        setSubmitting(false);
        return;
      }

      const phoneDigits = phone.replace(/\D/g, '').slice(-10);
      const verifiedEmail = registerEmail.trim().toLowerCase();
      const payload = {
        ...buildBrandProfile({ ...profile, password }),
        phone: phoneVerified ? phoneDigits : '',
        verifiedEmail: emailVerified ? verifiedEmail : '',
        email: profile.email?.trim().toLowerCase() || (emailVerified ? verifiedEmail : ''),
        password: password || undefined,
      };

      const res = await fetch('/api/v1/brand/onboarding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await parseJsonResponse<{ success: boolean; data?: { hcidDisplay: string } }>(res);
      if (!json.success) {
        applySubmitError(json);
        setSubmitting(false);
        return;
      }
      setSubmitted({ hcid: json.data!.hcidDisplay });
    } catch {
      const msg = 'Network error — please try again.';
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  };

  // Only block on initial load — a background session revalidation keeps
  // `session` populated and must not unmount the multi-step form (would wipe
  // everything the applicant has typed).
  if (sessionStatus === 'loading' && !session) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#299E60]" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="bg-white rounded-[24px] border border-[#EEEEEE] p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-[#299E60]" />
          </div>
          <h1 className="text-[22px] font-[800] text-[#181725] mb-2">Application Submitted</h1>
          <p className="text-[14px] text-gray-500 mb-4">
            Your brand onboarding request has been received. Our team will review your profile and contact you shortly.
          </p>
          <p className="text-[12px] text-gray-400 mb-6">HCID: <span className="font-bold text-gray-600">{submitted.hcid}</span></p>
          <Link href="/" className={cn(FORM.primaryBtn, 'inline-flex px-6 py-3 text-[13px]')}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-[720px] mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/register" className="p-2 rounded-lg hover:bg-white text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-[22px] font-[800] text-[#181725] flex items-center gap-2">
              {isAuthMode ? 'Add Brand Business' : 'Brand Registration'}
              <Sparkles size={18} className="text-amber-500" />
            </h1>
            <p className="text-[13px] text-gray-500">
              {isAuthMode
                ? 'You are already signed in — no OTP needed. Add another brand business under your existing account.'
                : 'Register your brand on the HoReCa1 marketplace'}
            </p>
            {isAuthMode && (
              <p className="mt-1.5 inline-flex items-center text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                Already signed in · OTP step skipped
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {STEP_TITLES.filter(s => !isAuthMode || s.id !== 1).map(s => (
            <div key={s.id}
              className={cn(
                'flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border text-[12px] font-bold transition-colors',
                step === s.id ? 'border-[#299E60] bg-[#EEF8F1]/50 text-[#299E60]' : 'border-[#EEEEEE] bg-white text-gray-400',
                step > s.id && 'border-emerald-200 text-emerald-700',
              )}>
              <s.icon size={16} />
              {s.label}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-[20px] border border-[#EEEEEE] p-6 shadow-sm">
          <FormErrorBanner message={error || null} sticky className="mb-4" />

          {step === 1 && !isAuthMode && (
            <div className="space-y-5">
              <p className="text-[14px] text-gray-600">
                {EMAIL_REGISTER_ALLOWED
                  ? 'Verify your mobile or email to start brand onboarding.'
                  : 'Verify your mobile number to start brand onboarding.'}
              </p>

              {EMAIL_REGISTER_ALLOWED && (
                <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
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
              <div>
                <label className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5 block">Mobile Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 10);
                    if (next !== phone && (otpSent || phoneVerified)) resetOtpState();
                    setPhone(next);
                    setError('');
                  }}
                  placeholder="10-digit mobile"
                  className="w-full h-[48px] px-4 border border-[#EEEEEE] rounded-xl text-[15px] outline-none focus:border-[#299E60]/40"
                  disabled={phoneVerified}
                />
              </div>
              ) : (
              <div>
                <label className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5 block">Email Address</label>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={e => {
                    if (e.target.value !== registerEmail && (otpSent || emailVerified)) resetOtpState();
                    setRegisterEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="you@example.com"
                  className="w-full h-[48px] px-4 border border-[#EEEEEE] rounded-xl text-[15px] outline-none focus:border-[#299E60]/40"
                  disabled={emailVerified}
                />
              </div>
              )}

              {otpSent && !phoneVerified && !emailVerified && (
                <div>
                  <label className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-2 block">Enter OTP</label>
                  <div className="flex gap-3 justify-center">
                    {otpDigits.map((d, i) => (
                      <input
                        key={i}
                        ref={otpRefs[i]}
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={d}
                        onChange={e => handleOtpInput(i, e.target.value)}
                        className="w-14 h-14 text-center text-[20px] font-bold border border-[#EEEEEE] rounded-xl outline-none focus:border-[#299E60]/40"
                      />
                    ))}
                  </div>
                  <p className="text-center text-[12px] text-gray-400 mt-3">
                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : (
                      <button type="button" onClick={sendOtp} className="text-[#299E60] font-bold">Resend OTP</button>
                    )}
                  </p>
                </div>
              )}

              {!otpSent && (
                <button type="button" onClick={sendOtp} disabled={otpLoading}
                  className={cn(FORM.primaryBtn, 'w-full h-[48px] text-[14px]')}>
                  {otpLoading ? <Loader2 size={18} className="animate-spin" /> : 'Send OTP'}
                </button>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <BrandProfileForm
                value={profile}
                onChange={patch => setProfile(prev => ({ ...prev, ...patch }))}
                errors={fieldErrors}
                onFieldBlur={(field, value) => {
                  const msg = validateFieldBlur(field, value);
                  setFieldErrors(prev => {
                    const next = { ...prev };
                    if (msg) next[field] = msg; else delete next[field];
                    return next;
                  });
                }}
                requireLocationFields={isAuthMode}
                visibleSections={{
                  contact: true,
                  identity: true,
                  market: true,
                  auth: !isAuthMode,
                  tax: true,
                  address: true,
                  marketing: true,
                }}
                showPassword={!isAuthMode}
                password={password}
                onPasswordChange={setPassword}
              />

              <div className="flex gap-3 pt-2">
                {!isAuthMode && (
                  <button type="button" onClick={() => setStep(1)}
                    className="h-[48px] px-5 rounded-xl border border-[#EEEEEE] text-[13px] font-bold text-gray-500 hover:bg-gray-50">
                    Back
                  </button>
                )}
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className={cn(FORM.primaryBtn, 'flex-1 h-[48px] text-[14px]')}>
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
                  {submitting ? 'Submitting…' : isAuthMode ? 'Create Brand Business' : 'Submit Application'}
                  {!submitting && <ArrowRight size={16} className="ml-1" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ExistingPhoneModal
        isOpen={!!existingPhoneModal}
        phone={existingPhoneModal?.phone ?? ''}
        hcidDisplay={existingPhoneModal?.hcidDisplay}
        accountLabel={existingPhoneModal?.accountLabel ?? 'Customer'}
        intent="brand"
        redirectTo="/brand/register"
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
