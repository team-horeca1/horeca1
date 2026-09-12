'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  MapPin,
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStableSession } from '@/hooks/useStableSession';
import { useBusinessAccountSwitcher, type AccountSummary } from '@/hooks/useBusinessAccountSwitcher';
import { useAddress } from '@/context/AddressContext';
import {
  businessKindLabel,
  isBuyerOnly,
  kindFromFlags,
  type BusinessKind,
} from '@/lib/businessCapability';
import { toast } from 'sonner';

interface Props {
  fallbackLabel: string;
  onFallbackClick: () => void;
  variant: 'desktop' | 'mobile';
}

type StickyContext = {
  mode: 'account' | 'outlet' | 'fallback';
  label: string;
  business?: string;
  kind?: BusinessKind;
  needsAddress?: boolean;
};

const DELIVER_TO_SS_PREFIX = 'h1_deliver_to:';

function accountLabel(a: AccountSummary): string {
  return a.displayName ?? a.legalName;
}

function defaultOutletId(account: AccountSummary): string | undefined {
  return account.primaryOutletId ?? account.outlets[0]?.id ?? undefined;
}

function readCachedContext(userId: string | null): StickyContext | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${DELIVER_TO_SS_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StickyContext;
    if (
      parsed
      && (parsed.mode === 'account' || parsed.mode === 'outlet' || parsed.mode === 'fallback')
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

function writeCachedContext(userId: string | null, sticky: StickyContext) {
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
        className="flex items-center gap-1.5 px-3 py-1.5 border border-divider rounded-full bg-ivory w-full justify-center animate-pulse"
        aria-hidden
      >
        <div className="size-3.5 rounded-full bg-divider shrink-0" />
        <div className="h-3 w-[90px] rounded bg-divider" />
        <div className="size-3.5 rounded bg-divider shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2 border border-divider rounded-xl bg-ivory shrink-0 w-[240px] animate-pulse"
      aria-hidden
    >
      <div className="flex flex-col items-start min-w-0 flex-1 gap-1.5">
        <div className="h-3 w-24 rounded bg-divider" />
        <div className="h-2.5 w-16 rounded bg-divider" />
      </div>
      <div className="size-3 rounded bg-divider shrink-0" />
    </div>
  );
}

function chipSubtitle(sticky: StickyContext): { text: string; warn: boolean; pin: boolean } {
  if (sticky.needsAddress) return { text: 'Add address', warn: true, pin: false };
  if (sticky.kind === 'vendor') return { text: 'Supplier · browse only', warn: false, pin: false };
  if (sticky.kind === 'brand') return { text: 'Brand · browse only', warn: false, pin: false };
  return { text: sticky.label, warn: false, pin: true };
}

function StickyContextChip({
  sticky,
  variant,
}: {
  sticky: StickyContext;
  variant: 'desktop' | 'mobile';
}) {
  const sub = chipSubtitle(sticky);
  const combined = sticky.business ? `${sticky.business} · ${sub.text}` : sub.text;

  if (variant === 'mobile') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border border-divider rounded-full bg-ivory w-full justify-center"
        aria-busy
      >
        {sub.warn
          ? <AlertCircle size={13} className="text-warning shrink-0" />
          : sub.pin
            ? <MapPin size={13} className="text-primary shrink-0" />
            : <Building2 size={13} className="text-primary shrink-0" />}
        <span className="text-[12px] font-semibold text-text-secondary truncate max-w-[220px]">
          {combined}
        </span>
        <ChevronDown size={13} className="text-text-muted shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3.5 py-2 border border-divider rounded-xl bg-ivory shrink-0 w-[240px]"
      aria-busy
    >
      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className="text-[13px] font-semibold text-text truncate leading-tight w-full text-left">
          {sticky.business ?? sticky.label}
        </span>
        <span className={cn(
          'mt-0.5 flex items-center gap-1 text-[11px] font-medium leading-none w-full min-w-0',
          sub.warn ? 'text-warning' : 'text-text-secondary',
        )}>
          {sub.warn
            ? <AlertCircle size={11} className="shrink-0" />
            : sub.pin
              ? <MapPin size={11} className="text-primary shrink-0" />
              : null}
          <span className="truncate">{sub.text}</span>
        </span>
      </div>
      <ChevronDown size={14} className="text-text-muted shrink-0" />
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
  const [lastGood, setLastGood] = useState<StickyContext | null>(null);

  const buyer = isBuyerOnly(currentAccount);
  const currentKind = kindFromFlags(currentAccount);
  const visibleOutlets = (currentAccount?.outlets ?? []).filter(
    (o) => accessibleOutletIds.length === 0 || accessibleOutletIds.includes(o.id),
  );
  const impersonating = customerImpersonating || vendorImpersonating || buyerImpersonating;
  const canSwitchBusiness = !impersonating && accounts.length > 0;

  useEffect(() => {
    const cached = readCachedContext(userId);
    if (cached) Promise.resolve().then(() => setLastGood(cached));
  }, [userId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const settling = !isResolved || (isAuthenticated && loading);

  useEffect(() => {
    if (settling) return;
    const nextGood: StickyContext =
      isAuthenticated && currentAccount
        ? {
            mode: 'account',
            label: !buyer
              ? (currentKind === 'vendor' ? 'Supplier · browse only' : 'Brand · browse only')
              : currentOutlet
                ? (currentOutlet.requiresAddressUpdate
                  ? 'Add address'
                  : (currentOutlet.pincode ?? currentOutlet.name))
                : 'Add outlet',
            business: accountLabel(currentAccount),
            kind: currentKind,
            needsAddress: Boolean(buyer && (currentOutlet?.requiresAddressUpdate || !currentOutlet)),
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
        && prev.kind === nextGood.kind
        && prev.needsAddress === nextGood.needsAddress
      ) {
        return prev;
      }
      return nextGood;
    });
    writeCachedContext(userId, nextGood);
  }, [
    settling,
    isAuthenticated,
    currentAccount,
    currentOutlet,
    currentKind,
    buyer,
    fallbackLabel,
    userId,
  ]);

  if (settling) {
    if (lastGood) {
      return <StickyContextChip sticky={lastGood} variant={variant} />;
    }
    return <ContextSkeleton variant={variant} />;
  }

  if (!isAuthenticated || !currentAccount) {
    if (variant === 'mobile') {
      return (
        <button
          type="button"
          onClick={onFallbackClick}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-divider rounded-full bg-ivory hover:bg-cream transition-colors cursor-pointer w-full justify-center"
        >
          <MapPin size={13} className="text-primary shrink-0" />
          <span className="text-[12px] font-semibold text-text-secondary truncate max-w-[140px]">
            {fallbackLabel}
          </span>
          <ChevronDown size={13} className="text-text-muted shrink-0" />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onFallbackClick}
        className="flex items-center gap-2.5 px-3.5 py-2 border border-divider rounded-xl bg-ivory hover:bg-cream hover:border-primary/20 transition-colors cursor-pointer shrink-0 w-[240px]"
      >
        <MapPin size={15} className="text-primary shrink-0" />
        <div className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-[10px] font-semibold uppercase text-text-muted leading-none">
            Deliver to
          </span>
          <span className="text-[13px] font-semibold text-text truncate leading-tight mt-0.5 w-full text-left">
            {fallbackLabel}
          </span>
        </div>
        <ChevronDown size={14} className="text-text-muted shrink-0" />
      </button>
    );
  }

  const businessName = accountLabel(currentAccount);
  const needsAddress = Boolean(buyer && (currentOutlet?.requiresAddressUpdate || !currentOutlet));
  const locLabel = !buyer
    ? (currentKind === 'vendor' ? 'Supplier · browse only' : 'Brand · browse only')
    : needsAddress
      ? (currentOutlet ? 'Add address' : 'Add outlet')
      : (currentOutlet?.pincode ?? currentOutlet?.name ?? 'Add outlet');
  const showPin = buyer && !needsAddress;
  const busy = switching || pickingId !== null;

  const handleSwitchOutlet = async (id: string) => {
    setPickingId(id);
    try {
      await switchOutlet(id);
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
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not switch outlet');
    } finally {
      setPickingId(null);
    }
  };

  const handleSwitchAccount = async (id: string) => {
    if (id === currentAccount.id) {
      setOpen(false);
      return;
    }
    const target = accounts.find((a) => a.id === id);
    setPickingId(id);
    try {
      await switchAccount(id, target ? defaultOutletId(target) : undefined);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not switch business');
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

  const openOutlets = () => {
    setOpen(false);
    onFallbackClick();
  };

  const compact = variant === 'mobile';

  const dropdown = open && !buyerImpersonating ? (
    <div
      role="menu"
      className={cn(
        'absolute z-[10500] bg-white border border-divider overflow-y-auto',
        compact
          ? 'top-full mt-1 left-0 right-0 rounded-2xl shadow-cdl-3 p-1.5 max-h-[min(70vh,440px)]'
          : 'top-full mt-2 left-0 w-[320px] rounded-2xl shadow-cdl-3 p-2 max-h-[min(70vh,480px)]',
      )}
    >
      <p className={cn(
        'font-semibold uppercase text-text-muted px-2.5 py-1.5 sticky top-0 bg-white',
        compact ? 'text-[10px]' : 'text-[11px]',
      )}>
        Ordering as
      </p>
      {accounts.map((a) => {
        const kind = kindFromFlags(a);
        const isCurrent = a.id === currentAccount.id;
        return (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            onClick={() => handleSwitchAccount(a.id)}
            disabled={busy || !canSwitchBusiness}
            className={cn(
              'w-full flex items-center gap-2.5 rounded-xl text-left disabled:opacity-60 transition-colors',
              compact ? 'px-2 py-1.5' : 'px-2.5 py-2',
              isCurrent ? 'bg-primary-light' : 'hover:bg-ivory',
            )}
          >
            {pickingId === a.id
              ? <Loader2 size={14} className="animate-spin text-primary shrink-0" />
              : (
                <div className="size-8 rounded-full bg-white border border-divider flex items-center justify-center shrink-0">
                  <Building2 size={13} className="text-primary" />
                </div>
              )}
            <div className="flex-1 min-w-0">
              <p className={cn('font-semibold truncate text-text', compact ? 'text-[12px]' : 'text-[13px]')}>
                {accountLabel(a)}
              </p>
              <p className="text-[11px] text-text-secondary">{businessKindLabel(kind)}</p>
            </div>
            {isCurrent && <Check size={16} className="text-primary shrink-0" />}
          </button>
        );
      })}

      {buyer ? (
        <>
          <p className={cn(
            'font-semibold uppercase text-text-muted px-2.5 py-1.5 mt-1.5 pt-2 border-t border-divider sticky top-0 bg-white',
            compact ? 'text-[10px]' : 'text-[11px]',
          )}>
            Deliver to
          </p>
          {visibleOutlets.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-text-secondary text-pretty">
              Add an outlet so vendors know where to deliver.
            </p>
          ) : visibleOutlets.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              onClick={() => handleSwitchOutlet(o.id)}
              disabled={busy}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-xl text-left disabled:opacity-60 transition-colors',
                compact ? 'px-2 py-1.5' : 'px-2.5 py-2',
                o.id === currentOutlet?.id ? 'bg-primary-light' : 'hover:bg-ivory',
              )}
            >
              {pickingId === o.id
                ? <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                : (
                  <div className="size-8 rounded-full bg-white border border-divider flex items-center justify-center shrink-0">
                    <MapPin size={13} className="text-primary" />
                  </div>
                )}
              <div className="flex-1 min-w-0">
                <p className={cn('font-semibold truncate text-text', compact ? 'text-[12px]' : 'text-[13px]')}>
                  {o.name}
                </p>
                <p className="text-[11px] text-text-secondary tabular-nums">
                  {o.requiresAddressUpdate ? 'Address needed' : (o.pincode ?? '—')}
                </p>
              </div>
              {o.id === currentOutlet?.id && <Check size={16} className="text-primary shrink-0" />}
            </button>
          ))}
          <button
            type="button"
            onClick={openOutlets}
            className={cn(
              'w-full flex items-center gap-2 rounded-xl text-left text-primary font-semibold hover:bg-primary-light transition-colors',
              compact ? 'px-2 py-1.5 text-[12px]' : 'px-2.5 py-2 text-[13px]',
            )}
          >
            <Plus size={14} className="shrink-0" />
            Add or edit outlet
          </button>
        </>
      ) : (
        <p className="mt-1.5 pt-2 border-t border-divider px-2.5 py-2 text-[12px] text-text-secondary text-pretty">
          Switch to a restaurant or retail business to set delivery.
        </p>
      )}

      <div className="border-t border-divider mt-1.5 pt-1.5 sticky bottom-0 bg-white">
        <Link
          href="/businesses"
          onClick={() => setOpen(false)}
          className={cn(
            'w-full flex items-center gap-2 rounded-xl hover:bg-ivory text-left font-semibold text-text transition-colors',
            compact ? 'px-2 py-1.5 text-[12px]' : 'px-2.5 py-2 text-[13px]',
          )}
        >
          <Building2 size={14} className="shrink-0 text-primary" />
          <span className="flex-1">Manage businesses</span>
          <ChevronRight size={14} className="text-text-muted" />
        </Link>
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
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Ordering as ${businessName}`}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-divider rounded-full bg-ivory hover:bg-cream transition-colors w-full justify-center min-h-10"
        >
          {needsAddress
            ? <AlertCircle size={13} className="text-warning shrink-0" />
            : showPin
              ? <MapPin size={13} className="text-primary shrink-0" />
              : <Building2 size={13} className="text-primary shrink-0" />}
          <span className="text-[12px] font-semibold text-text truncate max-w-[220px]">
            {`${businessName} · ${locLabel}`}
          </span>
          <ChevronDown size={13} className={cn('text-text-muted shrink-0', open && 'rotate-180')} />
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
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Ordering as ${businessName}`}
        className="flex items-center gap-2 px-3.5 py-2 border border-divider rounded-xl bg-ivory hover:bg-cream hover:border-primary/20 transition-colors cursor-pointer shrink-0 w-[240px]"
      >
        <div className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-text truncate leading-tight w-full text-left">
            {businessName}
          </span>
          <span className={cn(
            'mt-0.5 flex items-center gap-1 text-[11px] font-medium leading-none w-full min-w-0',
            needsAddress ? 'text-warning' : 'text-text-secondary',
          )}>
            {needsAddress
              ? <AlertCircle size={11} className="shrink-0" />
              : showPin
                ? <MapPin size={11} className="text-primary shrink-0" />
                : null}
            <span className="truncate">{locLabel}</span>
          </span>
        </div>
        <ChevronDown size={14} className={cn('text-text-muted shrink-0', open && 'rotate-180')} />
      </button>
      {dropdown}
    </div>
  );
}
