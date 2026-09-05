'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { CDL } from '@/lib/cdl';
import { useStableSession } from '@/hooks/useStableSession';
import { useBusinessAccountSwitcher, type AccountSummary } from '@/hooks/useBusinessAccountSwitcher';

type Variant = 'desktop' | 'mobile';

type AccountKind = 'customer' | 'vendor' | 'brand';

const KIND_STYLE: Record<AccountKind, { label: string; color: string; bg: string }> = {
  customer: { label: 'Customer', color: CDL.info, bg: CDL.infoLight },
  vendor:   { label: 'Supplier', color: CDL.primary, bg: CDL.primaryLight },
  brand:    { label: 'Brand',    color: '#7C3AED', bg: '#EDE9FE' },
};

function classifyAccount(a: { isVendor: boolean; isBrand: boolean }): AccountKind {
  if (a.isVendor) return 'vendor';
  if (a.isBrand) return 'brand';
  return 'customer';
}

function accountLabel(a: AccountSummary): string {
  return a.displayName ?? a.legalName;
}

function BusinessChipSkeleton({ variant }: { variant: Variant }) {
  if (variant === 'mobile') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm w-full justify-center animate-pulse"
        aria-hidden
      >
        <div className="w-[13px] h-[13px] rounded-full bg-gray-200 shrink-0" />
        <div className="h-3 w-[90px] rounded bg-gray-200" />
        <div className="w-[13px] h-[13px] rounded bg-gray-200 shrink-0" />
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 shrink-0 w-[195px] animate-pulse"
      aria-hidden
    >
      <div className="w-[15px] h-[15px] rounded-full bg-gray-200 shrink-0" />
      <div className="flex flex-col items-start min-w-0 flex-1 gap-1.5">
        <div className="h-2 w-12 rounded bg-gray-200" />
        <div className="h-3 w-20 rounded bg-gray-200" />
      </div>
      <div className="w-3 h-3 rounded bg-gray-200 shrink-0" />
    </div>
  );
}

export function NavBusinessSelector({ variant }: { variant: Variant }) {
  const { isResolved, isAuthenticated } = useStableSession();
  const {
    accounts,
    currentAccount,
    loading,
    switching,
    switchAccount,
    customerImpersonating,
    vendorImpersonating,
  } = useBusinessAccountSwitcher();
  const [open, setOpen] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const switchable = isAuthenticated
    && !customerImpersonating
    && !vendorImpersonating
    && accounts.length > 1;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const settling = !isResolved || (isAuthenticated && loading);
  if (!switchable && !settling) return null;
  if (settling && accounts.length <= 1) return null;
  if (settling && !currentAccount) {
    return <BusinessChipSkeleton variant={variant} />;
  }
  if (!switchable || !currentAccount) return null;

  const label = accountLabel(currentAccount);

  const handlePick = async (id: string) => {
    if (id === currentAccount.id) {
      setOpen(false);
      return;
    }
    setPickingId(id);
    try {
      await switchAccount(id);
      setOpen(false);
    } finally {
      setPickingId(null);
    }
  };

  if (variant === 'mobile') {
    return (
      <div ref={ref} className="relative w-full">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={switching}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm hover:bg-gray-100 transition-colors w-full justify-center"
        >
          <Building2 size={13} className="text-primary shrink-0" />
          <span className="text-[12px] font-bold text-gray-700 truncate max-w-[140px]">{label}</span>
          <ChevronDown size={13} className="text-gray-400 shrink-0" />
        </button>
        {open && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-[10500] p-1.5 max-h-[min(60vh,320px)] overflow-y-auto">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 sticky top-0 bg-white">
              Switch business
            </p>
            {accounts.map((a) => {
              const k = classifyAccount(a);
              const style = KIND_STYLE[k];
              const isCurrent = a.id === currentAccount.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handlePick(a.id)}
                  disabled={switching || pickingId !== null}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left disabled:opacity-60"
                >
                  {pickingId === a.id
                    ? <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                    : null}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold truncate">{accountLabel(a)}</p>
                    <p className="text-[10px] font-semibold" style={{ color: style.color }}>{style.label}</p>
                  </div>
                  {isCurrent && <Check size={12} className="text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="flex items-center gap-2.5 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer shrink-0 w-[195px]"
      >
        <Building2 size={15} className="text-primary shrink-0" />
        <div className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider leading-none">Acting as</span>
          <span className="text-[12px] font-bold text-gray-800 truncate leading-tight mt-0.5 w-full text-left">
            {label}
          </span>
        </div>
        <ChevronDown size={12} className="text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[10500] w-[240px] p-2 max-h-[min(60vh,360px)] overflow-y-auto">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 sticky top-0 bg-white">
            Switch business
          </p>
          {accounts.map((a) => {
            const k = classifyAccount(a);
            const style = KIND_STYLE[k];
            const isCurrent = a.id === currentAccount.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handlePick(a.id)}
                disabled={switching || pickingId !== null}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 text-left disabled:opacity-60 transition-colors"
              >
                {pickingId === a.id
                  ? <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                  : (
                    <div
                      className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: style.bg }}
                    >
                      <Building2 size={13} style={{ color: style.color }} />
                    </div>
                  )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate">{accountLabel(a)}</p>
                  <p className="text-[10px] font-semibold" style={{ color: style.color }}>{style.label}</p>
                </div>
                {isCurrent && <Check size={14} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
