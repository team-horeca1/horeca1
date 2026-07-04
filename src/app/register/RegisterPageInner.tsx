'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import {
  Loader2, ArrowLeft, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FORM } from '@/components/ui/form';
import { RegisterRolePicker } from '@/components/auth/RegisterRolePicker';
import { ExistingPhoneModal } from '@/components/auth/ExistingPhoneModal';
import { accountLabelFromCheck } from '@/lib/auth/phoneCheckLabels';
import type { PhoneCheckResult } from '@/lib/auth/checkPhoneLookup';
import {
  CustomerProfileForm,
  type CustomerProfileValues,
} from '@/components/features/customer/CustomerProfileForm';
import { EMPTY_CUSTOMER_PROFILE } from '@/components/features/customer/customerProfileDefaults';
import {
  validateCustomerProfile,
  validateFieldBlur,
  derivedFullName,
  derivedLegalName,
} from '@/lib/validators/customer-profile';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';

const RESEND_COOLDOWN = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_REGISTER_ALLOWED = isRegisterEmailOtpEnabled();

type Step = 'form' | 'otp' | 'success';

export default function RegisterPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const redirectTo = params?.get('redirect') || null;
  const role = params?.get('role');
  const { status: sessionStatus } = useSession();

  useEffect(() => {
    if (role === 'vendor') {
      const qs = redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : '';
      router.replace(`/vendor/register${qs}`);
    } else if (role === 'brand') {
      const qs = redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : '';
      router.replace(`/brand/register${qs}`);
    }
  }, [role, redirectTo, router]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    window.location.href = redirectTo || '/';
  }, [sessionStatus, redirectTo]);

  const [step, setStep] = useState<Step>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [profile, setProfile] = useState<CustomerProfileValues>({ ...EMPTY_CUSTOMER_PROFILE });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [existingPhoneModal, setExistingPhoneModal] = useState<{
    phone: string;
    hcidDisplay?: string;
    accountLabel: string;
    suggestedAction: 'login_to_link' | 'login_only';
    contactType?: 'phone' | 'email';
  } | null>(null);

  const [verifyChannel, setVerifyChannel] = useState<'phone' | 'email'>('phone');

  const setFE = useCallback((key: string, msg: string) => {
    setFieldErrors(prev => {
      if (!msg && !prev[key]) return prev;
      if (msg && prev[key] === msg) return prev;
      const next = { ...prev };
      if (msg) next[key] = msg; else delete next[key];
      return next;
    });
  }, []);

  const handleFieldBlur = useCallback((field: string, value: string) => {
    const msg = validateFieldBlur(field, value);
    setFE(field, msg);
  }, [setFE]);

  const patchProfile = useCallback((patch: Partial<CustomerProfileValues>) => {
    setProfile(prev => ({ ...prev, ...patch }));
    setApiError('');
  }, []);

  const [otp, setOtp] = useState<string[]>(['', '', '', '']);
  const otpRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendTimer = useCallback(() => {
    setResendTimer(RESEND_COOLDOWN);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const goPostLogin = useCallback(() => {
    window.location.href = redirectTo || '/';
  }, [redirectTo]);

  const handleSendOtp = async () => {
    setApiError('');
    const validation = validateCustomerProfile({ ...profile, password }, 'selfRegister');
    if (!validation.success) {
      setFieldErrors(validation.errors);
      setApiError(validation.message ?? 'Please fix the highlighted fields');
      return;
    }
    setFieldErrors({});

    const phone = (profile.phone ?? profile.mobilePhone ?? '').replace(/\D/g, '').slice(-10);
    const email = (profile.email ?? '').trim().toLowerCase();
    const useEmail = EMAIL_REGISTER_ALLOWED && verifyChannel === 'email';

    if (useEmail && !EMAIL_RE.test(email)) {
      setApiError('Enter a valid email address');
      return;
    }
    if (!useEmail && phone.length !== 10) {
      setApiError('Enter a valid 10-digit mobile number');
      return;
    }

    setIsLoading(true);
    try {
      if (useEmail) {
        const checkRes = await fetch('/api/v1/auth/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, intent: 'customer' }),
        });
        const checkData = await checkRes.json();
        if (checkData.success && checkData.data?.exists) {
          const data = checkData.data as PhoneCheckResult;
          setExistingPhoneModal({
            phone: email,
            hcidDisplay: data.hcidDisplay,
            accountLabel: accountLabelFromCheck(data),
            suggestedAction: 'login_only',
            contactType: 'email',
          });
          return;
        }
      } else {
        const checkRes = await fetch('/api/v1/auth/check-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, intent: 'customer' }),
        });
        const checkData = await checkRes.json();
        if (checkData.success && checkData.data?.exists) {
          const data = checkData.data as PhoneCheckResult;
          setExistingPhoneModal({
            phone,
            hcidDisplay: data.hcidDisplay,
            accountLabel: accountLabelFromCheck(data),
            suggestedAction: 'login_only',
            contactType: 'phone',
          });
          return;
        }
      }

      const res = await fetch('/api/v1/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          useEmail
            ? { email, mode: 'register', intent: 'customer' }
            : { phone, mode: 'register', intent: 'customer' },
        ),
      });
      const data = await res.json();
      if (!data.success) { setApiError(data.error || 'Failed to send OTP'); return; }
      setStep('otp');
      startResendTimer();
      setTimeout(() => otpRefs[0].current?.focus(), 100);
    } catch { setApiError('Failed to send OTP. Please try again.'); }
    finally { setIsLoading(false); }
  };

  const handleVerifyOtp = async (code: string) => {
    if (code.length !== 4 || isLoading) return;
    setIsLoading(true);
    setApiError('');
    const phone = (profile.phone ?? profile.mobilePhone ?? '').replace(/\D/g, '').slice(-10);
    const email = (profile.email ?? '').trim().toLowerCase();
    const useEmail = EMAIL_REGISTER_ALLOWED && verifyChannel === 'email';
    const fullName = derivedFullName(profile);
    const businessName = derivedLegalName(profile);

    try {
      const result = await signIn('otp', {
        phone: useEmail ? '' : phone,
        loginEmail: useEmail ? email : '',
        code,
        fullName,
        businessName,
        email: profile.email?.trim() ?? '',
        password,
        role: 'customer',
        isRegister: 'true',
        redirect: false,
        salutation: profile.salutation ?? '',
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        designation: profile.designation ?? '',
        displayName: profile.displayName ?? '',
        tradeName: profile.displayName ?? '',
        businessType: profile.businessType ?? '',
        subType: profile.subType ?? '',
        cuisine: profile.cuisine ?? '',
        gstNumber: (profile.gstin ?? '').toUpperCase().trim(),
        panNumber: (profile.pan ?? '').toUpperCase().trim(),
        fssaiNumber: profile.fssaiNumber ?? '',
        gstTreatment: profile.gstTreatment ?? '',
        placeOfSupply: profile.placeOfSupply ?? '',
        addressLine: profile.addressLine ?? profile.billingAddressLine ?? '',
        flatInfo: profile.flatInfo ?? '',
        city: profile.city ?? profile.billingCity ?? '',
        state: profile.state ?? profile.billingState ?? '',
        pincode: profile.pincode ?? profile.billingPincode ?? '',
        outletName: profile.outletName ?? '',
        latitude: profile.latitude != null ? String(profile.latitude) : '',
        longitude: profile.longitude != null ? String(profile.longitude) : '',
        placeId: profile.placeId ?? '',
      });
      if (result?.error) {
        setApiError('Invalid or expired OTP. Please try again.');
        setOtp(['', '', '', '']);
        setTimeout(() => otpRefs[0].current?.focus(), 50);
      } else {
        setStep('success');
        setTimeout(() => goPostLogin(), 1200);
      }
    } catch { setApiError('Something went wrong. Please try again.'); }
    finally { setIsLoading(false); }
  };

  const handleOtpInput = (i: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      const next = ['', '', '', ''];
      for (let j = 0; j < digits.length; j++) next[j] = digits[j];
      setOtp(next);
      setApiError('');
      otpRefs[Math.min(digits.length, 3)]?.current?.focus();
      if (digits.length === 4) handleVerifyOtp(digits);
      return;
    }
    const digit = value.replace(/\D/g, '');
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    setApiError('');
    if (digit && i < 3) otpRefs[i + 1].current?.focus();
    if (digit && next.every(d => d)) handleVerifyOtp(next.join(''));
  };

  const registerOptionsHref = `/register${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`;

  if (!role || (role !== 'customer' && role !== 'vendor' && role !== 'brand')) {
    return <RegisterRolePicker redirectTo={redirectTo} />;
  }

  if (role === 'vendor' || role === 'brand') {
    return (
      <div className="flex items-center justify-center px-4 py-12 min-h-[calc(100vh-180px)]">
        <Loader2 size={28} className="animate-spin text-[#299E60]" />
      </div>
    );
  }

  if (step === 'success') {
    return (
      <CenteredCard>
        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={42} className="text-[#299E60]" strokeWidth={2.5} />
          </div>
          <h1 className="text-[24px] font-[800] text-gray-800 mb-2">Welcome to Horeca1!</h1>
          <p className="text-[14px] text-gray-500 flex items-center justify-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Signing you in…
          </p>
        </div>
      </CenteredCard>
    );
  }

  if (step === 'otp') {
    const phone = (profile.phone ?? profile.mobilePhone ?? '').replace(/\D/g, '').slice(-10);
    const email = (profile.email ?? '').trim().toLowerCase();
    const useEmail = EMAIL_REGISTER_ALLOWED && verifyChannel === 'email';
    return (
      <CenteredCard>
        <div className="p-6 sm:p-8">
          <button onClick={() => { setStep('form'); setOtp(['', '', '', '']); setApiError(''); }}
            className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-[#299E60] transition-colors mb-5 -ml-1">
            <ArrowLeft size={14} /> Back
          </button>
          <h1 className="text-[22px] font-[800] text-gray-800 mb-1 leading-tight">Enter verification code</h1>
          <p className="text-[13px] text-gray-400 mb-6">
            We sent a 4-digit code to{' '}
            <span className="font-bold text-gray-700">
              {useEmail
                ? email
                : `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`}
            </span>
          </p>
          {apiError && <ErrorBanner>{apiError}</ErrorBanner>}
          <div className="flex gap-3 justify-center my-6">
            {otp.map((digit, i) => (
              <input key={i} ref={otpRefs[i]} type="text" inputMode="numeric" maxLength={4}
                value={digit} onChange={e => handleOtpInput(i, e.target.value)}
                onKeyDown={e => { if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs[i - 1].current?.focus(); }}
                disabled={isLoading}
                className={cn(
                  'w-[58px] h-[58px] text-center text-[22px] font-[800] border-2 rounded-2xl outline-none transition-all',
                  digit ? 'border-[#299E60] bg-green-50/40 text-[#299E60] ring-2 ring-[#299E60]/10' : 'border-gray-200 bg-[#FAFAFA] focus:bg-white',
                  'focus:border-[#299E60] focus:ring-4 focus:ring-[#299E60]/10',
                  isLoading && 'opacity-60 cursor-not-allowed',
                )}
              />
            ))}
          </div>
          <button onClick={() => handleVerifyOtp(otp.join(''))} disabled={isLoading || otp.join('').length !== 4}
            className={cn(FORM.primaryBtn, 'w-full py-3.5')}>
            {isLoading && <Loader2 size={18} className="animate-spin" />}
            Verify &amp; Create Account
          </button>
          <div className="text-center mt-5">
            {resendTimer > 0 ? (
              <p className="text-[13px] text-gray-400">Resend code in <span className="font-bold text-gray-600">{resendTimer}s</span></p>
            ) : (
              <button onClick={handleSendOtp} disabled={isLoading} className="text-[13px] text-[#299E60] font-bold hover:underline disabled:opacity-50">
                Resend Code
              </button>
            )}
          </div>
        </div>
      </CenteredCard>
    );
  }

  return (
    <div className="flex items-start justify-center px-4 py-5 min-h-[calc(100vh-150px)]">
      <div className="w-full max-w-[1080px] rounded-[20px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-[#EEEEEE]">
        <div className="px-5 sm:px-7 pt-6 sm:pt-7 pb-5 border-b border-[#F5F5F5]">
          <Link
            href={registerOptionsHref}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-[#299E60] transition-colors mb-4"
          >
            <ArrowLeft size={14} /> All signup options
          </Link>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#299E60] mb-1">Customer signup</p>
              <h1 className="text-[clamp(1.25rem,2vw+0.5rem,1.5rem)] font-[800] text-[#181725] leading-tight">
                Create your account
              </h1>
              <p className="text-[13px] text-gray-500 mt-1">Sign up to start ordering for your business.</p>
            </div>
            <p className="text-[13px] text-gray-500 lg:text-right shrink-0">
              Already have an account?{' '}
              <Link href={`/login${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}
                className="text-[#299E60] font-[800] hover:underline">
                Login
              </Link>
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {apiError && <ErrorBanner>{apiError}</ErrorBanner>}

          {EMAIL_REGISTER_ALLOWED && (
            <div className="flex gap-2 mb-5 p-1 bg-gray-100 rounded-xl">
              {(['phone', 'email'] as const).map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => {
                    setVerifyChannel(ch);
                    setApiError('');
                  }}
                  className={cn(
                    'flex-1 py-2.5 rounded-lg text-[12px] font-bold transition-colors',
                    verifyChannel === ch
                      ? 'bg-white text-[#299E60] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {ch === 'phone' ? 'Verify via Mobile' : 'Verify via Email'}
                </button>
              ))}
            </div>
          )}

          <CustomerProfileForm
            value={profile}
            onChange={patchProfile}
            errors={fieldErrors}
            onFieldBlur={handleFieldBlur}
            layout="wide"
            visibleSections={{ contact: true, business: true, auth: true, tax: true, address: true }}
            collapsedSections={['tax', 'address']}
            showPassword
            password={password}
            onPasswordChange={setPassword}
            showPasswordToggle
            passwordVisible={showPassword}
            onTogglePassword={() => setShowPassword(v => !v)}
          />

          <div className="mt-6">
            <button onClick={handleSendOtp} disabled={isLoading} className={cn(FORM.primaryBtn, 'w-full h-[46px]')}>
              {isLoading && <Loader2 size={18} className="animate-spin" />}
              Send OTP
            </button>
          </div>
        </div>
      </div>

      <ExistingPhoneModal
        isOpen={!!existingPhoneModal}
        phone={existingPhoneModal?.phone ?? ''}
        hcidDisplay={existingPhoneModal?.hcidDisplay}
        accountLabel={existingPhoneModal?.accountLabel ?? 'Customer'}
        intent="customer"
        redirectTo={redirectTo || '/'}
        suggestedAction={existingPhoneModal?.suggestedAction ?? 'login_only'}
        contactType={existingPhoneModal?.contactType ?? 'phone'}
        onClose={() => setExistingPhoneModal(null)}
        onUseDifferentNumber={() => {
          setExistingPhoneModal(null);
          if (existingPhoneModal?.contactType === 'email') {
            patchProfile({ email: '' });
          } else {
            patchProfile({ phone: '', mobilePhone: '' });
          }
          setApiError('');
        }}
      />
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-4 py-12 min-h-[calc(100vh-180px)]">
      <div className="w-full max-w-[460px] bg-white rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-[#EEEEEE] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-[13px] text-red-600 font-medium">
      {children}
    </div>
  );
}
