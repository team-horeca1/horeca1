'use client';

/**
 * Shown after every fresh login when a user has 2+ BusinessAccounts.
 * Wired in the root layout. Honors a short-lived force-pick cookie set on
 * sign-in so the dismiss flag in sessionStorage cannot bypass account selection
 * across logout/login in the same tab.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useBusinessAccountSwitcher, type AccountSummary } from '@/hooks/useBusinessAccountSwitcher';
import {
  DISMISS_KEY,
  clearForcePickerCookie,
  clearLoginHandoff,
  clearPickerInFlight,
  completePostLoginPicker,
  isOnboardOrAddRedirect,
  isPickerInFlight,
  isPickerPending,
  isPickerSettled,
  markLoginHandoff,
  markPickerInFlight,
  markPickerSettled,
  rememberPickedAccount,
} from '@/lib/postLoginPicker';
import { broadcastAuthEvent } from '@/lib/authTabSync';
import { supplierLandingPath } from '@/lib/businessCapability';
import { CDL } from '@/lib/cdl';
import { ShieldCheck, Store, Sparkles, User, MapPin, Loader2, X, ChevronLeft, Check } from 'lucide-react';

type Kind = 'customer' | 'vendor' | 'brand';
const STYLE: Record<Kind, { label: string; color: string; bg: string; icon: typeof Store }> = {
  customer: { label: 'Restaurant / Retail', color: CDL.info, bg: CDL.infoLight, icon: User },
  vendor:   { label: 'Supplier', color: CDL.primary, bg: CDL.primaryLight, icon: Store },
  brand:    { label: 'Brand',    color: '#7C3AED', bg: '#EDE9FE', icon: Sparkles },
};

function classify(a: AccountSummary): Kind {
  if (a.isVendor) return 'vendor';
  if (a.isBrand) return 'brand';
  return 'customer';
}

function pickerLeavePath(a: AccountSummary): string {
  if (a.isBrand) return '/brand/portal';
  if (a.isVendor) return supplierLandingPath(a.id);
  return '/';
}

/** Outlets are restaurant/retail only. Supplier → stores; brand → dashboard. */
function childMeta(a: AccountSummary, kind: Kind): { Icon: typeof MapPin; text: string } {
  if (kind === 'vendor') {
    const n = a.stores?.length ?? 0;
    return {
      Icon: Store,
      text: n === 0 ? 'Open supplier dashboard' : `${n} online store${n === 1 ? '' : 's'}`,
    };
  }
  if (kind === 'brand') {
    const n = a.catalogueCount ?? 0;
    return {
      Icon: Sparkles,
      text: n > 0 ? `${n} SKU${n === 1 ? '' : 's'} · Open dashboard` : 'Open brand dashboard',
    };
  }
  const n = a.outlets.length;
  return { Icon: MapPin, text: `${n} outlet${n === 1 ? '' : 's'}` };
}

