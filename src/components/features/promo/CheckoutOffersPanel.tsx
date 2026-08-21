'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Gift, Loader2, Percent, Store, Tag, Ticket, X } from 'lucide-react';

export interface CheckoutCouponChoiceView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  minOrderValue: number | null;
  endDate: string | null;
  vendorId: string | null;
  vendorName: string | null;
  hasScope: boolean;
  eligible: boolean;
  reason: string | null;
  estimatedDiscount: number | null;
}

export interface CheckoutCashbackChoiceView {
  id: string;
  name: string;
  badgeLabel: string;
  description: string | null;
  vendorId: string | null;
  vendorName: string | null;
  minOrderValue: number | null;
  endDate: string | null;
  eligible: boolean;
  reason: string | null;
  estimatedAmount: number | null;
  isWinning: boolean;
}

export interface CheckoutStoreOfferChoiceView {
  id: string;
  name: string;
  badgeLabel: string;
  type: string;
  vendorId: string;
  vendorName: string | null;
  minOrderValue: number | null;
  endDate: string | null;
  eligible: boolean;
  reason: string | null;
  estimatedDiscount: number | null;
  isApplied: boolean;
}

export interface CheckoutOfferChoicesView {
  coupons: CheckoutCouponChoiceView[];
  cashbacks: CheckoutCashbackChoiceView[];
  storeOffers: CheckoutStoreOfferChoiceView[];
}

function couponHeadline(c: CheckoutCouponChoiceView) {
  if (c.discountType === 'percentage') {
    const cap = c.maxDiscount != null ? ` up to ₹${c.maxDiscount.toLocaleString('en-IN')}` : '';
    return `${c.discountValue}% off${cap}`;
  }
  return `₹${c.discountValue.toLocaleString('en-IN')} off`;
}

