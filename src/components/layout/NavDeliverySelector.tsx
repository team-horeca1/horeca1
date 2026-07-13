'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, MapPin, ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';

interface Props {
  fallbackLabel: string;
  onFallbackClick: () => void;
  variant: 'desktop' | 'mobile';
}

export function NavDeliverySelector({ fallbackLabel, onFallbackClick, variant }: Props) {
  const { status } = useSession();
  const {
    currentAccount,
    currentOutlet,
    accounts,
    switchAccount,
    switchOutlet,
    switching,
    accessibleOutletIds,
    customerImpersonating,
  } = useBusinessAccountSwitcher();
  const [accOpen, setAccOpen] = useState(false);
  const [outletOpen, setOutletOpen] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const visibleOutlets = (currentAccount?.outlets ?? []).filter(
    (o) => accessibleOutletIds.length === 0 || accessibleOutletIds.includes(o.id),
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAccOpen(false);
        setOutletOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Not logged in or no active account → render the fallback button
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

  const accName = currentAccount.displayName ?? currentAccount.legalName;
  const outletName = currentOutlet.name;
  const needsAddress = currentOutlet.requiresAddressUpdate;
  const showAccountSwitcher = accounts.length > 1 && !customerImpersonating;

  const handleSwitchAccount = async (id: string) => {
    setPickingId(id);
    await switchAccount(id);
    setPickingId(null);
    setAccOpen(false);
  };

  const handleSwitchOutlet = async (id: string) => {
    setPickingId(id);
    await switchOutlet(id);
    setPickingId(null);
    setOutletOpen(false);
  };

  if (variant === 'mobile') {
    return (
      <div ref={ref} className="flex items-center gap-1.5 flex-1 justify-center min-w-0">
        {/* Account button — mobile, only when multiple accounts */}
        {showAccountSwitcher && (
        <div className="relative">
          <button
            onClick={() => { setAccOpen(!accOpen); setOutletOpen(false); }}
            className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-100 rounded-full bg-[#F7F7F7] shadow-sm hover:bg-gray-100 transition-colors"
          >
            <Building2 size={12} className="text-[#53B175] shrink-0" />
            <span className="text-[11px] font-bold text-gray-700 truncate max-w-[70px]">{accName}</span>
            <ChevronDown size={11} className="text-gray-400 shrink-0" />
          </button>
          {accOpen && (
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-xl z-[10500] w-[220px] p-1.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Switch Account</p>
              {accounts.map((a) => (
                <button key={a.id} onClick={() => handleSwitchAccount(a.id)}
                  disabled={switching || pickingId !== null}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left disabled:opacity-60"
                >
                  {pickingId === a.id ? <Loader2 size={12} className="animate-spin text-[#53B175] shrink-0" /> : null}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold truncate">{a.displayName ?? a.legalName}</p>
                    <p className="text-[10px] text-gray-400">{a.isVendor ? 'Vendor' : a.isBrand ? 'Brand' : 'Customer'}</p>
                  </div>
                  {a.id === currentAccount.id && <Check size={12} className="text-[#53B175] shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Outlet button — mobile */}
        <div className="relative">
          <button
            onClick={() => {
              if (customerImpersonating) {
                onFallbackClick();
                return;
              }
              setOutletOpen(!outletOpen);
              setAccOpen(false);
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
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-xl z-[10500] w-[200px] p-1.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Select Outlet</p>
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
              <div className="border-t border-gray-100 mt-1 pt-1.5 px-0.5">
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

  // Desktop two-part selector
  return (
    <div ref={ref} className="flex items-center gap-1.5 shrink-0">
      {/* Account Switcher — desktop, only when multiple accounts */}
      {showAccountSwitcher && (
      <div className="relative">
        <button
          onClick={() => { setAccOpen(!accOpen); setOutletOpen(false); }}
          className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer"
        >
          <Building2 size={14} className="text-[#53B175] shrink-0" />
          <div className="flex flex-col items-start min-w-0">
            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider leading-none">Account</span>
            <span className="text-[12px] font-bold text-gray-800 truncate leading-tight mt-0.5 max-w-[90px]">{accName}</span>
          </div>
          <ChevronDown size={12} className="text-gray-400 shrink-0" />
        </button>
        {accOpen && (
          <div className="absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[10500] w-[260px] p-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Switch Account</p>
            {accounts.map((a) => (
              <button key={a.id} onClick={() => handleSwitchAccount(a.id)}
                disabled={switching || pickingId !== null}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 text-left disabled:opacity-60 transition-colors"
              >
                {pickingId === a.id
                  ? <Loader2 size={14} className="animate-spin text-[#53B175] shrink-0" />
                  : <div className="w-[30px] h-[30px] rounded-full bg-green-50 flex items-center justify-center shrink-0">
                      <Building2 size={13} className="text-[#53B175]" />
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate">{a.displayName ?? a.legalName}</p>
                  <p className="text-[10px] text-gray-400">{a.isVendor ? 'Vendor' : a.isBrand ? 'Brand' : 'Customer'} · {a.outlets.length} outlet{a.outlets.length !== 1 ? 's' : ''}</p>
                </div>
                {a.id === currentAccount.id && <Check size={14} className="text-[#53B175] shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Outlet Switcher — desktop */}
      <div className="relative">
        <button
          onClick={() => {
            if (customerImpersonating) {
              onFallbackClick();
              return;
            }
            setOutletOpen(!outletOpen);
            setAccOpen(false);
          }}
          className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer"
        >
          {needsAddress
            ? <AlertCircle size={14} className="text-amber-500 shrink-0" />
            : <MapPin size={14} className="text-[#53B175] shrink-0" />}
          <div className="flex flex-col items-start min-w-0">
            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider leading-none">Deliver to</span>
            <span className={`text-[12px] font-bold truncate leading-tight mt-0.5 max-w-[100px] ${needsAddress ? 'text-amber-600' : 'text-gray-800'}`}>
              {needsAddress ? 'Add address' : (currentOutlet.pincode ?? outletName)}
            </span>
          </div>
          <ChevronDown size={12} className="text-gray-400 shrink-0" />
        </button>
        {outletOpen && !customerImpersonating && (
          <div className="absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[10500] w-[240px] p-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Select Outlet</p>
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
            <div className="border-t border-gray-100 mt-1.5 pt-1.5 px-1">
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
