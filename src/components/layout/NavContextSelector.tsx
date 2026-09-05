'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, MapPin, ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react';
import { CDL } from '@/lib/cdl';
import { useStableSession } from '@/hooks/useStableSession';
import { useBusinessAccountSwitcher, type AccountSummary } from '@/hooks/useBusinessAccountSwitcher';
import { useAddress } from '@/context/AddressContext';
import { toast } from 'sonner';

interface Props {
  fallbackLabel: string;
  onFallbackClick: () => void;
  variant: 'desktop' | 'mobile';
}

type StickyDeliverTo = {
  mode: 'outlet' | 'fallback';
  label: string;
  business?: string;
  needsAddress?: boolean;
};

type AccountKind = 'customer' | 'vendor' | 'brand';

const KIND_STYLE: Record<AccountKind, { label: string; color: string; bg: string }> = {
  customer: { label: 'Customer', color: CDL.info, bg: CDL.infoLight },
  vendor:   { label: 'Supplier', color: CDL.primary, bg: CDL.primaryLight },
  brand:    { label: 'Brand',    color: '#7C3AED', bg: '#EDE9FE' },
};

const DELIVER_TO_SS_PREFIX = 'h1_deliver_to:';

function classifyAccount(a: { isVendor: boolean; isBrand: boolean }): AccountKind {
  if (a.isVendor) return 'vendor';
  if (a.isBrand) return 'brand';
  return 'customer';
}

function accountLabel(a: AccountSummary): string {
  return a.displayName ?? a.legalName;
}

function readCachedDeliverTo(userId: string | null): StickyDeliverTo | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${DELIVER_TO_SS_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StickyDeliverTo;
    if (
      parsed
      && (parsed.mode === 'outlet' || parsed.mode === 'fallback')
      && typeof parsed.label === 'string'
      && parsed.label.length > 0
    ) {
      return parsed;
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

function writeCachedDeliverTo(userId: string | null, sticky: StickyDeliverTo) {
  if (!userId || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`${DELIVER_TO_SS_PREFIX}${userId}`, JSON.stringify(sticky));
  } catch {
    /* quota / private mode */
  }
}

function ContextSkeleton({ variant }: { variant: 'desktop' | 'mobile' }) {
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
      className="flex items-center gap-2.5 px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 shrink-0 w-[210px] animate-pulse"
      aria-hidden
    >
      <div className="flex flex-col items-start min-w-0 flex-1 gap-1.5">
        <div className="h-3 w-24 rounded bg-gray-200" />
        <div className="h-2.5 w-14 rounded bg-gray-200" />
      </div>
      <div className="w-3 h-3 rounded bg-gray-200 shrink-0" />
    </div>
  );
}

