'use client';

import { useState } from 'react';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AdminCopyFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  copyLabel?: string;
  className?: string;
  /** When true, value is shown in plain text by default with an eye toggle to mask. */
  passwordMode?: boolean;
  /** Monospace styling for secrets. */
  mono?: boolean;
}

export function AdminCopyField({
  label,
  value,
  placeholder = '—',
  copyLabel,
  className = '',
  passwordMode = false,
  mono = false,
}: AdminCopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const [masked, setMasked] = useState(false);
  const canCopy = Boolean(value);
  const display = !value
    ? placeholder
    : passwordMode && masked
      ? '•'.repeat(Math.min(Math.max(value.length, 8), 24))
      : value;

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${copyLabel ?? label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className={className}>
      <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          readOnly
          value={display}
          className={cn(
            'flex-1 min-w-0 h-[38px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] px-3 text-[13px] font-semibold text-[#374151] outline-none',
            (mono || passwordMode) && 'font-mono tracking-wide',
            !value && 'text-[#9CA3AF] font-medium',
          )}
        />
        {passwordMode && value && (
          <button
            type="button"
            onClick={() => setMasked((m) => !m)}
            title={masked ? 'Show password' : 'Hide password'}
            className="h-[38px] w-[38px] shrink-0 border border-[#E5E7EB] rounded-[8px] flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            {masked ? <Eye size={14} className="text-[#7C7C7C]" /> : <EyeOff size={14} className="text-[#7C7C7C]" />}
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          disabled={!canCopy}
          title={`Copy ${label}`}
          className="h-[38px] w-[38px] shrink-0 border border-[#E5E7EB] rounded-[8px] flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {copied ? <Check size={14} className="text-[#6B1D2E]" /> : <Copy size={14} className="text-[#7C7C7C]" />}
        </button>
      </div>
    </div>
  );
}
