'use client';

import { useState } from 'react';
import { KeyRound, X, AlertCircle, Loader2, Shuffle, Copy, Check } from 'lucide-react';
import { PasswordField, FormErrorBanner, useFormFeedback } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';

interface Props {
  member: { user: { fullName: string; email: string | null; phone: string | null } };
  passwordEndpoint: string;
  accent: string;
  onClose: () => void;
  showGenerate?: boolean;
  onSuccess?: (password: string) => void;
}

function generatePassword(): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function ResetPasswordModal({ member, passwordEndpoint, accent, onClose, showGenerate = false, onSuccess }: Props) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { bannerError, clearErrors, applyApiError, applyValidationErrors } = useFormFeedback();
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    const next = generatePassword();
    setPassword(next);
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      applyValidationErrors({ _server: 'Could not copy to clipboard' }, 'Could not copy to clipboard');
    }
  };

  const handleSubmit = async () => {
    if (password.length < 6) {
      applyValidationErrors({ password: 'Password must be at least 6 characters' }, 'Password must be at least 6 characters', { dataField: true });
      return;
    }
    try {
      setSubmitting(true);
      clearErrors();
      const res = await fetch(passwordEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await parseJsonResponse(res);
      if (!json.success) {
        applyApiError(json, { fieldOrder: ['password'], dataField: true });
        return;
      }
      onSuccess?.(password);
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed';
      applyValidationErrors({ _server: msg }, msg);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[400px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <KeyRound size={18} style={{ color: accent }} />
            <h3 className="text-[16px] font-bold text-[#181725]">Reset Password</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={16} className="text-[#7C7C7C]" /></button>
        </div>
        <FormErrorBanner message={bannerError} className="mb-4" />
        {done ? (
          <div className="text-center py-4">
            <p className="text-[14px] font-bold text-success mb-1">Password updated</p>
            <p className="text-[12px] text-[#7C7C7C] mb-4">{member.user.fullName} can now log in with the new password.</p>
            <button onClick={onClose} className="px-6 py-2 text-white rounded-[10px] text-[13px] font-bold" style={{ backgroundColor: accent }}>Done</button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] text-[#7C7C7C]">
              Setting a new password for <span className="font-bold text-[#181725]">{member.user.fullName}</span>{' '}
              ({member.user.email ?? member.user.phone}).
            </p>
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-[8px] p-2.5">
              This logs the user out of all active sessions.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">New Password</label>
              <div className="flex gap-2">
                <PasswordField
                  autoComplete="new-password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Min. 6 characters"
                  wrapperClassName="flex-1"
                  inputClassName="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none bg-[#FAFAFA] focus:bg-white transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
                {showGenerate && (
                  <>
                    <button type="button" onClick={handleGenerate} title="Generate password"
                      className="h-[44px] w-[44px] shrink-0 border border-[#EEEEEE] rounded-[10px] flex items-center justify-center hover:bg-gray-50">
                      <Shuffle size={16} className="text-[#7C7C7C]" />
                    </button>
                    <button type="button" onClick={handleCopy} disabled={!password} title="Copy password"
                      className="h-[44px] w-[44px] shrink-0 border border-[#EEEEEE] rounded-[10px] flex items-center justify-center hover:bg-gray-50 disabled:opacity-40">
                      {copied ? <Check size={16} className="text-success" /> : <Copy size={16} className="text-[#7C7C7C]" />}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={handleSubmit} disabled={submitting || password.length < 6}
                className="flex-1 h-[44px] text-white rounded-[10px] text-[13px] font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                style={{ backgroundColor: accent }}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                {submitting ? 'Saving…' : 'Set Password'}
              </button>
              <button onClick={onClose} className="h-[44px] px-6 bg-gray-100 text-[#7C7C7C] rounded-[10px] text-[13px] font-bold hover:bg-gray-200 transition-colors">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
