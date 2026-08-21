'use client';

import { Loader2, Gift, Tag, Store } from 'lucide-react';

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
  const coupons = offerChoices.coupons;
  const cashbacks = offerChoices.cashbacks;
  const storeOffers = offerChoices.storeOffers;
  const hasOfferList = coupons.length > 0 || cashbacks.length > 0 || storeOffers.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-[#E2E2E2] p-5 text-left shadow-sm space-y-4">
      <div>
        <p className="text-[12px] font-bold text-[#181725] mb-1">Offers & coupons</p>
        <p className="text-[11px] text-gray-500 font-medium mb-3">
          Select an eligible coupon. Cashback and store offers apply automatically when available.
        </p>

        {coupons.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Tag size={11} /> Coupons
            </p>
            <ul className="space-y-2">
              {coupons.map((c) => {
                const selected = appliedCode === c.code;
                const disabled = !c.eligible && !selected;
                return (
                  <li
                    key={c.id}
                    className={`rounded-xl border px-3 py-2.5 transition-colors ${
                      selected
                        ? 'bg-green-50 border-green-200'
                        : disabled
                          ? 'bg-gray-50 border-gray-100 opacity-60'
                          : 'bg-white border-gray-200 hover:border-[#53B175]/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-bold tracking-wide ${disabled ? 'text-gray-400' : 'text-[#181725]'}`}>
                          {c.code}
                        </p>
                        <p className={`text-[12px] font-semibold mt-0.5 ${disabled ? 'text-gray-400' : 'text-[#53B175]'}`}>
                          {couponHeadline(c)}
                          {c.eligible && c.estimatedDiscount != null && c.estimatedDiscount > 0
                            ? ` · save ₹${c.estimatedDiscount.toLocaleString('en-IN')}`
                            : ''}
                        </p>
                        <p className={`text-[11px] mt-0.5 truncate ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
                          {c.name}
                          {c.vendorName ? ` · ${c.vendorName}` : ' · Platform'}
                          {c.minOrderValue != null ? ` · Min ₹${c.minOrderValue.toLocaleString('en-IN')}` : ''}
                        </p>
                        {disabled && c.reason && (
                          <p className="text-[11px] font-semibold text-amber-700 mt-1">{c.reason}</p>
                        )}
                        {!disabled && formatEnd(c.endDate) && (
                          <p className="text-[10px] text-gray-400 mt-1">Valid till {formatEnd(c.endDate)}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {selected ? (
                          <button
                            type="button"
                            onClick={onRemoveCoupon}
                            disabled={couponValidating}
                            className="text-[11px] font-bold text-red-500 hover:underline cursor-pointer disabled:opacity-50"
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelectCoupon(c.code)}
                            disabled={disabled || couponValidating}
                            className="px-3 py-1.5 rounded-lg bg-[#53B175] text-white text-[11px] font-bold disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-[#489e67] transition-colors cursor-pointer"
                          >
                            {couponValidating ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(cashbacks.length > 0 || storeOffers.length > 0) && (
          <div className="space-y-2 mb-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Gift size={11} /> Cashback & store offers
            </p>
            <ul className="space-y-2">
              {cashbacks.map((cb) => (
                <li
                  key={cb.id}
                  className={`rounded-xl border px-3 py-2.5 ${
                    cb.isWinning
                      ? 'bg-amber-50 border-amber-200'
                      : cb.eligible
                        ? 'bg-white border-gray-200'
                        : 'bg-gray-50 border-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Gift size={14} className={`shrink-0 mt-0.5 ${cb.eligible ? 'text-amber-600' : 'text-gray-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12px] font-bold ${cb.eligible ? 'text-[#181725]' : 'text-gray-400'}`}>
                        {cb.badgeLabel}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${cb.eligible ? 'text-gray-500' : 'text-gray-400'}`}>
                        {cb.name}
                        {cb.vendorName ? ` · ${cb.vendorName}` : ' · Platform'}
                      </p>
                      {cb.isWinning && cb.estimatedAmount != null && cb.estimatedAmount > 0 && (
                        <p className="text-[11px] font-bold text-amber-700 mt-1">
                          Will credit ~₹{cb.estimatedAmount.toLocaleString('en-IN')} after delivery
                        </p>
                      )}
                      {cb.eligible && !cb.isWinning && cb.estimatedAmount != null && cb.estimatedAmount > 0 && (
                        <p className="text-[11px] text-gray-500 mt-1">
                          Up to ~₹{cb.estimatedAmount.toLocaleString('en-IN')} (higher offer wins automatically)
                        </p>
                      )}
                      {!cb.eligible && cb.reason && (
                        <p className="text-[11px] font-semibold text-amber-700 mt-1">{cb.reason}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
              {storeOffers.map((so) => (
                <li
                  key={so.id}
                  className={`rounded-xl border px-3 py-2.5 ${
                    so.isApplied
                      ? 'bg-green-50 border-green-200'
                      : so.eligible
                        ? 'bg-white border-gray-200'
                        : 'bg-gray-50 border-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Store size={14} className={`shrink-0 mt-0.5 ${so.eligible ? 'text-[#53B175]' : 'text-gray-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12px] font-bold ${so.eligible ? 'text-[#181725]' : 'text-gray-400'}`}>
                        {so.badgeLabel}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${so.eligible ? 'text-gray-500' : 'text-gray-400'}`}>
                        {so.name}
                        {so.vendorName ? ` · ${so.vendorName}` : ''}
                      </p>
                      {so.isApplied && so.estimatedDiscount != null && so.estimatedDiscount > 0 && (
                        <p className="text-[11px] font-bold text-[#53B175] mt-1">
                          Applied · −₹{so.estimatedDiscount.toLocaleString('en-IN')}
                        </p>
                      )}
                      {!so.eligible && so.reason && (
                        <p className="text-[11px] font-semibold text-amber-700 mt-1">{so.reason}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!hasOfferList && (
          <p className="text-[11px] text-gray-500 mb-3">No listed offers for this cart — you can still enter a code below.</p>
        )}

        <div>
          <p className="text-[11px] font-bold text-gray-500 mb-2">Have a coupon code?</p>
          {appliedCode ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[#53B175] tracking-wide">{appliedCode}</p>
                <p className="text-[11px] text-gray-500 truncate">Applied at checkout</p>
              </div>
              <button
                type="button"
                onClick={onRemoveCoupon}
                disabled={couponValidating}
                className="text-[11px] font-bold text-red-500 hover:underline shrink-0 ml-3 cursor-pointer disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={couponInput}
                onChange={(e) => onCouponInputChange(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') onApplyInput(); }}
                placeholder="Enter coupon code"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold uppercase tracking-wide focus:outline-none focus:border-[#53B175]"
              />
              <button
                type="button"
                onClick={onApplyInput}
                disabled={couponValidating || !couponInput.trim()}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-[#181725] text-white text-[12px] font-bold disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-black transition-colors cursor-pointer"
              >
                {couponValidating ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
              </button>
            </div>
          )}
          {couponError && <p className="text-[11px] font-bold text-red-500 mt-1.5">{couponError}</p>}
        </div>
      </div>

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
  );
}
