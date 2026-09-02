'use client';

import Link from 'next/link';
import { X, Phone, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FORM } from '@/components/ui/form';

export type ExistingPhoneIntent = 'vendor' | 'brand' | 'customer';

interface ExistingPhoneModalProps {
  isOpen: boolean;
  phone: string;
  hcidDisplay?: string;
  accountLabel: string;
  intent: ExistingPhoneIntent;
  redirectTo: string;
  suggestedAction: 'login_to_link' | 'login_only';
  contactType?: 'phone' | 'email';
  onClose: () => void;
  onUseDifferentNumber: () => void;
}

function intentCopy(
  intent: ExistingPhoneIntent,
  accountLabel: string,
  phone: string,
  contactType: 'phone' | 'email',
): { title: string; body: string; cta: string; contactLabel: string; useDifferent: string } {
  const digits = phone.replace(/\D/g, '').slice(-10);
  const masked = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
  const contactWord = contactType === 'email' ? 'email address' : 'mobile number';
  const contactLabel = contactType === 'email' ? 'Email' : 'Mobile';
  const useDifferent = contactType === 'email' ? 'Use a different email' : 'Use a different number';

  if (intent === 'vendor') {
    return {
      title: `This ${contactWord} is already registered`,
      body: `This ${contactWord} is already linked to an existing account as a ${accountLabel}. Log in to register a new supplier business under your HCID.`,
      cta: 'Log in & continue supplier setup',
      contactLabel,
      useDifferent,
    };
  }
  if (intent === 'brand') {
    return {
      title: `This ${contactWord} is already registered`,
      body: `This ${contactWord} is already linked to an existing account as a ${accountLabel}. Log in to add a brand business under your HCID.`,
      cta: 'Log in & continue brand setup',
      contactLabel,
      useDifferent,
    };
  }
  return {
    title: 'You already have an account',
    body: contactType === 'email'
      ? `This email (${phone}) is already registered as a ${accountLabel}. Log in instead of creating a duplicate account.`
      : `This mobile number (${masked}) is already registered as a ${accountLabel}. Log in instead of creating a duplicate account.`,
    cta: 'Log in to your account',
    contactLabel,
    useDifferent,
  };
}

export function ExistingPhoneModal({
  isOpen,
  phone,
  hcidDisplay,
  accountLabel,
  intent,
  redirectTo,
  suggestedAction,
  contactType = 'phone',
  onClose,
  onUseDifferentNumber,
}: ExistingPhoneModalProps) {
  if (!isOpen) return null;

  const digits = phone.replace(/\D/g, '').slice(-10);
  const loginQs = new URLSearchParams();
  if (contactType === 'email') loginQs.set('email', phone.trim().toLowerCase());
  else if (digits) loginQs.set('phone', digits);
  if (redirectTo) loginQs.set('redirect', redirectTo);
  const loginHref = `/login?${loginQs.toString()}`;

  const copy = intentCopy(intent, accountLabel, phone, contactType);
  const showHcid = !!hcidDisplay;

  return (
    <div className="fixed inset-0 z-[14000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-[20px] w-full max-w-[480px] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-gray-100 animate-in zoom-in-95 duration-150">
        <div className="p-6 border-b border-gray-100 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
            <Phone size={22} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[17px] font-[800] text-[#181725] leading-snug">{copy.title}</h3>
            <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{copy.body}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-400 hover:text-gray-700" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-[#EEEEEE] bg-[#FAFAFA] px-4 py-3 space-y-2">
            <div className="flex justify-between gap-3 text-[12px]">
              <span className="text-gray-400 font-bold uppercase tracking-wider">{copy.contactLabel}</span>
              <span className="font-bold text-gray-800 text-right break-all">
                {contactType === 'email'
                  ? phone
                  : `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`}
              </span>
            </div>
            {showHcid && (
              <div className="flex justify-between gap-3 text-[12px]">
                <span className="text-gray-400 font-bold uppercase tracking-wider">HCID</span>
                <span className="font-bold text-primary tracking-wider">{hcidDisplay}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 text-[12px]">
              <span className="text-gray-400 font-bold uppercase tracking-wider">Account type</span>
              <span className="font-bold text-gray-800">{accountLabel}</span>
            </div>
          </div>

          {suggestedAction === 'login_only' && intent === 'customer' && (
            <p className="text-[12px] text-gray-500 leading-relaxed">
              If you forgot your password, use OTP login on the next screen.
            </p>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 bg-gray-50/50">
          <button
            type="button"
            onClick={onUseDifferentNumber}
            className="px-5 py-2.5 text-[13px] font-bold text-gray-500 hover:bg-gray-100/80 rounded-xl transition-all"
          >
            {copy.useDifferent}
          </button>
          <Link
            href={loginHref}
            className={cn(FORM.primaryBtn, 'px-6 py-2.5 text-[13px] justify-center shadow-primary/10')}
          >
            {copy.cta}
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
