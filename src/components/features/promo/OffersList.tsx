'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Copy, Gift, Loader2, Percent, Store, Tag } from 'lucide-react';
import { toast } from 'sonner';

export interface PublicCouponOffer {
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
}

export interface PublicStoreOffer {
  id: string;
  kind: 'vendor_promo' | 'cashback';
  name: string;
  badgeLabel: string;
  type: string;
  description: string | null;
  vendorId: string | null;
  vendorName: string | null;
  minOrderValue: number | null;
  endDate: string | null;
}

function couponHeadline(c: PublicCouponOffer) {
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

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success(`Copied ${code} — apply it at checkout`);
  } catch {
    toast.error('Could not copy code');
  }
}

export function OffersList({
  vendorId,
  compact = false,
}: {
  vendorId?: string;
  compact?: boolean;
}) {
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<PublicCouponOffer[]>([]);
  const [storeOffers, setStoreOffers] = useState<PublicStoreOffer[]>([]);

  const load = useCallback(() => {
    if (status !== 'authenticated') {
      Promise.resolve().then(() => {
        setLoading(false);
        setCoupons([]);
        setStoreOffers([]);
      });
      return;
    }
    Promise.resolve().then(() => setLoading(true));
    const qs = vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : '';
    fetch(`/api/v1/promotions/offers${qs}`)
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { coupons?: PublicCouponOffer[]; storeOffers?: PublicStoreOffer[] } }) => {
        if (!json?.success || !json.data) return;
        setCoupons(json.data.coupons ?? []);
        setStoreOffers(json.data.storeOffers ?? []);
      })
      .catch(() => {
        setCoupons([]);
        setStoreOffers([]);
      })
      .finally(() => setLoading(false));
  }, [status, vendorId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  if (status === 'unauthenticated') {
    return (
      <div className="text-center py-10 px-4">
        <Gift size={36} className="text-[#53B175] mx-auto mb-3" strokeWidth={1.5} />
        <p className="text-[16px] font-bold text-[#181725] mb-1">Sign in to see deals</p>
        <p className="text-[13px] text-gray-400 font-medium mb-4">Coupons and store offers are saved to your account.</p>
        <Link
          href="/login"
          className="inline-flex rounded-2xl bg-[#53B175] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#48a068]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (loading || status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="text-[#53B175] animate-spin" />
      </div>
    );
  }

  if (coupons.length === 0 && storeOffers.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <Tag size={32} className="text-gray-300 mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-[15px] font-bold text-[#181725]">No deals right now</p>
        <p className="text-[13px] text-gray-400 font-medium mt-1">
          New coupons and store offers will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-5' : 'space-y-8'}>
      {coupons.length > 0 && (
        <section>
          <h2 className="text-[15px] font-bold text-[#181725] mb-3">Coupons</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {coupons.map((c) => {
              const until = formatEnd(c.endDate);
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/80 to-white p-4 shadow-sm"
                >
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-1">
                    {c.vendorName ? c.vendorName : 'Platform'}
                  </p>
                  <p className="text-[16px] font-black text-[#181725] leading-tight">{c.name}</p>
                  <p className="text-[13px] font-bold text-[#53B175] mt-0.5">{couponHeadline(c)}</p>
                  {c.description && (
                    <p className="text-[12px] text-gray-500 font-medium mt-1 line-clamp-2">{c.description}</p>
                  )}
                  <p className="text-[11px] text-gray-400 font-medium mt-1">
                    {c.minOrderValue ? `Min order ₹${c.minOrderValue.toLocaleString('en-IN')}` : 'No minimum'}
                    {c.hasScope ? ' · Selected items' : ''}
                    {until ? ` · Until ${until}` : ''}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex-1 min-w-0 rounded-xl border border-dashed border-[#53B175]/40 bg-white px-3 py-2 text-[13px] font-black tracking-widest text-[#181725] truncate">
                      {c.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyCode(c.code)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#53B175] px-3.5 py-2 text-[12px] font-bold text-white hover:bg-[#48a068] cursor-pointer"
                    >
                      <Copy size={13} strokeWidth={2.5} />
                      Copy
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium mt-2">Apply this code at checkout.</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {storeOffers.length > 0 && (
        <section>
          <h2 className="text-[15px] font-bold text-[#181725] mb-3">Store offers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {storeOffers.map((o) => {
              const until = formatEnd(o.endDate);
              const href = o.vendorId ? `/vendor/${o.vendorId}` : '/vendors';
              return (
                <div
                  key={`${o.kind}-${o.id}`}
                  className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        o.kind === 'cashback' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-[#53B175]'
                      }`}
                    >
                      {o.kind === 'cashback' ? <Gift size={18} strokeWidth={2} /> : o.type === 'bxgy' ? <Percent size={18} strokeWidth={2} /> : <Store size={18} strokeWidth={2} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                        {o.kind === 'cashback' ? 'Cashback' : 'Auto-applied'}
                        {o.vendorName ? ` · ${o.vendorName}` : ' · Platform'}
                      </p>
                      <p className="text-[15px] font-black text-[#181725] leading-tight mt-0.5">{o.name}</p>
                      <p className="text-[13px] font-bold text-[#53B175] mt-0.5">{o.badgeLabel}</p>
                      {o.kind === 'cashback' && (
                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                          Final amount depends on your cart — confirmed at checkout.
                        </p>
                      )}
                      {o.description && (
                        <p className="text-[12px] text-gray-500 font-medium mt-1 line-clamp-2">{o.description}</p>
                      )}
                      {until && (
                        <p className="text-[11px] text-gray-400 font-medium mt-1">Until {until}</p>
                      )}
                      <Link
                        href={href}
                        className="inline-flex mt-3 text-[12px] font-bold text-[#53B175] hover:underline"
                      >
                        {o.vendorId ? 'Shop this vendor' : 'Browse vendors'}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
