'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import {
  AtSign, Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  prepareFreshLoginNavigation,
  resolvePostLoginDestination,
  sanitizeRedirect,
} from '@/lib/postLoginPicker';
import type { AccountPortalCaps } from '@/lib/portalRouting';

const RESEND_COOLDOWN = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function looksLikeEmail(s: string) {
  return s.includes('@') || /[a-zA-Z]/.test(s);
}

type Step = 'form' | 'otp';

export default function LoginPageInner() {
  const params = useSearchParams();
  const redirectTo = sanitizeRedirect(
    params?.get('redirect') || params?.get('callbackUrl') || null,
  );
  // Pre-fill the phone/email field when callers (vendor register success
  // screen, etc.) pass ?phone= or ?email= — saves the user retyping the
  // number they just verified.
  const prefilledPhone = params?.get('phone')?.replace(/\D/g, '').slice(0, 10) ?? '';
  const prefilledEmail = params?.get('email') ?? '';
  const { data: session, status: sessionStatus } = useSession();

  const [step, setStep] = useState<Step>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Already signed in — land on explicit redirect or role/portal default.
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    const caps = (session?.user?.activeBusinessAccountType as AccountPortalCaps | null | undefined)
      ?? (session?.user?.role === 'vendor'
        ? { isCustomer: false, isVendor: true, isBrand: false }
        : session?.user?.role === 'brand'
          ? { isCustomer: false, isVendor: false, isBrand: true }
          : session?.user?.role === 'customer'
            ? { isCustomer: true, isVendor: false, isBrand: false }
            : null);
    window.location.href = resolvePostLoginDestination(redirectTo, caps);
  }, [sessionStatus, redirectTo, session?.user?.activeBusinessAccountType, session?.user?.role]);

  const [identifier, setIdentifier] = useState(prefilledPhone || prefilledEmail);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [otp, setOtp] = useState<string[]>(['', '', '', '']);
  const otpRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const trimmedId = identifier.trim();
  const isEmail = looksLikeEmail(trimmedId);
  const rawDigits = trimmedId.replace(/\D/g, '');
  const hasCountryCode = trimmedId.startsWith('+91') || rawDigits.length === 12;
  const phoneDigits = (hasCountryCode ? rawDigits.replace(/^91/, '') : rawDigits).slice(0, 10);

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

  // Hard-navigate so the new session cookie is picked up by SSR.
  const goPostLogin = useCallback(async () => {
    await prepareFreshLoginNavigation(redirectTo);
  }, [redirectTo]);

  const handleSendOtp = async () => {
    setApiError('');
    if (!trimmedId) { setApiError('Enter your mobile number or email'); return; }
    if (isEmail) {
      if (!EMAIL_RE.test(trimmedId.toLowerCase())) { setApiError('Enter a valid email address'); return; }
    } else if (!/^\d{10}$/.test(phoneDigits)) {
      setApiError('Enter a valid 10-digit mobile number'); return;
    }
    setIsLoading(true);
    try {
      const body = isEmail
        ? { email: trimmedId.toLowerCase(), mode: 'login' }
        : { phone: phoneDigits, mode: 'login' };
      const res = await fetch('/api/v1/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.code === 'NO_ACCOUNT') {
          setApiError('No account found. ');
        } else {
          setApiError(data.error || 'Failed to send OTP');
        }
        return;
      }
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
    try {
      const result = await signIn('otp', {
        phone: isEmail ? '' : phoneDigits,
        loginEmail: isEmail ? trimmedId.toLowerCase() : '',
        code,
        isRegister: 'false',
        redirect: false,
      });
      if (result?.error) {
        setApiError('Invalid or expired OTP. Please try again.');
        setOtp(['', '', '', '']);
        setTimeout(() => otpRefs[0].current?.focus(), 50);
      } else {
        await goPostLogin();
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

  const handlePasswordLogin = async () => {
    setApiError('');
    if (!trimmedId) { setApiError('Enter your phone or email'); return; }
    if (isEmail) {
      if (!EMAIL_RE.test(trimmedId.toLowerCase())) { setApiError('Enter a valid email address'); return; }
    } else if (!/^\d{10}$/.test(phoneDigits)) {
      setApiError('Enter a valid 10-digit mobile number'); return;
    }
    if (!password) { setApiError('Enter your password'); return; }
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email: isEmail ? trimmedId.toLowerCase() : phoneDigits,
        password,
        redirect: false,
      });
      if (result?.error) setApiError('Invalid credentials');
      else await goPostLogin();
    } catch { setApiError('Something went wrong.'); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="flex flex-col">
      <main className="flex items-center justify-center px-4 py-8 md:py-10">
        <div className="w-full max-w-[420px] bg-white md:rounded-2xl md:shadow-xl md:p-8 p-2">
          {step === 'otp' ? (
            <>
              <button onClick={() => { setStep('form'); setOtp(['', '', '', '']); setApiError(''); }}
                className="flex items-center gap-2 text-[13px] text-gray-400 hover:text-gray-600 mb-4 -ml-1">
                <ArrowLeft size={15} /> Back
              </button>
              <h1 className="text-[22px] font-bold text-gray-800 mb-1">Enter OTP</h1>
              <p className="text-[13px] text-gray-400 mb-6">
                Code sent to{' '}
                <span className="font-bold text-gray-700">
                  {isEmail ? trimmedId.toLowerCase() : `+91 ${phoneDigits.slice(0, 5)} ${phoneDigits.slice(5)}`}
                </span>
                <button
                  type="button"
                  onClick={() => { setStep('form'); setOtp(['', '', '', '']); setApiError(''); }}
                  className="inline-flex items-center gap-1 ml-2 align-baseline text-[12px] font-bold text-[#53B175] hover:underline"
                >
                  <Pencil size={12} /> Edit
                </button>
              </p>

              {apiError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-[13px] text-red-600 font-medium">
                  {apiError}
                </div>
              )}

              <div className="flex gap-3 justify-center my-6">
                {otp.map((digit, i) => (
                  <input key={i} ref={otpRefs[i]} type="text" inputMode="numeric" maxLength={4}
                    value={digit} onChange={e => handleOtpInput(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs[i - 1].current?.focus(); }}
                    disabled={isLoading}
                    className={cn(
                      'w-[60px] h-[60px] text-center text-[24px] font-[800] border-2 rounded-xl outline-none transition-all',
                      digit ? 'border-[#53B175] bg-green-50 text-[#53B175]' : 'border-gray-200 bg-white',
                      'focus:border-[#53B175]',
                      isLoading && 'opacity-60 cursor-not-allowed',
                    )}
                  />
                ))}
              </div>

              <button onClick={() => handleVerifyOtp(otp.join(''))} disabled={isLoading || otp.join('').length !== 4}
                className="w-full bg-[#53B175] hover:bg-[#48a068] text-white font-bold py-3 rounded-lg shadow-md shadow-green-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isLoading && <Loader2 size={18} className="animate-spin" />}
                Verify & Sign In
              </button>

              <div className="text-center mt-5">
                {resendTimer > 0 ? (
                  <p className="text-[13px] text-gray-400">Resend OTP in <span className="font-bold text-gray-600">{resendTimer}s</span></p>
                ) : (
                  <button onClick={handleSendOtp} disabled={isLoading} className="text-[13px] text-[#53B175] font-bold hover:underline disabled:opacity-50">
                    Resend OTP
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h1 className="text-[24px] font-[800] text-gray-800 mb-2">Login to your Account</h1>
              <p className="text-[13px] text-gray-500 mb-6">Sign in with your mobile or email.</p>

              {apiError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-[13px] text-red-600 font-medium">
                  {apiError}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-500 ml-1">Mobile Number or Email</label>
                  <div className="relative flex items-center">
                    {isEmail ? (
                      <Mail size={18} className="absolute left-4 text-[#53B175] pointer-events-none" />
                    ) : trimmedId.length > 0 ? (
                      <span className="absolute left-4 text-[14px] font-bold text-gray-500 select-none z-10">+91</span>
                    ) : (
                      <AtSign size={18} className="absolute left-4 text-gray-300 pointer-events-none" />
                    )}
                    <input type="text" inputMode={isEmail ? 'email' : 'text'} autoComplete="username"
                      value={identifier}
                      onChange={e => { setIdentifier(e.target.value); setApiError(''); }}
                      onKeyDown={e => e.key === 'Enter' && (usePassword ? handlePasswordLogin() : handleSendOtp())}
                      placeholder="Phone or email" autoFocus
                      className={cn(
                        'w-full pr-4 py-3.5 bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-[#53B175] transition-colors',
                        isEmail || trimmedId.length > 0 ? 'pl-14' : 'pl-12',
                      )}
                    />
                  </div>
                </div>

                {usePassword && (
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-500 ml-1">Password</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#53B175]" />
                      <input type={showPassword ? 'text' : 'password'} value={password}
                        onChange={e => { setPassword(e.target.value); setApiError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()}
                        placeholder="Enter password" autoComplete="current-password"
                        className="w-full pl-12 pr-12 py-3.5 bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-[#53B175] transition-colors" />
                      <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={usePassword ? handlePasswordLogin : handleSendOtp}
                disabled={isLoading}
                className="w-full bg-[#53B175] hover:bg-[#48a068] text-white font-bold py-3.5 rounded-lg shadow-md shadow-green-100 mt-6 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isLoading && <Loader2 size={18} className="animate-spin" />}
                {usePassword ? 'Sign in' : 'Send OTP'}
              </button>

              <button
                type="button"
                onClick={() => { setUsePassword(v => !v); setApiError(''); setPassword(''); }}
                className="mt-4 text-[13px] text-[#53B175] font-bold hover:underline mx-auto block">
                {usePassword ? 'Use OTP instead' : 'Have a password? Sign in with password'}
              </button>

              <div className="mt-6 pt-5 border-t border-gray-100 text-center">
                <p className="text-[13px] text-gray-500">
                  Don&apos;t have an account?{' '}
                  <Link
                    href={`/register${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}
                    className="text-[#53B175] font-[800] hover:underline"
                  >
                    Register
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
