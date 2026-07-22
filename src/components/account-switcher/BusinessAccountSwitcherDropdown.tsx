'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Loader2, ShieldCheck, Store, MapPin } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';

type Portal = 'vendor' | 'brand' | 'customer' | 'admin';

function detectPortal(pathname: string | null, isAdminMode: boolean): Portal {
  if (isAdminMode || pathname?.startsWith('/admin')) return 'admin';
  if (pathname?.startsWith('/vendor')) return 'vendor';
  if (pathname?.startsWith('/brand')) return 'brand';
  return 'customer';
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || name.slice(0, 2).toUpperCase();
}

type AccountKind = 'customer' | 'vendor' | 'brand';

const KIND_STYLE: Record<AccountKind, { label: string; color: string; bg: string }> = {
  customer: { label: 'Customer', color: '#2563EB', bg: '#DBEAFE' },
  vendor:   { label: 'Supplier', color: '#299E60', bg: '#DCFCE7' },
  brand:    { label: 'Brand',    color: '#7C3AED', bg: '#EDE9FE' },
};

const ROLE_STYLE_FALLBACK: Record<string, { label: string; color: string; bg: string }> = {
  admin:    { label: 'Admin',    color: '#DC2626', bg: '#FEE2E2' },
  vendor:   { label: 'Supplier', color: '#299E60', bg: '#DCFCE7' },
  brand:    { label: 'Brand',    color: '#7C3AED', bg: '#EDE9FE' },
  customer: { label: 'Customer', color: '#2563EB', bg: '#DBEAFE' },
  delivery: { label: 'Delivery', color: '#EA580C', bg: '#FED7AA' },
};

function classifyAccount(a: { isVendor: boolean; isBrand: boolean; isCustomer: boolean }): AccountKind {
  if (a.isVendor) return 'vendor';
  if (a.isBrand) return 'brand';
  return 'customer';
}

/**
 * Top-right portal identity menu — identity summary + Sign out only.
 * Business / online-store switching UI was removed.
 */
export function BusinessAccountSwitcherDropdown({ isAdminMode = false }: { isAdminMode?: boolean }) {
  const pathname = usePathname();
  const portal = detectPortal(pathname, isAdminMode);
  const { data: session } = useSession();
  const {
    loading, switching,
    currentAccount, currentOutlet,
    hcidDisplay,
    availableStores, activeVendorId,
    signOut,
  } = useBusinessAccountSwitcher();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', onMouseDown);
      return () => document.removeEventListener('mousedown', onMouseDown);
    }
  }, [isOpen]);

  const isVendorPortal = portal === 'vendor';
  const supplierPersonName = session?.user?.name?.trim() || null;
  const accountDisplayName = currentAccount?.displayName ?? currentAccount?.legalName ?? null;
  const displayName = (isVendorPortal && supplierPersonName)
    ? supplierPersonName
    : (accountDisplayName
      ?? (session?.user as { fullName?: string } | undefined)?.fullName
      ?? session?.user?.name
      ?? session?.user?.email
      ?? 'Signed in');

  const activeStores = availableStores.filter((s) => s.isActive);
  const activeStore =
    activeStores.find((s) => s.id === activeVendorId)
    ?? activeStores.find((s) => s.isPrimaryStore)
    ?? activeStores[0]
    ?? null;

  const kind = currentAccount ? classifyAccount(currentAccount) : null;
  const role = (session?.user?.role ?? 'customer').toLowerCase();
  const conf = kind
    ? KIND_STYLE[kind]
    : {
        ...(ROLE_STYLE_FALLBACK[role] ?? ROLE_STYLE_FALLBACK.admin),
        label: isAdminMode ? 'Platform Admin' : (ROLE_STYLE_FALLBACK[role]?.label ?? 'Admin'),
      };
  const initials = initialsOf(displayName);
  const email = session?.user?.email ?? '';

  if (loading && !currentAccount && !isAdminMode) {
    return (
      <div className="flex items-center gap-3 animate-pulse" aria-hidden>
        <div className="w-[42px] h-[42px] rounded-full bg-gray-200 shrink-0" />
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="h-3.5 w-28 rounded bg-gray-200" />
          <div className="h-2.5 w-20 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <div className={`relative${isOpen ? ' z-[100]' : ''}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => { setIsOpen((v) => !v); }}
        disabled={switching}
        className="flex items-center gap-3 cursor-pointer group disabled:opacity-50"
      >
        <div
          className="w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm"
          style={{ backgroundColor: conf.bg }}
        >
          {switching ? (
            <Loader2 size={16} className="animate-spin" style={{ color: conf.color }} />
          ) : (
            <span className="text-[12px] font-bold" style={{ color: conf.color }}>{initials}</span>
          )}
        </div>
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[14px] font-bold text-[#181725] truncate max-w-[180px]">{displayName}</span>
          {isVendorPortal && activeStore ? (
            <span className="text-[11px] text-[#666] flex items-center gap-1 truncate max-w-[180px]">
              <Store size={10} className="shrink-0 text-[#299E60]" />
              <span className="truncate">{activeStore.displayName}</span>
            </span>
          ) : isVendorPortal && accountDisplayName ? (
            <span className="text-[11px] text-[#666] truncate max-w-[180px]">{accountDisplayName}</span>
          ) : currentOutlet ? (
            <span className="text-[11px] text-[#666] flex items-center gap-1 truncate max-w-[180px]">
              <MapPin size={10} className="shrink-0" />
              <span className="truncate">{currentOutlet.pincode ?? currentOutlet.name}</span>
            </span>
          ) : (
            <span className="text-[11px] text-[#666] truncate max-w-[180px]">{conf.label}</span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-[#AEAEAE] group-hover:text-[#181725] transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[300px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#F0F0F0] z-[100] overflow-hidden">
          <div className="p-4 border-b border-[#F0F0F0]">
            <div className="flex items-center gap-3">
              <div
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: conf.bg }}
              >
                <ShieldCheck size={20} style={{ color: conf.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-[#181725] truncate">{displayName}</p>
                {isVendorPortal && accountDisplayName && accountDisplayName !== displayName && (
                  <p className="text-[12px] text-[#666] truncate">{accountDisplayName}</p>
                )}
                {email && <p className="text-[12px] text-[#666] truncate">{email}</p>}
                {hcidDisplay && (
                  <p className="text-[11px] text-[#AEAEAE] font-mono mt-0.5">{hcidDisplay}</p>
                )}
              </div>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ color: conf.color, backgroundColor: conf.bg }}
              >
                {conf.label}
              </span>
            </div>
          </div>
          <div className="py-1">
            <button
              type="button"
              onClick={() => { setIsOpen(false); signOut(); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors"
            >
              <LogOut size={16} className="text-red-500" />
              <span className="text-[13px] font-semibold text-red-500">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
