'use client';

import React, { useState } from 'react';
import { X, Check, Copy, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export interface InviteMeta {
  tempPassword: string;
  loginIdentifier: string;
  loginUrl: string;
  credentialsDelivered: { email: boolean; sms: boolean };
}

interface InviteSuccessModalProps {
  inviteMeta: InviteMeta;
  memberName?: string;
  onClose: () => void;
}

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`);
  }
}

export function InviteSuccessModal({ inviteMeta, memberName, onClose }: InviteSuccessModalProps) {
  const { tempPassword, loginIdentifier, loginUrl, credentialsDelivered } = inviteMeta;
  const deliveryFailed = !credentialsDelivered.email && !credentialsDelivered.sms;

  return (
    <div className="fixed inset-0 z-[16000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[20px] w-full max-w-[480px] shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#ECFDF5] flex items-center justify-center">
              <Check size={16} className="text-[#299E60]" />
            </div>
            <h3 className="text-[16px] font-bold text-[#181725]">Member added</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-gray-100 transition-colors">
            <X size={16} className="text-[#7C7C7C]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[13px] text-[#4B5563] leading-relaxed">
            {memberName ? (
              <><strong>{memberName}</strong> has been added to your team.</>
            ) : (
              <>The team member has been added.</>
            )}
            {' '}Share the login details below if they do not receive the invitation automatically.
          </p>

          {deliveryFailed && (
            <div className="flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-100 rounded-[10px] p-3">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>Email/SMS could not be sent. Copy the credentials below and share them directly.</span>
            </div>
          )}

          <div className="space-y-3 rounded-[12px] border border-[#EEEEEE] bg-[#FAFAFA] p-4">
            <CredentialRow label="Login URL" value={loginUrl} onCopy={() => copyText('Login URL', loginUrl)} />
            <CredentialRow label="Email / Phone" value={loginIdentifier} onCopy={() => copyText('Login ID', loginIdentifier)} />
            <CredentialRow label="Password" value={tempPassword} onCopy={() => copyText('Password', tempPassword)} mono />
          </div>

          <p className="text-[11px] text-[#9CA3AF]">
            They can sign in with email + password, or with their mobile number via OTP after first login.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-[#F0F0F0] bg-[#FAFAFA] rounded-b-[20px]">
          <button
            onClick={onClose}
            className="w-full h-[42px] bg-[#299E60] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#238a54] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function CredentialRow({
  label, value, onCopy, mono,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`flex-1 text-[13px] text-[#181725] break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 p-1.5 rounded-[8px] border border-[#EEEEEE] hover:bg-white transition-colors"
          title={`Copy ${label}`}
        >
          <Copy size={14} className="text-[#7C7C7C]" />
        </button>
      </div>
    </div>
  );
}
