'use client';

import React, { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface AdminVerifyPartnerButtonProps {
  vendorId: string;
  onVerified?: () => void;
  compact?: boolean;
  className?: string;
}

export function AdminVerifyPartnerButton({
  vendorId,
  onVerified,
  compact = false,
  className,
}: AdminVerifyPartnerButtonProps) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    const ok = await confirm({
      title: 'Approve vendor?',
      message:
        'Approve this vendor partner without opening the detail page? They will be marked as verified immediately.',
      confirmText: 'Approve',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVerified: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(
          (typeof json?.error === 'object' && json?.error?.message)
          || (typeof json?.error === 'string' ? json.error : 'Failed to verify vendor'),
        );
      }
      toast.success('Vendor verified');
      onVerified?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to verify vendor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={(e) => {
        e.stopPropagation();
        void handleVerify();
      }}
      className={cn(
        compact ? 'h-[34px] px-3' : 'h-[36px] px-4',
        'bg-white text-amber-700 border border-amber-400 hover:bg-amber-50 rounded-[10px] text-[12px] font-bold transition-all flex items-center justify-center gap-1 whitespace-nowrap disabled:opacity-60',
        className,
      )}
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <ShieldCheck size={12} />
      )}
      Review &amp; Verify
    </button>
  );
}
