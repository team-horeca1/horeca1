'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown, LogOut, Loader2, ShieldCheck, Store, User,
  Sparkles, MapPin, Check, ChevronRight, AlertCircle, Plus, Warehouse,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useBusinessAccountSwitcher, type AccountSummary } from '@/hooks/useBusinessAccountSwitcher';
import { CreateBusinessAccountModal } from '@/components/auth/CreateBusinessAccountModal';
import { ACCOUNT_SWITCHER_OPEN_EVENT } from '@/lib/accountSwitcherEvents';

type AccountKind = 'customer' | 'vendor' | 'brand';
type Portal = 'vendor' | 'brand' | 'customer' | 'admin';

function detectPortal(pathname: string | null, isAdminMode: boolean): Portal {
  if (isAdminMode || pathname?.startsWith('/admin')) return 'admin';
  if (pathname?.startsWith('/vendor')) return 'vendor';
  if (pathname?.startsWith('/brand')) return 'brand';
  return 'customer';
}

const PORTAL_COPY: Record<Portal, {
  workspaceLabel: string;
  outletSectionTitle: string;
  outletPickerTitle: string;
  outletHint: string;
  addOutletLabel: string | null;
  addOutletHref: string | null;
  switchAccountsTitle: string;
  switchAccountsHint: string;
  createBusinessLabel: string;
  createBusinessHint: string;
}> = {
  vendor: {
    workspaceLabel: 'Vendor workspace',
    outletSectionTitle: 'Operating warehouse',
    outletPickerTitle: 'Select warehouse',
    outletHint: 'Inventory & orders use this location',
    addOutletLabel: 'Add warehouse',
    addOutletHref: '/vendor/outlets?action=add',
    switchAccountsTitle: 'Other businesses',
    switchAccountsHint: 'Switch between vendor, brand, or customer accounts',
    createBusinessLabel: 'Register another business',
    createBusinessHint: 'Open a separate customer, vendor, or brand account',
  },
  brand: {
    workspaceLabel: 'Brand workspace',
    outletSectionTitle: 'Active location',
    outletPickerTitle: 'Select location',
    outletHint: 'Your brand’s registered address',
    addOutletLabel: null,
    addOutletHref: null,
    switchAccountsTitle: 'Other businesses',
    switchAccountsHint: 'Switch between vendor, brand, or customer accounts',
    createBusinessLabel: 'Register another business',
    createBusinessHint: 'Open a separate customer, vendor, or brand account',
  },
  customer: {
    workspaceLabel: 'Shopping account',
    outletSectionTitle: 'Delivery location',
    outletPickerTitle: 'Select delivery location',
    outletHint: 'Orders deliver to this address',
    addOutletLabel: null,
    addOutletHref: null,
    switchAccountsTitle: 'Other accounts',
    switchAccountsHint: 'Switch between your personal and business profiles',
    createBusinessLabel: 'Create a business account',
    createBusinessHint: 'Start buying or selling on Horeca1',
  },
  admin: {
    workspaceLabel: 'Platform admin',
    outletSectionTitle: 'Location',
    outletPickerTitle: 'Select location',
    outletHint: '',
    addOutletLabel: null,
    addOutletHref: null,
    switchAccountsTitle: 'Other accounts',
    switchAccountsHint: '',
    createBusinessLabel: 'Register a business',
    createBusinessHint: '',
  },
};

const KIND_STYLE: Record<AccountKind, { label: string; color: string; bg: string; icon: typeof Store }> = {
  customer: { label: 'Customer', color: '#2563EB', bg: '#DBEAFE', icon: User },
  vendor:   { label: 'Vendor',   color: '#299E60', bg: '#DCFCE7', icon: Store },
  brand:    { label: 'Brand',    color: '#7C3AED', bg: '#EDE9FE', icon: Sparkles },
};

