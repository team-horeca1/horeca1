'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { useAddress } from '@/context/AddressContext';

interface Props {
  fallbackLabel: string;
  onFallbackClick: () => void;
  variant: 'desktop' | 'mobile';
}

type StickyDeliverTo = {
  mode: 'outlet' | 'fallback';
  label: string;
  needsAddress?: boolean;
};

function DeliverToSkeleton({ variant }: { variant: 'desktop' | 'mobile' }) {
  if (variant === 'mobile') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm w-full justify-center animate-pulse"
        aria-hidden
      >
        <div className="w-[13px] h-[13px] rounded-full bg-gray-200 shrink-0" />
        <div className="h-3 w-[70px] rounded bg-gray-200" />
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

/** Static last-known Deliver to chip — used while session/account is re-settling. */
function StickyDeliverToChip({
  sticky,
  variant,
}: {
  sticky: StickyDeliverTo;
  variant: 'desktop' | 'mobile';
}) {
  if (variant === 'mobile') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm w-full justify-center"
        aria-busy
      >
        {sticky.needsAddress
          ? <AlertCircle size={13} className="text-amber-500 shrink-0" />
          : <MapPin size={13} className="text-[#53B175] shrink-0" />}
        <span className="text-[12px] font-bold text-gray-600 truncate max-w-[140px]">
          {sticky.label}
        </span>
        <ChevronDown size={13} className="text-gray-400 shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 shrink-0 w-[195px]"
      aria-busy
    >
      {sticky.needsAddress
        ? <AlertCircle size={15} className="text-amber-500 shrink-0" />
        : <MapPin size={15} className="text-[#53B175] shrink-0" />}
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

export function NavDeliverySelector({ fallbackLabel, onFallbackClick, variant }: Props) {
  const { status } = useSession();
  const {
    currentAccount,
    currentOutlet,
    loading,
    switchOutlet,
    switching,
    accessibleOutletIds,
    customerImpersonating,
  } = useBusinessAccountSwitcher();
  const { savedAddresses, setSelectedAddress, updateAddress } = useAddress();
  const [outletOpen, setOutletOpen] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [lastGood, setLastGood] = useState<StickyDeliverTo | null>(null);

  const visibleOutlets = (currentAccount?.outlets ?? []).filter(
    (o) => accessibleOutletIds.length === 0 || accessibleOutletIds.includes(o.id),
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOutletOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Session still resolving or account list still loading — hold a fixed skeleton
  // so Deliver to does not jump between fallback and real values.
  const settling = status === 'loading' || (status === 'authenticated' && loading);

  // Remember the last resolved label so session blips keep showing it instead of a skeleton.
  if (!settling) {
    const nextGood: StickyDeliverTo =
      status === 'authenticated' && currentAccount && currentOutlet
        ? {
            mode: 'outlet',
            label: currentOutlet.requiresAddressUpdate
              ? 'Add address'
              : (currentOutlet.pincode ?? currentOutlet.name),
            needsAddress: currentOutlet.requiresAddressUpdate,
          }
        : {
            mode: 'fallback',
            label: fallbackLabel,
          };
    if (
      !lastGood ||
      lastGood.mode !== nextGood.mode ||
      lastGood.label !== nextGood.label ||
      lastGood.needsAddress !== nextGood.needsAddress
    ) {
      setLastGood(nextGood);
    }
  }

  if (settling) {
    if (lastGood) {
      return <StickyDeliverToChip sticky={lastGood} variant={variant} />;
    }
    return <DeliverToSkeleton variant={variant} />;
  }

  // Guest — fallback button
  if (status !== 'authenticated' || !currentAccount || !currentOutlet) {
    if (variant === 'mobile') {
      return (
        <button
          onClick={onFallbackClick}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm hover:bg-gray-100 transition-colors cursor-pointer w-full justify-center"
        >
          <MapPin size={13} className="text-[#53B175] shrink-0" />
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
        <MapPin size={15} className="text-[#53B175] shrink-0" />
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

  const outletName = currentOutlet.name;
  const needsAddress = currentOutlet.requiresAddressUpdate;

  const handleSwitchOutlet = async (id: string) => {
    setPickingId(id);
    await switchOutlet(id);
    // Keep h1_addr / selectedAddress in sync with the chosen outlet so
    // checkout stamps the deliver-to store, not a stale primary address.
    // No match → clear cookie so resolveStorefrontContext falls through to JWT.
    const match = savedAddresses.find((a) => a.outletId === id);
    if (match) {
      setSelectedAddress(match);
      // Linked SavedAddress → promote as primary (isDefault + primaryOutletId).
      try {
        await updateAddress(match.id, { isDefault: true });
      } catch {
        /* toast already shown by updateAddress on API failure */
      }
    } else {
      setSelectedAddress(null);
    }
    setPickingId(null);
    setOutletOpen(false);
  };

  if (variant === 'mobile') {
    return (
      <div ref={ref} className="flex items-center gap-1.5 flex-1 justify-center min-w-0">
        <div className="relative">
          <button
            onClick={() => {
              if (customerImpersonating) {
                onFallbackClick();
                return;
              }
              setOutletOpen(!outletOpen);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm hover:bg-gray-100 transition-colors"
          >
            {needsAddress
              ? <AlertCircle size={12} className="text-amber-500 shrink-0" />
              : <MapPin size={12} className="text-[#53B175] shrink-0" />}
            <span className="text-[11px] font-bold text-gray-700 truncate max-w-[70px]">{currentOutlet.pincode ?? outletName}</span>
            <ChevronDown size={11} className="text-gray-400 shrink-0" />
          </button>
          {outletOpen && !customerImpersonating && (
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-xl z-[10500] w-[200px] p-1.5 max-h-[min(60vh,320px)] overflow-y-auto">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 sticky top-0 bg-white">Select Outlet</p>
              {visibleOutlets.map((o) => (
                <button key={o.id} onClick={() => handleSwitchOutlet(o.id)}
                  disabled={switching || pickingId !== null}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left disabled:opacity-60"
                >
                  {pickingId === o.id ? <Loader2 size={12} className="animate-spin text-[#53B175] shrink-0" /> : null}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold truncate">{o.name}</p>
                    <p className="text-[10px] text-gray-400">{o.pincode ?? '—'}</p>
                  </div>
                  {o.id === currentOutlet.id && <Check size={12} className="text-[#53B175] shrink-0" />}
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1.5 px-0.5 sticky bottom-0 bg-white">
                <button
                  onClick={() => {
                    setOutletOpen(false);
                    onFallbackClick();
                  }}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-green-50 text-left text-primary font-bold text-[11px] transition-colors"
                >
                  <MapPin size={11} className="shrink-0 text-primary" />
                  Add/Select Location
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex items-center gap-1.5 shrink-0">
      <div className="relative">
        <button
          onClick={() => {
            if (customerImpersonating) {
              onFallbackClick();
              return;
            }
            setOutletOpen(!outletOpen);
          }}
          className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer w-[195px]"
        >
          {needsAddress
            ? <AlertCircle size={14} className="text-amber-500 shrink-0" />
            : <MapPin size={14} className="text-[#53B175] shrink-0" />}
          <div className="flex flex-col items-start min-w-0 flex-1">
            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider leading-none">Deliver to</span>
            <span className={`text-[12px] font-bold truncate leading-tight mt-0.5 w-full text-left ${needsAddress ? 'text-amber-600' : 'text-gray-800'}`}>
              {needsAddress ? 'Add address' : (currentOutlet.pincode ?? outletName)}
            </span>
          </div>
          <ChevronDown size={12} className="text-gray-400 shrink-0" />
        </button>
        {outletOpen && !customerImpersonating && (
          <div className="absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[10500] w-[240px] p-2 max-h-[min(60vh,360px)] overflow-y-auto">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 sticky top-0 bg-white">Select Outlet</p>
            {visibleOutlets.map((o) => (
              <button key={o.id} onClick={() => handleSwitchOutlet(o.id)}
                disabled={switching || pickingId !== null}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 text-left disabled:opacity-60 transition-colors"
              >
                {pickingId === o.id
                  ? <Loader2 size={14} className="animate-spin text-[#53B175] shrink-0" />
                  : <div className="w-[30px] h-[30px] rounded-full bg-green-50 flex items-center justify-center shrink-0">
                      <MapPin size={13} className="text-[#53B175]" />
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate">{o.name}</p>
                  <p className="text-[10px] text-gray-400">{o.pincode ?? 'No pincode'}</p>
                </div>
                {o.id === currentOutlet.id && <Check size={14} className="text-[#53B175] shrink-0" />}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1.5 pt-1.5 px-1 sticky bottom-0 bg-white">
              <button
                onClick={() => {
                  setOutletOpen(false);
                  onFallbackClick();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-green-50 text-left text-primary font-bold text-[12px] transition-colors"
              >
                <MapPin size={13} className="shrink-0 text-primary" />
                Add/Select Location
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
