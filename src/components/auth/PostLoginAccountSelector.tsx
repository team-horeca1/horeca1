'use client';

/**
 * Shown after every fresh login when a user has 2+ BusinessAccounts.
 * Wired in the root layout. Honors a short-lived force-pick cookie set on
 * sign-in so the dismiss flag in sessionStorage cannot bypass account selection
 * across logout/login in the same tab.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useBusinessAccountSwitcher, type AccountSummary } from '@/hooks/useBusinessAccountSwitcher';
import {
  DISMISS_KEY,
  readForcePickerCookie,
  clearForcePickerCookie,
  completePostLoginPicker,
  isPickerSettled,
  markPickerSettled,
} from '@/lib/postLoginPicker';
import { broadcastAuthEvent } from '@/lib/authTabSync';
import { CDL } from '@/lib/cdl';
import { ShieldCheck, Store, Sparkles, User, MapPin, Loader2, X, ChevronLeft, Check } from 'lucide-react';

type Kind = 'customer' | 'vendor' | 'brand';
const STYLE: Record<Kind, { label: string; color: string; bg: string; icon: typeof Store }> = {
  customer: { label: 'Customer', color: CDL.info, bg: CDL.infoLight, icon: User },
  vendor:   { label: 'Supplier', color: CDL.primary, bg: CDL.primaryLight, icon: Store },
  brand:    { label: 'Brand',    color: '#7C3AED', bg: '#EDE9FE', icon: Sparkles },
};

function classify(a: AccountSummary): Kind {
  if (a.isVendor) return 'vendor';
  if (a.isBrand) return 'brand';
  return 'customer';
}

export function PostLoginAccountSelector() {
  const { data: session, status, update } = useSession();
  const { accounts, currentAccount, switchAccount, switchOutlet, activeOutletId, switching } = useBusinessAccountSwitcher();
  const [open, setOpen] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [outletStep, setOutletStep] = useState<AccountSummary | null>(null);
  const [mandatoryPick, setMandatoryPick] = useState(false);
  const accountChangedRef = useRef(false);
  // Answered in this page life — blocks the effect from reopening when the
  // session refresh that follows a pick hands us a new `accounts` array.
  const settledRef = useRef(false);

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
    if (status !== 'authenticated') return;
    if (accounts.length === 0) return;
    if (u.role === 'admin') return;
    if (settledRef.current) return;

    const hasForceCookie = readForcePickerCookie();
    const forcePick = hasForceCookie || u.forceAccountPicker === true;
    const totalCount = (u.totalAccountCount as number | undefined) ?? accounts.length;
    const mustPick = forcePick && totalCount > 1;

    // This login was already answered — stay quiet through any number of
    // reloads. The next login stamps a new armedAt and arms the picker again.
    if (forcePick && isPickerSettled(armedAt)) {
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
      const needsOutletPick = visibleOutlets.length > 1 && !activeOutletId;
      if (needsOutletPick) {
        Promise.resolve().then(() => {
          setOutletStep(accounts[0]);
          setOpen(true);
        });
      } else if (forcePick) {
        settle();
        void update({ accountPickerCompleted: true })
          .catch(() => {})
          .then(() => completePostLoginPicker(false, accounts[0]));
      }
      return;
    }
    Promise.resolve().then(() => setOpen(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, accounts, session?.user?.id, activeOutletId, accessibleOutletIds.join(','), armedAt]);

  const finishPicker = useCallback(
    async (contextChanged: boolean, chosen?: AccountSummary | null) => {
      // Settle first, synchronously: the navigation below aborts in-flight
      // requests, so the local record of the decision must already be written.
      settle();
      setOpen(false);
      setOutletStep(null);
      setPickingId(null);
      if (!contextChanged) {
        broadcastAuthEvent('session-changed', { userId: session?.user?.id });
      }
      // switchAccount / switchOutlet already broadcast 'account-switched'.
      try {
        await update({ accountPickerCompleted: true });
      } catch {
        /* the JWT flag expires on its own — see PICKER_TTL_MS */
      }
      await completePostLoginPicker(contextChanged, chosen ?? undefined);
    },
    [settle, session?.user?.id, update],
  );

  const handleDismiss = useCallback(() => {
    void finishPicker(false, currentAccount);
  }, [finishPicker, currentAccount]);

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
        setPickingId(null);
        return;
      }
    }
    if (filterOutlets(a).length > 1) {
      accountChangedRef.current = contextChanged;
      setOutletStep(a);
      setPickingId(null);
    } else {
      await finishPicker(contextChanged, a);
    }
  };

  // Dismissing is always allowed: the session already holds a valid active
  // account, so "close" simply means "continue with this one" — and it is
  // remembered, so it never pops back up for this login.
  const closeLabel = `Continue with ${currentAccount?.displayName ?? currentAccount?.legalName ?? 'current account'}`;

  if (outletStep !== null) {
    return (
      <div
        className="fixed inset-0 bg-black/40 z-[10010] flex items-center justify-center p-4"
        onClick={handleDismiss}
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
            <button
              onClick={handleDismiss}
              className="p-1 rounded hover:bg-gray-100"
              aria-label={closeLabel}
            >
              <X size={16} />
            </button>
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
                      if (outletChanged) {
                        try {
                          await switchOutlet(o.id);
                        } catch {
                          setPickingId(null);
                          return;
                        }
                      }
                      await finishPicker(
                        outletChanged || accountChangedRef.current,
                        outletStep,
                      );
                    }}
                    disabled={switching || isPicking}
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
      onClick={handleDismiss}
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
          <button
            onClick={handleDismiss}
            className="p-1 rounded hover:bg-gray-100 shrink-0"
            aria-label={closeLabel}
          >
            <X size={16} />
          </button>
        </div>

        <ul className="p-2 overflow-y-auto flex-1">
          {accounts.map((a) => {
            const kind = classify(a);
            const conf = STYLE[kind];
            const Icon = conf.icon;
            const isCurrent = a.id === currentAccount?.id;
            const isPicking = pickingId === a.id;
            return (
              <li key={a.id}>
                <button
                  onClick={() => handlePick(a)}
                  disabled={switching || isPicking}
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
                      <MapPin size={10} />
                      {filterOutlets(a).length} outlet{filterOutlets(a).length === 1 ? '' : 's'}
                      {filterOutlets(a).some((o) => o.requiresAddressUpdate) && (
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