function StickyContextChip({
  sticky,
  variant,
}: {
  sticky: StickyDeliverTo;
  variant: 'desktop' | 'mobile';
}) {
  const locLabel = sticky.needsAddress ? 'Add address' : sticky.label;
  const combined = sticky.business ? `${sticky.business} · ${locLabel}` : locLabel;

  if (variant === 'mobile') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm w-full justify-center"
        aria-busy
      >
        {sticky.needsAddress
          ? <AlertCircle size={13} className="text-amber-500 shrink-0" />
          : <MapPin size={13} className="text-primary shrink-0" />}
        <span className="text-[12px] font-bold text-gray-600 truncate max-w-[220px]">
          {combined}
        </span>
        <ChevronDown size={13} className="text-gray-400 shrink-0" />
      </div>
    );
  }

  if (sticky.mode === 'fallback' || !sticky.business) {
    return (
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 shrink-0 w-[195px]"
        aria-busy
      >
        {sticky.needsAddress
          ? <AlertCircle size={15} className="text-amber-500 shrink-0" />
          : <MapPin size={15} className="text-primary shrink-0" />}
        <div className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider leading-none">Deliver to</span>
          <span className={`text-[12px] font-bold truncate leading-tight mt-0.5 w-full text-left ${sticky.needsAddress ? 'text-amber-600' : 'text-gray-800'}`}>
            {sticky.label}
          </span>
        </div>
        <ChevronDown size={12} className="text-gray-400 shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 shrink-0 w-[210px]"
      aria-busy
    >
      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className="text-[12px] font-bold text-gray-800 truncate leading-tight w-full text-left">
          {sticky.business}
        </span>
        <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-semibold leading-none w-full min-w-0 ${sticky.needsAddress ? 'text-amber-600' : 'text-gray-500'}`}>
          {sticky.needsAddress
            ? <AlertCircle size={11} className="shrink-0" />
            : <MapPin size={11} className="text-primary shrink-0" />}
          <span className="truncate">{locLabel}</span>
        </span>
      </div>
      <ChevronDown size={12} className="text-gray-400 shrink-0" />
    </div>
  );
}

export function NavContextSelector({ fallbackLabel, onFallbackClick, variant }: Props) {
  const { session, isResolved, isAuthenticated } = useStableSession();
  const userId = session?.user?.id ?? null;
  const {
    accounts,
    currentAccount,
    currentOutlet,
    loading,
    switchOutlet,
    switchAccount,
    switching,
    accessibleOutletIds,
    buyerImpersonating,
    customerImpersonating,
    vendorImpersonating,
  } = useBusinessAccountSwitcher();
  const { savedAddresses, setSelectedAddress, updateAddress } = useAddress();
  const [open, setOpen] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [lastGood, setLastGood] = useState<StickyDeliverTo | null>(() => readCachedDeliverTo(userId));

  const visibleOutlets = (currentAccount?.outlets ?? []).filter(
    (o) => accessibleOutletIds.length === 0 || accessibleOutletIds.includes(o.id),
  );

  const canSwitchBusiness =
    accounts.length > 1
    && !customerImpersonating
    && !vendorImpersonating
    && !buyerImpersonating;

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

  useEffect(() => {
    if (settling) return;
    const nextGood: StickyDeliverTo =
      isAuthenticated && currentAccount && currentOutlet
        ? {
            mode: 'outlet',
            label: currentOutlet.requiresAddressUpdate
              ? 'Add address'
              : (currentOutlet.pincode ?? currentOutlet.name),
            business: accountLabel(currentAccount),
            needsAddress: Boolean(currentOutlet.requiresAddressUpdate),
          }
        : {
            mode: 'fallback',
            label: fallbackLabel,
          };
    setLastGood((prev) => {
      if (
        prev
        && prev.mode === nextGood.mode
        && prev.label === nextGood.label
        && prev.business === nextGood.business
        && prev.needsAddress === nextGood.needsAddress
      ) {
        return prev;
      }
      return nextGood;
    });
    writeCachedDeliverTo(userId, nextGood);
  }, [
    settling,
    isAuthenticated,
    currentAccount,
    currentOutlet,
    fallbackLabel,
    userId,
  ]);

  if (settling) {
    if (lastGood) {
      return <StickyContextChip sticky={lastGood} variant={variant} />;
    }
    return <ContextSkeleton variant={variant} />;
  }

  if (!isAuthenticated || !currentAccount || !currentOutlet) {
    if (variant === 'mobile') {
      return (
        <button
          onClick={onFallbackClick}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm hover:bg-gray-100 transition-colors cursor-pointer w-full justify-center"
        >
          <MapPin size={13} className="text-primary shrink-0" />
          <span className="text-[12px] font-bold text-gray-600 truncate max-w-[140px]">
            {fallbackLabel}
          </span>
          <ChevronDown size={13} className="text-gray-400 shrink-0" />
        </button>
      );
    }
    return (
      <button
        onClick={onFallbackClick}
        className="flex items-center gap-2.5 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer shrink-0 w-[195px]"
      >
        <MapPin size={15} className="text-primary shrink-0" />
        <div className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider leading-none">Deliver to</span>
          <span className="text-[12px] font-bold text-gray-800 truncate leading-tight mt-0.5 w-full text-left">
            {fallbackLabel}
          </span>
        </div>
        <ChevronDown size={12} className="text-gray-400 shrink-0" />
      </button>
    );
  }

  const businessName = accountLabel(currentAccount);
  const outletName = currentOutlet.name;
  const needsAddress = currentOutlet.requiresAddressUpdate;
  const locLabel = needsAddress ? 'Add address' : (currentOutlet.pincode ?? outletName);
  const busy = switching || pickingId !== null;

  const handleSwitchOutlet = async (id: string) => {
    setPickingId(id);
    try {
      await switchOutlet(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not switch outlet');
      setPickingId(null);
      return;
    }
    const match = savedAddresses.find((a) => a.outletId === id);
    if (match) {
      setSelectedAddress(match);
      try {
        await updateAddress(match.id, { isDefault: true });
      } catch {
        /* toast already shown by updateAddress on API failure */
      }
    } else {
      setSelectedAddress(null);
    }
    setPickingId(null);
    setOpen(false);
  };

  const handleSwitchAccount = async (id: string) => {
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

  const handleTriggerClick = () => {
    if (buyerImpersonating) {
      onFallbackClick();
      return;
    }
    setOpen((v) => !v);
  };

  const dropdown = open && !buyerImpersonating ? (
    <div
      className={
        variant === 'mobile'
          ? 'absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-[10500] p-1.5 max-h-[min(70vh,420px)] overflow-y-auto'
          : 'absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[10500] w-[280px] p-2 max-h-[min(60vh,420px)] overflow-y-auto'
      }
    >
      {canSwitchBusiness && (
        <div className="mb-1">
          <p className={`font-bold text-gray-400 uppercase tracking-wider px-2 py-1 sticky top-0 bg-white ${variant === 'mobile' ? 'text-[9px]' : 'text-[10px]'}`}>
            Business
          </p>
          {accounts.map((a) => {
            const k = classifyAccount(a);
            const style = KIND_STYLE[k];
            const isCurrent = a.id === currentAccount.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handleSwitchAccount(a.id)}
                disabled={busy}
                className={`w-full flex items-center gap-2 rounded-lg hover:bg-gray-50 text-left disabled:opacity-60 transition-colors ${variant === 'mobile' ? 'px-2 py-1.5' : 'gap-2.5 px-2 py-2'}`}
              >
                {pickingId === a.id
                  ? <Loader2 size={variant === 'mobile' ? 12 : 14} className="animate-spin text-primary shrink-0" />
                  : (
                    <div
                      className={`rounded-full flex items-center justify-center shrink-0 ${variant === 'mobile' ? 'w-6 h-6' : 'w-[30px] h-[30px]'}`}
                      style={{ backgroundColor: style.bg }}
                    >
                      <Building2 size={variant === 'mobile' ? 11 : 13} style={{ color: style.color }} />
                    </div>
                  )}
                <div className="flex-1 min-w-0">
                  <p className={`font-bold truncate ${variant === 'mobile' ? 'text-[12px]' : 'text-[13px]'}`}>
                    {accountLabel(a)}
                  </p>
                  <p className="text-[10px] font-semibold" style={{ color: style.color }}>{style.label}</p>
                </div>
                {isCurrent && <Check size={variant === 'mobile' ? 12 : 14} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      <p className={`font-bold text-gray-400 uppercase tracking-wider px-2 py-1 sticky top-0 bg-white ${variant === 'mobile' ? 'text-[9px]' : 'text-[10px]'} ${canSwitchBusiness ? 'border-t border-gray-100 mt-1 pt-2' : ''}`}>
        Deliver to
      </p>
      {visibleOutlets.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => handleSwitchOutlet(o.id)}
          disabled={busy}
          className={`w-full flex items-center rounded-lg hover:bg-gray-50 text-left disabled:opacity-60 transition-colors ${variant === 'mobile' ? 'gap-2 px-2 py-1.5' : 'gap-2.5 px-2 py-2'}`}
        >
          {pickingId === o.id
            ? <Loader2 size={variant === 'mobile' ? 12 : 14} className="animate-spin text-primary shrink-0" />
            : (
              <div className={`rounded-full bg-primary-light flex items-center justify-center shrink-0 ${variant === 'mobile' ? 'w-6 h-6' : 'w-[30px] h-[30px]'}`}>
                <MapPin size={variant === 'mobile' ? 11 : 13} className="text-primary" />
              </div>
            )}
          <div className="flex-1 min-w-0">
            <p className={`font-bold truncate ${variant === 'mobile' ? 'text-[12px]' : 'text-[13px]'}`}>{o.name}</p>
            <p className="text-[10px] text-gray-400">{o.pincode ?? '—'}</p>
          </div>
          {o.id === currentOutlet.id && <Check size={variant === 'mobile' ? 12 : 14} className="text-primary shrink-0" />}
        </button>
      ))}
      <div className="border-t border-gray-100 mt-1.5 pt-1.5 px-0.5 sticky bottom-0 bg-white">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onFallbackClick();
          }}
          className={`w-full flex items-center rounded-lg hover:bg-primary-light text-left text-primary font-bold transition-colors ${variant === 'mobile' ? 'gap-1.5 px-2 py-1.5 text-[11px]' : 'gap-2 px-2.5 py-2 text-[12px]'}`}
        >
          <MapPin size={variant === 'mobile' ? 11 : 13} className="shrink-0 text-primary" />
          Add/Select Location
        </button>
      </div>
    </div>
  ) : null;

  if (variant === 'mobile') {
    return (
      <div ref={ref} className="relative w-full">
        <button
          type="button"
          onClick={handleTriggerClick}
          disabled={switching}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm hover:bg-gray-100 transition-colors w-full justify-center"
        >
          {needsAddress
            ? <AlertCircle size={13} className="text-amber-500 shrink-0" />
            : <MapPin size={13} className="text-primary shrink-0" />}
          <span className="text-[12px] font-bold text-gray-700 truncate max-w-[220px]">
            {`${businessName} · ${locLabel}`}
          </span>
          <ChevronDown size={13} className="text-gray-400 shrink-0" />
        </button>
        {dropdown}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={handleTriggerClick}
        disabled={switching}
        className="flex items-center gap-2 px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer shrink-0 w-[210px]"
      >
        <div className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-[12px] font-bold text-gray-800 truncate leading-tight w-full text-left">
            {businessName}
          </span>
          <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-semibold leading-none w-full min-w-0 ${needsAddress ? 'text-amber-600' : 'text-gray-500'}`}>
            {needsAddress
              ? <AlertCircle size={11} className="shrink-0" />
              : <MapPin size={11} className="text-primary shrink-0" />}
            <span className="truncate">{locLabel}</span>
          </span>
        </div>
        <ChevronDown size={12} className="text-gray-400 shrink-0" />
      </button>
      {dropdown}
    </div>
  );
}