function classifyAccount(a: { isVendor: boolean; isBrand: boolean; isCustomer: boolean }): AccountKind {
  if (a.isVendor) return 'vendor';
  if (a.isBrand) return 'brand';
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

export function BusinessAccountSwitcherDropdown({ isAdminMode = false }: { isAdminMode?: boolean }) {
  const pathname = usePathname();
  const portal = detectPortal(pathname, isAdminMode);
  const copy = PORTAL_COPY[portal];

  const {
    loading, switching,
    accounts, currentAccount, currentOutlet,
    hcidDisplay, totalAccountCount, availableAccountsTruncated,
    accessibleOutletIds,
    vendorImpersonating,
    switchAccount, switchOutlet, signOut,
  } = useBusinessAccountSwitcher();

  // Per-outlet scoped users can only see their assigned outlets.
  // During vendor Admin View the hook clears this list so vendor warehouses are not filtered out.
  const { data: session } = useSession();

  function filterOutlets(outlets: AccountSummary['outlets']) {
    if (accessibleOutletIds.length === 0) return outlets;
    return outlets.filter((o) => accessibleOutletIds.includes(o.id));
  }

  const visibleOutlets = filterOutlets(currentAccount?.outlets ?? []);
  const canSwitchOutlets = visibleOutlets.length > 1;
  const isVendorPortal = portal === 'vendor';
  // Vendor portal: always open warehouse picker (switch + add). Storefront: only when 2+ locations.
  const canOpenOutletPicker = isVendorPortal ? visibleOutlets.length > 0 : canSwitchOutlets;

  const [isOpen, setIsOpen] = useState(false);
  const [showOutletPicker, setShowOutletPicker] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowOutletPicker(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', onMouseDown);
      return () => document.removeEventListener('mousedown', onMouseDown);
    }
  }, [isOpen]);

  useEffect(() => {
    function onOpenRequest() {
      setIsOpen(true);
      setShowOutletPicker(false);
    }
    window.addEventListener(ACCOUNT_SWITCHER_OPEN_EVENT, onOpenRequest);
    return () => window.removeEventListener(ACCOUNT_SWITCHER_OPEN_EVENT, onOpenRequest);
  }, []);

  // Empty-accounts fallback — this is the path for super admins who have
  // role='admin' but no BusinessAccountMember rows of their own. The bare
  // "Sign out" button used to be the only affordance, which made the
  // header look broken (no identity, no menu). Render a proper user menu
  // here so the admin still sees who they're signed in as + has the same
  // dropdown shape as any other portal.
  if (isAdminMode || (!loading && accounts.length === 0)) {
    return <UserOnlyMenu session={session} signOut={signOut} hcidDisplay={hcidDisplay} isAdminMode={isAdminMode} />;
  }

  const displayName = currentAccount?.displayName ?? currentAccount?.legalName ?? 'Account';
  const kind = currentAccount ? classifyAccount(currentAccount) : 'customer';
  const conf = KIND_STYLE[kind];
  const Icon = conf.icon;
  const initials = initialsOf(displayName);

  const otherAccounts: AccountSummary[] = accounts.filter((a) => a.id !== currentAccount?.id);

  const handleAccountClick = async (a: AccountSummary) => {
    setSwitchingId(a.id);
    setIsOpen(false);
    await switchAccount(a.id);
    setSwitchingId(null);
  };

  const handleOutletClick = async (outletId: string) => {
    setShowOutletPicker(false);
    setIsOpen(false);
    await switchOutlet(outletId);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setIsOpen((v) => !v); setShowOutletPicker(false); }}
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
          {currentOutlet ? (
            <span className="text-[11px] text-[#666] flex items-center gap-1 truncate max-w-[180px]">
              {isVendorPortal ? (
                <Warehouse size={10} className="shrink-0 text-[#299E60]" />
              ) : (
                <MapPin size={10} className="shrink-0" />
              )}
              <span className="truncate">
                {isVendorPortal ? 'Warehouse' : portal === 'customer' ? 'Deliver to' : 'Location'}
                {' · '}
                {currentOutlet.pincode ?? currentOutlet.name}
              </span>
              {currentOutlet.requiresAddressUpdate && (
                <AlertCircle size={10} className="text-amber-500 shrink-0" />
              )}
            </span>
          ) : (
            <span className="text-[11px] text-[#AEAEAE]">{copy.workspaceLabel}</span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-[#AEAEAE] group-hover:text-[#181725] transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[340px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#F0F0F0] z-50 overflow-hidden">
          {/* ── Current account header ── */}
          <div className="p-4 border-b border-[#F0F0F0]">
            <div className="flex items-center gap-3">
              <div
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: conf.bg }}
              >
                <Icon size={20} style={{ color: conf.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-[#181725] truncate">{displayName}</p>
                <p className="text-[11px] text-[#7C7C7C]">{copy.workspaceLabel}</p>
                {hcidDisplay && (
                  <p className="text-[10px] text-[#AEAEAE] font-mono mt-0.5">{hcidDisplay}</p>
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

          {/* ── Warehouse / delivery location ── */}
          {!showOutletPicker && isVendorPortal && visibleOutlets.length === 0 && copy.addOutletHref && (
            <Link
              href={copy.addOutletHref}
              onClick={() => setIsOpen(false)}
              className="block px-4 py-3 border-b border-[#F0F0F0] hover:bg-emerald-50/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-[32px] h-[32px] rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Warehouse size={14} className="text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-emerald-800">Set up your first warehouse</p>
                  <p className="text-[11px] text-[#7C7C7C] mt-0.5">Add where you stock inventory and ship orders from</p>
                </div>
                <ChevronRight size={14} className="text-emerald-600 shrink-0 mt-1" />
              </div>
            </Link>
          )}

          {visibleOutlets.length > 0 && !showOutletPicker && (
            canOpenOutletPicker ? (
              <button
                onClick={() => setShowOutletPicker(true)}
                className="w-full px-4 py-3 border-b border-[#F0F0F0] hover:bg-[#F8F8F8] flex items-center gap-3 text-left transition-colors"
              >
                <div className="w-[32px] h-[32px] rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
                  {isVendorPortal ? (
                    <Warehouse size={14} className="text-emerald-700" />
                  ) : (
                    <MapPin size={14} className="text-[#666]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[#AEAEAE] uppercase tracking-wider">
                    {copy.outletSectionTitle}
                  </p>
                  <p className="text-[13px] font-semibold text-[#181725] truncate">
                    {currentOutlet?.name ?? visibleOutlets[0]?.name ?? 'Not selected'}
                  </p>
                  {(currentOutlet?.pincode ?? visibleOutlets[0]?.pincode) && (
                    <p className="text-[11px] text-[#7C7C7C]">
                      {currentOutlet?.pincode ?? visibleOutlets[0]?.pincode}
                    </p>
                  )}
                  {copy.outletHint && (
                    <p className="text-[10px] text-[#AEAEAE] mt-0.5">{copy.outletHint}</p>
                  )}
                </div>
                <ChevronRight size={14} className="text-[#AEAEAE] shrink-0" />
              </button>
            ) : (
              <div className="w-full px-4 py-3 border-b border-[#F0F0F0] flex items-center gap-3">
                <div className="w-[32px] h-[32px] rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
                  <MapPin size={14} className="text-[#666]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[#AEAEAE] uppercase tracking-wider">
                    {copy.outletSectionTitle}
                  </p>
                  <p className="text-[13px] font-semibold text-[#181725] truncate">
                    {currentOutlet?.name ?? visibleOutlets[0]?.name ?? 'Not selected'}
                  </p>
                  {copy.outletHint && (
                    <p className="text-[10px] text-[#AEAEAE] mt-0.5">{copy.outletHint}</p>
                  )}
                </div>
              </div>
            )
          )}

          {/* ── Quick add warehouse (vendor) ── */}
          {!showOutletPicker && isVendorPortal && copy.addOutletHref && visibleOutlets.length > 0 && (
            <Link
              href={copy.addOutletHref}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 w-full px-4 py-2.5 border-b border-[#F0F0F0] hover:bg-emerald-50/60 transition-colors"
            >
              <div className="w-[32px] h-[32px] rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Plus size={14} className="text-emerald-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-emerald-800">{copy.addOutletLabel}</p>
                <p className="text-[10px] text-[#7C7C7C]">Open another branch or warehouse</p>
              </div>
            </Link>
          )}

          {/* ── Outlet / warehouse picker ── */}
          {showOutletPicker && canOpenOutletPicker && (
            <div className="border-b border-[#F0F0F0]">
              <div className="px-4 py-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold text-[#AEAEAE] uppercase tracking-wider">
                  {copy.outletPickerTitle}
                </p>
                <button
                  onClick={() => setShowOutletPicker(false)}
                  className="text-[11px] text-[#666] hover:text-[#181725] font-medium"
                >
                  Back
                </button>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {visibleOutlets.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => handleOutletClick(o.id)}
                    disabled={switching}
                    className="w-full px-4 py-2.5 hover:bg-[#F8F8F8] flex items-center gap-3 text-left transition-colors"
                  >
                    {isVendorPortal ? (
                      <Warehouse size={14} className="text-emerald-700 shrink-0" />
                    ) : (
                      <MapPin size={14} className="text-[#666] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#181725] truncate">{o.name}</p>
                      {o.pincode && <p className="text-[11px] text-[#AEAEAE]">{o.pincode}</p>}
                    </div>
                    {o.requiresAddressUpdate && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">
                        Address needed
                      </span>
                    )}
                    {o.id === currentOutlet?.id && <Check size={14} className="text-[#299E60] shrink-0" />}
                  </button>
                ))}
              </div>
              {isVendorPortal && copy.addOutletHref && (
                <Link
                  href={copy.addOutletHref}
                  onClick={() => { setIsOpen(false); setShowOutletPicker(false); }}
                  className="flex items-center gap-2 px-4 py-3 border-t border-[#F0F0F0] text-emerald-800 hover:bg-emerald-50/60 transition-colors"
                >
                  <Plus size={14} className="shrink-0" />
                  <span className="text-[13px] font-semibold">{copy.addOutletLabel}</span>
                </Link>
              )}
            </div>
          )}

          {/* ── Other accounts ── */}
          {otherAccounts.length > 0 && !showOutletPicker && !vendorImpersonating && (
            <div className="py-2">
              <div className="px-4 py-1.5">
                <p className="text-[10px] font-semibold text-[#AEAEAE] uppercase tracking-wider">
                  {copy.switchAccountsTitle}
                </p>
                {copy.switchAccountsHint && (
                  <p className="text-[10px] text-[#AEAEAE] mt-0.5 leading-snug">{copy.switchAccountsHint}</p>
                )}
                {availableAccountsTruncated && (
                  <p className="text-[10px] text-[#AEAEAE] mt-1">
                    Showing {accounts.length} of {totalAccountCount}
                  </p>
                )}
              </div>
              <div className="max-h-[240px] overflow-y-auto">
                {otherAccounts.map((a) => {
                  const k = classifyAccount(a);
                  const c = KIND_STYLE[k];
                  const KIcon = c.icon;
                  const isSwitching = switchingId === a.id;
                  const name = a.displayName ?? a.legalName;
                  return (
                    <button
                      key={a.id}
                      onClick={() => handleAccountClick(a)}
                      disabled={switching}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F8F8F8] transition-colors text-left"
                    >
                      <div
                        className="w-[36px] h-[36px] rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: c.bg }}
                      >
                        {isSwitching ? (
                          <Loader2 size={14} className="animate-spin" style={{ color: c.color }} />
                        ) : (
                          <KIcon size={16} style={{ color: c.color }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#181725] truncate">{name}</p>
                        {filterOutlets(a.outlets).length > 0 && (
                          <p className="text-[11px] text-[#AEAEAE] truncate">
                            {filterOutlets(a.outlets).length} outlet{filterOutlets(a.outlets).length === 1 ? '' : 's'}
                          </p>
                        )}
                      </div>
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                        style={{ color: c.color, backgroundColor: c.bg }}
                      >
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {availableAccountsTruncated && (
                <Link
                  href="/account"
                  className="block px-4 py-2 text-[12px] text-center text-[#299E60] hover:bg-[#F8F8F8] font-semibold border-t border-[#F0F0F0]"
                  onClick={() => setIsOpen(false)}
                >
                  View all {totalAccountCount} accounts
                </Link>
              )}
            </div>
          )}

          {/* ── Actions ── */}
          {!showOutletPicker && (
            <div className="border-t border-[#F0F0F0] py-2">
              {currentAccount && (
                <Link
                  href={
                    portal === 'vendor'
                      ? '/vendor/account'
                      : portal === 'brand'
                        ? `/account/${currentAccount.id}?from=brand`
                        : `/account/${currentAccount.id}`
                  }
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-[#F8F8F8] transition-colors"
                >
                  <div className="w-[36px] h-[36px] rounded-full bg-[#F5F5F5] flex items-center justify-center">
                    <ShieldCheck size={16} className="text-[#666]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-semibold text-[#181725] block">
                      {isVendorPortal ? 'Business account' : 'Manage account'}
                    </span>
                    {isVendorPortal && (
                      <span className="text-[10px] text-[#AEAEAE]">GST, team, outlets &amp; permissions</span>
                    )}
                  </div>
                </Link>
              )}
              {!vendorImpersonating && (
                <button
                  onClick={() => { setIsOpen(false); setShowCreateAccount(true); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-[#F8F8F8] transition-colors text-left"
                >
                  <div className="w-[36px] h-[36px] rounded-full bg-[#EEF8F1] flex items-center justify-center text-[#299E60]">
                    <Plus size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-semibold text-[#299E60] block">{copy.createBusinessLabel}</span>
                    {copy.createBusinessHint && (
                      <span className="text-[10px] text-[#AEAEAE]">{copy.createBusinessHint}</span>
                    )}
                  </div>
                </button>
              )}
              <button
                onClick={() => { setIsOpen(false); signOut(); }}
                className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-red-50 transition-colors text-left"
              >
                <div className="w-[36px] h-[36px] rounded-full bg-red-50 flex items-center justify-center">
                  <LogOut size={16} className="text-red-500" />
                </div>
                <span className="text-[13px] font-semibold text-red-500">Sign out</span>
              </button>
            </div>
          )}
        </div>
      )}
      {showCreateAccount && (
        <CreateBusinessAccountModal
          isOpen={showCreateAccount}
          onClose={() => setShowCreateAccount(false)}
        />
      )}
    </div>
  );
}

// ─── User-only fallback menu ───────────────────────────────────────────
// Used when the signed-in user has zero BusinessAccountMember rows. The
// typical case is super admin (User.role='admin') — they don't need a
// vendor / customer BA to manage the platform but they still deserve to
// see "who am I signed in as?" feedback at the top-right.

type SessionLike = ReturnType<typeof useSession>['data'];

interface RoleConf { color: string; bg: string; label: string }

const ROLE_STYLE_FALLBACK: Record<string, RoleConf> = {
  admin:    { color: '#DC2626', bg: '#FEE2E2', label: 'Admin' },
  vendor:   { color: '#299E60', bg: '#DCFCE7', label: 'Vendor' },
  brand:    { color: '#7C3AED', bg: '#EDE9FE', label: 'Brand' },
  customer: { color: '#2563EB', bg: '#DBEAFE', label: 'Customer' },
  delivery: { color: '#EA580C', bg: '#FED7AA', label: 'Delivery' },
};

function UserOnlyMenu({
  session,
  signOut,
  hcidDisplay,
  isAdminMode,
}: {
  session: SessionLike;
  signOut: () => void;
  hcidDisplay: string | null;
  isAdminMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onMouseDown);
      return () => document.removeEventListener('mousedown', onMouseDown);
    }
  }, [open]);

  const u = (session?.user ?? {}) as { name?: string; fullName?: string; email?: string; role?: string };
  const name = u.fullName || u.name || u.email || 'Signed in';
  const email = u.email ?? '';
  const role = (u.role ?? 'admin').toLowerCase();
  const baseConf = ROLE_STYLE_FALLBACK[role] ?? ROLE_STYLE_FALLBACK.admin;
  const conf = {
    ...baseConf,
    label: isAdminMode ? 'Platform Admin' : baseConf.label,
  };
  const initials = initialsOf(name);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 cursor-pointer group"
      >
        <div
          className="w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm"
          style={{ backgroundColor: conf.bg }}
        >
          <span className="text-[12px] font-bold" style={{ color: conf.color }}>{initials}</span>
        </div>
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[14px] font-bold text-[#181725] truncate max-w-[180px]">{name}</span>
          <span className="text-[11px] text-[#666] truncate max-w-[180px]">{conf.label}</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-[#AEAEAE] group-hover:text-[#181725] transition-all duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[300px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#F0F0F0] z-50 overflow-hidden">
          <div className="p-4 border-b border-[#F0F0F0]">
            <div className="flex items-center gap-3">
              <div
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: conf.bg }}
              >
                <ShieldCheck size={20} style={{ color: conf.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-[#181725] truncate">{name}</p>
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
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAFA] transition-colors"
            >
              <User size={16} className="text-[#7C7C7C]" />
              <span className="text-[13px] font-semibold text-[#181725]">My profile</span>
            </Link>
            <button
              onClick={signOut}
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
