'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface AdminCopyFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  copyLabel?: string;
  className?: string;
}

export function AdminCopyField({
  label,
  value,
  placeholder = '—',
  copyLabel,
  className = '',
}: AdminCopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const display = value || placeholder;
  const canCopy = Boolean(value);

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
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={display}
          className="flex-1 min-w-0 h-[38px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] px-3 text-[13px] font-semibold text-[#374151] outline-none"
        />
        <button
          type="button"
          onClick={handleCopy}
          disabled={!canCopy}
          title={`Copy ${label}`}
          className="h-[38px] w-[38px] shrink-0 border border-[#E5E7EB] rounded-[8px] flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {copied ? <Check size={14} className="text-[#299E60]" /> : <Copy size={14} className="text-[#7C7C7C]" />}
        </button>
      </div>
    </div>
  );
}
