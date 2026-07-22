'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, AtSign, Mail, Loader2, ArrowLeft, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { FormErrorBanner } from '@/components/ui/form';
import { toast } from 'sonner';
import { signIn } from 'next-auth/react';
import { clearPostLoginPickerState } from '@/lib/postLoginPicker';

interface LoginOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

const RESEND_COOLDOWN = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function looksLikeEmail(s: string) {
  return s.includes('@') || /[a-zA-Z]/.test(s);
}

export function LoginOverlay({ isOpen, onClose, onLoginSuccess }: LoginOverlayProps) {
  const router = useRouter();
  const [step, setStep] = useState<'identifier' | 'otp'>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState<string[]>(['', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const showError = useCallback((msg: string) => {
    setError(msg);
    toast.error(msg);
  }, []);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

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

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep('identifier');
      setIdentifier('');
      setOtp(['', '', '', '']);
      setError('');
      setResendTimer(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }, 300);
  };

  if (!isOpen) return null;

  const trimmedId = identifier.trim();
  const isEmail = looksLikeEmail(trimmedId);
  const rawDigits = trimmedId.replace(/\D/g, '');
  const hasCountryCodePrefix = trimmedId.startsWith('+91') || rawDigits.length === 12;
  const phoneDigits = (hasCountryCodePrefix ? rawDigits.replace(/^91/, '') : rawDigits).slice(0, 10);

  const handleSendOtp = async () => {
    setError('');
    if (!trimmedId) { setError('Enter your mobile number or email'); return; }
    if (isEmail) {
      if (!EMAIL_RE.test(trimmedId.toLowerCase())) { setError('Enter a valid email address'); return; }
    } else {
      if (!/^\d{10}$/.test(phoneDigits)) { setError('Enter a valid 10-digit mobile number'); return; }
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
      if (!data.success) { showError(data.error || 'Failed to send OTP'); return; }
      setStep('otp');
      startResendTimer();
      setTimeout(() => otpRefs[0].current?.focus(), 100);
    } catch { showError('Failed to send OTP. Please try again.'); }
    finally { setIsLoading(false); }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      const next = ['', '', '', ''];
      for (let i = 0; i < digits.length; i++) next[i] = digits[i];
      setOtp(next);
      setError('');
      const focusIdx = Math.min(digits.length, 3);
      otpRefs[focusIdx]?.current?.focus();
      if (digits.length === 4) handleVerifyOtp(digits);
      return;
    }
    const digit = value.replace(/\D/g, '');
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setError('');
    if (digit && index < 3) otpRefs[index + 1].current?.focus();
    if (digit && next.every(d => d)) handleVerifyOtp(next.join(''));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs[index - 1].current?.focus();
  };

  const handleVerifyOtp = async (code: string) => {
    if (code.length !== 4 || isLoading) return;
    setIsLoading(true);
    setError('');
    try {
      const result = await signIn('otp', {
        phone: isEmail ? '' : phoneDigits,
        loginEmail: isEmail ? trimmedId.toLowerCase() : '',
        code,
        fullName: '',
        businessName: '',
        role: 'customer',
        isRegister: 'false',
        redirect: false,
      });
      if (result?.error) {
        showError('Invalid or expired OTP. Please try again.');
        setOtp(['', '', '', '']);
        setTimeout(() => otpRefs[0].current?.focus(), 50);
      } else {
        clearPostLoginPickerState();
        router.refresh();
        onLoginSuccess();
      }
    } catch { showError('Something went wrong. Please try again.'); }
    finally { setIsLoading(false); }
  };

  const sentToLabel = isEmail
    ? trimmedId.toLowerCase()
    : `+91 ${phoneDigits.slice(0, 5)} ${phoneDigits.slice(5)}`;

  return (
    <>
      <div className="fixed inset-0 z-[13000] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={handleClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[13001] animate-in slide-in-from-bottom duration-300">
        <div className="bg-white rounded-t-[28px] px-6 pt-4 pb-10 max-w-md mx-auto w-full shadow-2xl">
          <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-5" />

          <div className="flex items-center justify-between mb-6">
            {step === 'otp' ? (
              <button onClick={() => { setStep('identifier'); setOtp(['', '', '', '']); setError(''); }}
                className="flex items-center gap-2 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
                <ArrowLeft size={16} /> Back
              </button>
            ) : (
              <h2 className="text-[20px] font-[800] text-[#181725]">Quick Login</h2>
            )}
            <button onClick={handleClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          <FormErrorBanner message={error || null} className="mb-4 text-center [&_span]:w-full" />

          {step === 'identifier' ? (
            <>
              <label className="text-[13px] font-semibold text-gray-400 ml-1 tracking-tight">
                Mobile Number or Email
              </label>
              <div className="relative mt-1.5 mb-5 flex items-center">
                {isEmail ? (
                  <Mail size={18} className="absolute left-4 text-[#53B175] pointer-events-none" />
                ) : trimmedId.length > 0 ? (
                  <span className="absolute left-4 text-[14px] font-bold text-gray-500 select-none">+91</span>
                ) : (
                  <AtSign size={18} className="absolute left-4 text-gray-300 pointer-events-none" />
                )}
                <input type="text" autoFocus inputMode={isEmail ? 'email' : 'text'} autoComplete="username"
                  value={identifier}
                  onChange={e => { setIdentifier(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                  placeholder="Phone or email"
                  className={cn(
                    'w-full pr-4 py-3.5 bg-[#F7F8FA] border border-gray-100 rounded-xl text-[14px] font-bold outline-none focus:border-[#53B175] focus:bg-white transition-all',
                    isEmail || trimmedId.length > 0 ? 'pl-14' : 'pl-12',
                  )}
                />
              </div>
              <button onClick={handleSendOtp} disabled={isLoading}
                className={cn('w-full bg-[#53B175] text-white font-bold py-4 rounded-xl shadow-lg shadow-green-100 active:scale-[0.98] transition-all text-[15px] flex items-center justify-center gap-2',
                  isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#48a068]')}>
                {isLoading && <Loader2 size={18} className="animate-spin" />}
                Send OTP
              </button>
              <p className="text-[13px] text-gray-400 text-center mt-5">
                New here?{' '}
                <button onClick={handleClose} className="text-[#53B175] font-bold">Register</button>
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] text-gray-400 text-center mb-6">
                Code sent to <span className="font-bold text-gray-700">{sentToLabel}</span>
                <button
                  type="button"
                  onClick={() => { setStep('identifier'); setOtp(['', '', '', '']); setError(''); }}
                  className="inline-flex items-center gap-1 ml-2 align-baseline text-[12px] font-bold text-[#53B175] hover:underline"
                >
                  <Pencil size={12} /> Edit
                </button>
              </p>
              <div className="flex gap-3 justify-center mb-6">
                {otp.map((digit, i) => (
                  <input key={i} ref={otpRefs[i]} type="text" inputMode="numeric" maxLength={4}
                    value={digit} onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)} disabled={isLoading}
                    className={cn('w-14 h-14 text-center text-[22px] font-[800] border-2 rounded-2xl outline-none transition-all',
                      digit ? 'border-[#53B175] bg-green-50 text-[#53B175]' : 'border-gray-200 bg-[#F7F8FA]',
                      'focus:border-[#53B175]',
                      isLoading && 'opacity-60')}
                  />
                ))}
              </div>
              <button onClick={() => handleVerifyOtp(otp.join(''))} disabled={isLoading || otp.join('').length !== 4}
                className={cn('w-full bg-[#53B175] text-white font-bold py-4 rounded-xl shadow-lg shadow-green-100 active:scale-[0.98] transition-all text-[15px] flex items-center justify-center gap-2',
                  (isLoading || otp.join('').length !== 4) ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#48a068]')}>
                {isLoading && <Loader2 size={18} className="animate-spin" />}
                Verify & Sign In
              </button>
              <div className="text-center mt-4">
                {resendTimer > 0 ? (
                  <p className="text-[12px] text-gray-400">Resend in <span className="font-bold">{resendTimer}s</span></p>
                ) : (
                  <button onClick={handleSendOtp} disabled={isLoading} className="text-[13px] text-[#53B175] font-bold hover:underline">
                    Resend OTP
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