function formatEnd(endDate: string | null) {
  if (!endDate) return null;
  const d = new Date(endDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function CheckoutOffersPanel({
  offerChoices,
  appliedCode,
  appliedName,
  appliedSavings,
  couponInput,
  couponError,
  couponValidating,
  onCouponInputChange,
  onApplyInput,
  onSelectCoupon,
  onRemoveCoupon,
  rewardsBalance,
  useRewardsWallet,
  walletUseEst,
  couponBlocksWallet,
  onToggleWallet,
}: {
  offerChoices: CheckoutOfferChoicesView;
  appliedCode: string | null;
  appliedName?: string | null;
  appliedSavings?: number | null;
  couponInput: string;
  couponError: string | null;
  couponValidating: boolean;
  onCouponInputChange: (value: string) => void;
  onApplyInput: () => void;
  onSelectCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
  rewardsBalance: number;
  useRewardsWallet: boolean;
  walletUseEst: number;
  couponBlocksWallet: boolean;
  onToggleWallet: (next: boolean) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeAfterApplyRef = useRef(false);

  const coupons = offerChoices.coupons;
  const cashbacks = offerChoices.cashbacks;
  const storeOffers = offerChoices.storeOffers;
  const eligibleCount = coupons.filter((c) => c.eligible).length;
  const offerCount = coupons.length + cashbacks.length + storeOffers.length;
  const winningCashback = cashbacks.find((c) => c.isWinning && c.eligible);
  const appliedFromList = coupons.find((c) => c.code === appliedCode);

  useEffect(() => {
    Promise.resolve().then(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  // Close sheet only after an apply that originated inside the sheet.
  useEffect(() => {
    if (!closeAfterApplyRef.current) return;
    if (couponValidating) return;
    if (appliedCode) {
      closeAfterApplyRef.current = false;
      setSheetOpen(false);
      return;
    }
    // Apply failed — keep sheet open so the user sees couponError.
    closeAfterApplyRef.current = false;
  }, [couponValidating, appliedCode]);

  const handleSelect = (code: string) => {
    closeAfterApplyRef.current = true;
    onSelectCoupon(code);
  };

  const handleApplyInput = () => {
    closeAfterApplyRef.current = true;
    onApplyInput();
  };

  const sheet = sheetOpen && mounted
    ? createPortal(
        <div className="fixed inset-0 z-[10001] flex items-end md:items-center justify-center">
          <button
            type="button"
            aria-label="Close offers"
            className="absolute inset-0 bg-[#181725]/50 backdrop-blur-[2px]"
            onClick={() => setSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-offers-title"
            className="relative w-full md:w-[min(440px,92vw)] max-h-[88vh] flex flex-col bg-white rounded-t-[1.5rem] md:rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 flex items-start justify-between gap-3 px-[clamp(1rem,3vw,1.25rem)] pt-4 pb-3 border-b border-gray-100 bg-gradient-to-b from-green-50/80 to-white">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#53B175]">Savings</p>
                <h2 id="checkout-offers-title" className="text-[18px] font-black text-[#181725] leading-tight mt-0.5">
                  Coupons & offers
                </h2>
                <p className="text-[12px] text-gray-500 font-medium mt-1">
                  {eligibleCount > 0
                    ? `${eligibleCount} coupon${eligibleCount === 1 ? '' : 's'} ready for this cart`
                    : 'Browse offers or enter a code'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="p-2 rounded-full hover:bg-white/80 text-gray-500 cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-[clamp(1rem,3vw,1.25rem)] py-4 space-y-5 pb-8">
              {/* Manual code */}
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-3.5">
                <p className="text-[11px] font-bold text-gray-500 mb-2">Have a coupon code?</p>
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => onCouponInputChange(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleApplyInput(); }}
                    placeholder="ENTER CODE"
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] font-bold uppercase tracking-wide focus:outline-none focus:border-[#53B175]"
                  />
                  <button
                    type="button"
                    onClick={handleApplyInput}
                    disabled={couponValidating || !couponInput.trim()}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-[#181725] text-white text-[12px] font-bold disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-black transition-colors cursor-pointer"
                  >
                    {couponValidating ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                  </button>
                </div>
                {couponError && <p className="text-[11px] font-bold text-red-500 mt-2">{couponError}</p>}
              </div>

              {coupons.length > 0 && (
                <section>
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-2.5">
                    <Tag size={11} /> Coupons
                  </p>
                  <ul className="space-y-2.5">
                    {coupons.map((c) => {
                      const selected = appliedCode === c.code;
                      const disabled = !c.eligible && !selected;
                      return (
                        <li
                          key={c.id}
                          className={`relative overflow-hidden rounded-2xl border transition-colors ${
                            selected
                              ? 'bg-green-50/90 border-[#53B175]/50 shadow-sm'
                              : disabled
                                ? 'bg-gray-50 border-gray-100 opacity-55'
                                : 'bg-white border-gray-200 hover:border-[#53B175]/45'
                          }`}
                        >
                          <div className="flex">
                            <div
                              className={`w-1.5 shrink-0 ${
                                selected ? 'bg-[#53B175]' : disabled ? 'bg-gray-300' : 'bg-[#53B175]/70'
                              }`}
                            />
                            <div className="flex-1 min-w-0 p-3.5 flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="inline-flex items-center gap-1.5 rounded-md bg-[#181725] text-white px-2 py-1">
                                  <Ticket size={11} className="shrink-0 opacity-80" />
                                  <span className="text-[11px] font-black tracking-wider">{c.code}</span>
                                </div>
                                <p className={`text-[14px] font-black mt-2 ${disabled ? 'text-gray-400' : 'text-[#181725]'}`}>
                                  {couponHeadline(c)}
                                </p>
                                {c.eligible && c.estimatedDiscount != null && c.estimatedDiscount > 0 && (
                                  <p className="text-[12px] font-bold text-[#53B175] mt-0.5">
                                    You save ₹{c.estimatedDiscount.toLocaleString('en-IN')}
                                  </p>
                                )}
                                <p className={`text-[11px] mt-1 ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {c.name}
                                  {c.vendorName ? ` · ${c.vendorName}` : ' · Platform'}
                                  {c.minOrderValue != null ? ` · Min ₹${c.minOrderValue.toLocaleString('en-IN')}` : ''}
                                </p>
                                {disabled && c.reason && (
                                  <p className="text-[11px] font-semibold text-amber-700 mt-1.5">{c.reason}</p>
                                )}
                                {!disabled && formatEnd(c.endDate) && (
                                  <p className="text-[10px] text-gray-400 mt-1.5">Valid till {formatEnd(c.endDate)}</p>
                                )}
                              </div>
                              <div className="shrink-0 pt-0.5">
                                {selected ? (
                                  <button
                                    type="button"
                                    onClick={onRemoveCoupon}
                                    disabled={couponValidating}
                                    className="text-[12px] font-bold text-red-500 hover:underline cursor-pointer disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSelect(c.code)}
                                    disabled={disabled || couponValidating}
                                    className="min-w-[4.5rem] px-3.5 py-2 rounded-xl bg-[#53B175] text-white text-[12px] font-bold disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-[#489e67] transition-colors cursor-pointer"
                                  >
                                    {couponValidating ? <Loader2 size={13} className="animate-spin mx-auto" /> : 'Apply'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {(cashbacks.length > 0 || storeOffers.length > 0) && (
                <section>
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-2.5">
                    <Gift size={11} /> Cashback & store offers
                  </p>
                  <ul className="space-y-2.5">
                    {cashbacks.map((cb) => (
                      <li
                        key={cb.id}
                        className={`rounded-2xl border px-3.5 py-3 ${
                          cb.isWinning
                            ? 'bg-amber-50 border-amber-200'
                            : cb.eligible
                              ? 'bg-white border-gray-200'
                              : 'bg-gray-50 border-gray-100 opacity-55'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cb.eligible ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                            <Percent size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-[13px] font-bold ${cb.eligible ? 'text-[#181725]' : 'text-gray-400'}`}>
                              {cb.badgeLabel}
                            </p>
                            <p className={`text-[11px] mt-0.5 ${cb.eligible ? 'text-gray-500' : 'text-gray-400'}`}>
                              {cb.name}
                              {cb.vendorName ? ` · ${cb.vendorName}` : ' · Platform'}
                            </p>
                            {cb.isWinning && cb.estimatedAmount != null && cb.estimatedAmount > 0 && (
                              <p className="text-[11px] font-bold text-amber-700 mt-1.5">
                                Will credit ~₹{cb.estimatedAmount.toLocaleString('en-IN')} after delivery
                              </p>
                            )}
                            {cb.eligible && !cb.isWinning && cb.estimatedAmount != null && cb.estimatedAmount > 0 && (
                              <p className="text-[11px] text-gray-500 mt-1.5">
                                Up to ~₹{cb.estimatedAmount.toLocaleString('en-IN')} · best offer auto-applies
                              </p>
                            )}
                            {!cb.eligible && cb.reason && (
                              <p className="text-[11px] font-semibold text-amber-700 mt-1.5">{cb.reason}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                    {storeOffers.map((so) => (
                      <li
                        key={so.id}
                        className={`rounded-2xl border px-3.5 py-3 ${
                          so.isApplied
                            ? 'bg-green-50 border-green-200'
                            : so.eligible
                              ? 'bg-white border-gray-200'
                              : 'bg-gray-50 border-gray-100 opacity-55'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${so.eligible ? 'bg-green-100 text-[#53B175]' : 'bg-gray-100 text-gray-400'}`}>
                            <Store size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-[13px] font-bold ${so.eligible ? 'text-[#181725]' : 'text-gray-400'}`}>
                              {so.badgeLabel}
                            </p>
                            <p className={`text-[11px] mt-0.5 ${so.eligible ? 'text-gray-500' : 'text-gray-400'}`}>
                              {so.name}
                              {so.vendorName ? ` · ${so.vendorName}` : ''}
                            </p>
                            {so.isApplied && so.estimatedDiscount != null && so.estimatedDiscount > 0 && (
                              <p className="text-[11px] font-bold text-[#53B175] mt-1.5">
                                Applied · −₹{so.estimatedDiscount.toLocaleString('en-IN')}
                              </p>
                            )}
                            {!so.eligible && so.reason && (
                              <p className="text-[11px] font-semibold text-amber-700 mt-1.5">{so.reason}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {offerCount === 0 && (
                <p className="text-[13px] text-gray-500 text-center py-6">
                  No listed offers for this cart. Enter a code above if you have one.
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  const savingsLabel = appliedSavings != null && appliedSavings > 0
    ? `saves ₹${appliedSavings.toLocaleString('en-IN')}`
    : appliedFromList?.estimatedDiscount
      ? `saves ₹${appliedFromList.estimatedDiscount.toLocaleString('en-IN')}`
      : null;

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#E2E2E2] p-5 text-left shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-bold text-[#181725]">Offers & coupons</p>
          {eligibleCount > 0 && !appliedCode && (
            <span className="text-[10px] font-bold text-[#53B175] bg-green-50 px-2 py-0.5 rounded-full">
              {eligibleCount} available
            </span>
          )}
        </div>

        {appliedCode ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50/80 px-3 py-2.5">
            <div className="min-w-0 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#53B175] text-white flex items-center justify-center shrink-0">
                <Ticket size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-black text-[#53B175] tracking-wide truncate">{appliedCode}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {appliedName || appliedFromList?.name || 'Coupon applied'}
                  {savingsLabel ? ` · ${savingsLabel}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRemoveCoupon}
              disabled={couponValidating}
              className="text-[11px] font-bold text-red-500 hover:underline shrink-0 cursor-pointer disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : null}

        {winningCashback && winningCashback.estimatedAmount != null && winningCashback.estimatedAmount > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
            <Percent size={14} className="text-amber-600 shrink-0" />
            <p className="text-[11px] font-semibold text-amber-800 min-w-0">
              Est. cashback ~₹{winningCashback.estimatedAmount.toLocaleString('en-IN')} after delivery
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-gray-200 hover:border-[#53B175]/50 hover:bg-green-50/40 px-3.5 py-3 transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#181725] text-white flex items-center justify-center shrink-0">
              <Tag size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[#181725]">
                {appliedCode ? 'Change / view offers' : 'View coupons & offers'}
              </p>
              <p className="text-[11px] text-gray-500 truncate">
                {offerCount > 0
                  ? `${offerCount} offer${offerCount === 1 ? '' : 's'} for this order`
                  : 'Enter a code or browse deals'}
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-400 shrink-0" />
        </button>

        {couponError && !sheetOpen && (
          <p className="text-[11px] font-bold text-red-500">{couponError}</p>
        )}

        {rewardsBalance > 0 && (
          <label className={`flex items-center justify-between gap-3 bg-amber-50/60 border border-amber-100 rounded-xl px-3 py-2.5 ${couponBlocksWallet ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[#181725]">Use H1 Wallet</p>
              <p className="text-[11px] text-gray-500">
                {couponBlocksWallet
                  ? 'This coupon cannot be clubbed with H1 Wallet'
                  : `Balance ₹${rewardsBalance.toLocaleString('en-IN')}${useRewardsWallet && walletUseEst > 0 ? ` — applying ₹${walletUseEst.toLocaleString('en-IN')}` : ''}`}
              </p>
            </div>
            <input
              type="checkbox"
              checked={useRewardsWallet && !couponBlocksWallet}
              disabled={couponBlocksWallet}
              onChange={(e) => onToggleWallet(e.target.checked)}
              className="w-4 h-4 accent-[#53B175] shrink-0"
            />
          </label>
        )}
      </div>
      {sheet}
    </>
  );
}