export function PostLoginAccountSelector() {
  const { data: session, status, update } = useSession();
  const pathname = usePathname();
  const onAddBusinessRegister = pathname === '/brand/register' || pathname === '/vendor/register';
  const onRegisterRoute = pathname === '/register' || onAddBusinessRegister;
  const { accounts, currentAccount, switchAccount, switchOutlet, activeOutletId, switching } = useBusinessAccountSwitcher();
  const [open, setOpen] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [outletStep, setOutletStep] = useState<AccountSummary | null>(null);
  const [mandatoryPick, setMandatoryPick] = useState(false);
  const accountChangedRef = useRef(false);
  // Answered in this page life — blocks the effect from reopening when the
  // session refresh that follows a pick hands us a new `accounts` array.
  const settledRef = useRef(false);
  const leavingRef = useRef(false);

  const u = (session?.user ?? {}) as Record<string, unknown>;
  const accessibleOutletIds = Array.isArray(u.accessibleOutletIds) ? (u.accessibleOutletIds as string[]) : [];
  const armedAt = typeof u.pickerArmedAt === 'number' ? u.pickerArmedAt : null;

  function filterOutlets(a: AccountSummary) {
    if (accessibleOutletIds.length === 0) return a.outlets;
    return a.outlets.filter((o) => accessibleOutletIds.includes(o.id));
  }

  const settle = useCallback(() => {
    settledRef.current = true;
    markPickerSettled(armedAt);
    clearForcePickerCookie();
  }, [armedAt]);

  useEffect(() => {
    if (pathname === '/login' || pathname === '/register') return;
    clearLoginHandoff();
  }, [pathname]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (accounts.length === 0) return;
    if (u.role === 'admin') return;
    if (settledRef.current || leavingRef.current || isPickerInFlight()) return;
    // Stay on add-business / onboard so login intent is not stolen by the picker.
    // `/login` must keep the picker — leaving it to hard-nav home is the flash.
    if (
      onRegisterRoute
      || isOnboardOrAddRedirect(`${window.location.pathname}${window.location.search}`)
    ) {
      settle();
      return;
    }

    const totalCount = (u.totalAccountCount as number | undefined) ?? accounts.length;
    const mustPick = isPickerPending({
      forceAccountPicker: u.forceAccountPicker === true,
      pickerArmedAt: armedAt ?? undefined,
      totalAccountCount: totalCount,
      role: typeof u.role === 'string' ? u.role : undefined,
    }) && totalCount > 1;

    // This login was already answered — stay quiet through dashboard navigation
    // and reloads. The next login stamps a new armedAt and arms the picker again.
    if (isPickerSettled(armedAt)) {
      settledRef.current = true;
      clearForcePickerCookie();
      return;
    }

    Promise.resolve().then(() => setMandatoryPick(mustPick));

    let dismissed = false;
    if (!mustPick) {
      try { dismissed = sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { /* ignore */ }
      if (dismissed) return;
    }

    const visibleOutlets = filterOutlets(accounts[0]);
    if (accounts.length === 1) {
      const needsOutletPick =
        classify(accounts[0]) === 'customer'
        && visibleOutlets.length > 1
        && !activeOutletId;
      if (needsOutletPick) {
        Promise.resolve().then(() => {
          setOutletStep(accounts[0]);
          setOpen(true);
        });
      } else if (mustPick) {
        settle();
        void update({ accountPickerCompleted: true })
          .catch(() => {})
          .then(() => completePostLoginPicker(false, accounts[0]));
      }
      return;
    }
    Promise.resolve().then(() => setOpen(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, accounts, session?.user?.id, activeOutletId, accessibleOutletIds.join(','), armedAt, onRegisterRoute, settle]);

  const finishPicker = useCallback(
    (contextChanged: boolean, chosen?: AccountSummary | null) => {
      // Assign the destination synchronously before session.update() remounts
      // this tree — otherwise Brand/Supplier clicks appear to do nothing.
      leavingRef.current = true;
      markLoginHandoff();
      markPickerInFlight();
      rememberPickedAccount(chosen?.id);
      settle();
      setOpen(false);
      setOutletStep(null);
      setPickingId(null);
      if (!contextChanged) {
        broadcastAuthEvent('session-changed', { userId: session?.user?.id });
      }
      const dest = chosen ? pickerLeavePath(chosen) : '/';
      void update({ accountPickerCompleted: true }).catch(() => {
        /* the JWT flag expires on its own — see PICKER_TTL_MS */
      });
      window.location.replace(dest);
    },
    [settle, session?.user?.id, update],
  );

  const handleDismiss = useCallback(() => {
    if (mandatoryPick) return;
    void finishPicker(false, currentAccount);
  }, [finishPicker, currentAccount, mandatoryPick]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleDismiss]);

  if (!open) return null;

  const handlePick = async (a: AccountSummary) => {
    if (leavingRef.current) return;
    const kind = classify(a);
    const needsOutlet = kind === 'customer' && filterOutlets(a).length > 1;
    // Brand and supplier never wait on switchAccount — that update() can hang
    // and leave this row disabled (click does nothing).
    if (a.isBrand || a.isVendor || !needsOutlet) {
      if (a.id !== currentAccount?.id) {
        try {
          await Promise.race([
            switchAccount(a.id, undefined, { redirect: false }),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('switch-timeout')), 2500);
            }),
          ]);
        } catch {
          /* portal layout finishes the switch after navigation */
        }
      }
      finishPicker(true, a);
      return;
    }

    setPickingId(a.id);
    if (!mandatoryPick) {
      try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    }

    let contextChanged = false;
    if (a.id !== currentAccount?.id) {
      try {
        // redirect: false — completePostLoginPicker owns the single navigation.
        await switchAccount(a.id, undefined, { redirect: false });
        contextChanged = true;
      } catch {
        clearPickerInFlight();
        setPickingId(null);
        return;
      }
    }
    accountChangedRef.current = contextChanged;
    setOutletStep(a);
    setPickingId(null);
  };

  // Dismissing is allowed when the picker is not mandatory: the session already
  // holds a valid active account, so "close" means "continue with this one".
  const closeLabel = `Continue with ${currentAccount?.displayName ?? currentAccount?.legalName ?? 'current account'}`;

  if (outletStep !== null) {
    return (
      <div
        className="fixed inset-0 bg-black/40 z-[10010] flex items-center justify-center p-4"
        onClick={mandatoryPick ? undefined : handleDismiss}
      >
        <div
          className="bg-white rounded-2xl w-full max-w-[480px] max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5 border-b border-divider flex items-center justify-between">
            <div className="flex items-center gap-2">
              {accounts.length > 1 && (
                <button
                  onClick={() => setOutletStep(null)}
                  className="p-1 rounded hover:bg-gray-100"
                  aria-label="Back to account selection"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              <div>
                <h2 className="text-[16px] font-bold text-text">Select your outlet</h2>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  Choose which outlet to operate from.
                </p>
              </div>
            </div>
            {!mandatoryPick && (
              <button
                onClick={handleDismiss}
                className="p-1 rounded hover:bg-gray-100"
                aria-label={closeLabel}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <ul className="p-2 overflow-y-auto flex-1">
            {filterOutlets(outletStep).map((o) => {
              const isCurrent = o.id === activeOutletId;
              const isPicking = pickingId === o.id;
              return (
                <li key={o.id}>
                  <button
                    onClick={async () => {
                      setPickingId(o.id);
                      const outletChanged = o.id !== activeOutletId;
                      try {
                        if (outletChanged) {
                          await switchOutlet(o.id);
                        }
                      } catch {
                        setPickingId(null);
                        return;
                      }
                      await finishPicker(
                        outletChanged || accountChangedRef.current,
                        outletStep,
                      );
                    }}
                    disabled={isPicking}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-ivory transition-colors text-left disabled:opacity-60"
                  >
                    <div className="w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0 bg-primary-light">
                      {isPicking ? (
                        <Loader2 size={18} className="animate-spin text-primary" />
                      ) : (
                        <MapPin size={18} className="text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-text truncate">{o.name}</p>
                      <p className="text-[11px] text-text-muted">{o.pincode ?? '—'}</p>
                    </div>
                    {isCurrent && (
                      <Check size={16} className="text-primary shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="p-3 border-t border-divider flex items-center justify-between gap-2">
            <p className="text-[11px] text-text-muted flex items-center gap-1">
              <ShieldCheck size={11} /> Delivery and inventory are scoped to your outlet.
            </p>
            {!mandatoryPick && (
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-ivory rounded-lg"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[10010] flex items-center justify-center p-4"
      onClick={mandatoryPick ? undefined : handleDismiss}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-[480px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-divider flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-text">Welcome back</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">
              {mandatoryPick
                ? 'Select a business account to continue.'
                : `You belong to ${accounts.length} business accounts. Pick one to continue.`}
            </p>
          </div>
          {!mandatoryPick && (
            <button
              onClick={handleDismiss}
              className="p-1 rounded hover:bg-gray-100 shrink-0"
              aria-label={closeLabel}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <ul className="p-2 overflow-y-auto flex-1">
          {accounts.map((a) => {
            const kind = classify(a);
            const conf = STYLE[kind];
            const Icon = conf.icon;
            const isCurrent = a.id === currentAccount?.id;
            const isPicking = pickingId === a.id;
            const meta = childMeta(a, kind);
            const MetaIcon = meta.Icon;
            return (
              <li key={a.id}>
                <button
                  onClick={() => handlePick(a)}
                  disabled={isPicking}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-ivory transition-colors text-left disabled:opacity-60"
                >
                  <div
                    className="w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: conf.bg }}
                  >
                    {isPicking ? (
                      <Loader2 size={18} className="animate-spin" style={{ color: conf.color }} />
                    ) : (
                      <Icon size={18} style={{ color: conf.color }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-bold text-text truncate">
                        {a.displayName ?? a.legalName}
                      </p>
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-success-light text-success">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted flex items-center gap-1">
                      <MetaIcon size={10} />
                      {meta.text}
                      {kind === 'customer' && filterOutlets(a).some((o) => o.requiresAddressUpdate) && (
                        <span className="ml-1 text-warning font-semibold">· address needed</span>
                      )}
                    </p>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0"
                    style={{ color: conf.color, backgroundColor: conf.bg }}
                  >
                    {conf.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="p-3 border-t border-divider flex items-center justify-between gap-2">
          <p className="text-[11px] text-text-muted flex items-center gap-1">
            <ShieldCheck size={11} /> Permissions update automatically when you switch.
          </p>
          {!mandatoryPick && (
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-ivory rounded-lg"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
