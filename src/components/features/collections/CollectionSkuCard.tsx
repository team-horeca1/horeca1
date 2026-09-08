'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { CreditCard, Loader2, Minus, Package, Plus, Store, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '@/context/CartContext';
import { cn, formatPackSize } from '@/lib/utils';
import type { VendorProduct } from '@/types';

export interface CollectionSkuItem {
  master: {
    id: string;
    name: string;
    sku?: string;
    imageUrl: string | null;
    images?: string[];
    packSize: string | null;
    unit: string | null;
  };
  vendorCount: number;
  defaultOffer: VendorProduct | null;
  offers: VendorProduct[];
}

interface CollectionSkuCardProps {
  item: CollectionSkuItem;
  addingId?: string | null;
  onCompare: (item: CollectionSkuItem) => void;
  onAdd: (offer: VendorProduct) => void;
}

function masterImage(item: CollectionSkuItem): string | null {
  if (item.master.imageUrl) return item.master.imageUrl;
  if (item.master.images?.[0]) return item.master.images[0];
  return item.defaultOffer?.images?.[0] ?? null;
}

function offerInStock(offer: VendorProduct): boolean {
  return typeof offer.stock !== 'number' || offer.stock > 0;
}

export const CollectionSkuCard = React.memo(function CollectionSkuCard({
  item,
  addingId,
  onCompare,
  onAdd,
}: CollectionSkuCardProps) {
  const { groups, adjustQuantity, removeFromCart } = useCart();
  const [imgFailed, setImgFailed] = useState(false);

  const img = !imgFailed ? masterImage(item) : null;
  const pack = formatPackSize(
    item.master.packSize || item.defaultOffer?.packSize,
    item.master.unit || item.defaultOffer?.unit,
  );
  const hasOffers = item.offers.length > 0;
  const defaultOffer = item.defaultOffer;
  const canAdd = Boolean(defaultOffer && offerInStock(defaultOffer));
  const isAdding = Boolean(defaultOffer && addingId === defaultOffer.id);
  const price = defaultOffer ? Number(defaultOffer.price) : NaN;
  const hasPrice = Number.isFinite(price);

  let cartMatch: { offer: VendorProduct; quantity: number } | null = null;
  for (const offer of item.offers) {
    for (const group of groups) {
      const found = group.items.find((cartItem) => cartItem.productId === offer.id);
      if (found) {
        cartMatch = { offer, quantity: found.quantity };
        break;
      }
    }
    if (cartMatch) break;
  }

  const currentQty = cartMatch?.quantity ?? 0;
  const cartOffer = cartMatch?.offer ?? defaultOffer;

  const handleAdd = () => {
    if (!defaultOffer || !canAdd || isAdding) return;
    onAdd(defaultOffer);
  };

  const handleIncrement = () => {
    if (!cartOffer) return;
    const maxStock =
      typeof cartOffer.stock === 'number' && cartOffer.stock > 0 ? cartOffer.stock : undefined;
    if (maxStock != null && currentQty >= maxStock) {
      toast.error(`Only ${maxStock} units available`);
      return;
    }
    adjustQuantity(cartOffer.id, 1);
  };

  const handleDecrement = () => {
    if (!cartOffer) return;
    if (currentQty <= 1) {
      removeFromCart(cartOffer.id);
      return;
    }
    adjustQuantity(cartOffer.id, -1);
  };

  return (
    <article
      className={cn(
        'flex flex-col bg-white rounded-2xl border border-[#E9E3DD] overflow-hidden transition-[box-shadow,border-color] duration-200 ease-out',
        hasOffers ? 'hover:shadow-[0_8px_24px_-12px_rgba(45,9,18,0.18)] hover:border-[#D9D0C8]' : 'opacity-70',
      )}
    >
      <div className="relative aspect-square bg-[#FAF5EC]">
        {img ? (
          <Image
            src={img}
            alt={item.master.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-contain p-3 md:p-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:scale-[1.03]"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#E9E3DD]">
            <Package size={32} />
          </div>
        )}

        {hasOffers ? (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {defaultOffer?.creditBadge ? (
              <span className="inline-flex items-center gap-1 bg-white/90 backdrop-blur-md text-[#7B1FA2] px-2 py-0.5 rounded-full border border-purple-100 shadow-sm">
                <CreditCard size={9} strokeWidth={2.5} />
                <span className="text-[9px] font-bold uppercase tracking-wide leading-none">Credit</span>
              </span>
            ) : null}
            {defaultOffer && defaultOffer.bulkPrices?.length > 0 ? (
              <span className="inline-flex items-center bg-[#F8E8EC] text-[#6B1D2E] px-2 py-0.5 rounded-full border border-[#6B1D2E]/15">
                <span className="text-[9px] font-bold uppercase tracking-wide leading-none">Bulk</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3 md:p-3.5">
        <h2 className="text-[13px] md:text-[14px] font-bold text-[#1C1C1C] line-clamp-2 leading-snug min-h-[2.6em]">
          {item.master.name}
        </h2>
        {pack ? (
          <p className="mt-1 text-[11px] text-[#667085] font-medium truncate">{pack}</p>
        ) : null}

        <div className="mt-2 flex items-end justify-between gap-2">
          {hasPrice ? (
            <p className="text-[15px] md:text-[16px] font-extrabold text-[#6B1D2E] tabular-nums leading-none">
              <span className="text-[11px] font-bold">from </span>
              ₹{Math.round(price).toLocaleString('en-IN')}
            </p>
          ) : (
            <p className="text-[12px] font-semibold text-[#9CA3AF]">Price on request</p>
          )}
          <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#667085] shrink-0">
            <Store size={11} strokeWidth={2.5} />
            {item.vendorCount > 0
              ? `${item.vendorCount} supplier${item.vendorCount === 1 ? '' : 's'}`
              : 'No suppliers'}
          </p>
        </div>

        <div className="mt-auto pt-3 flex flex-col gap-1.5">
          {!hasOffers ? (
            <span className="inline-flex items-center justify-center min-h-12 rounded-xl bg-[#F3EEE8] text-[#9CA3AF] text-[13px] font-bold">
              Unavailable
            </span>
          ) : currentQty > 0 && cartOffer ? (
            <div className="flex items-stretch min-h-12 bg-primary rounded-xl overflow-hidden shadow-[0_6px_18px_-6px_rgba(107,29,46,0.35)]">
              <button
                type="button"
                onClick={handleDecrement}
                aria-label={currentQty === 1 ? 'Remove from cart' : 'Decrease quantity'}
                className="w-10 flex items-center justify-center text-white hover:bg-primary-dark active:scale-[0.97] transition-transform duration-150 ease-out"
              >
                {currentQty === 1 ? <Trash2 size={14} strokeWidth={2.5} /> : <Minus size={15} strokeWidth={3} />}
              </button>
              <span className="flex-1 flex items-center justify-center bg-white text-[14px] font-extrabold text-[#1C1C1C] tabular-nums">
                {currentQty}
              </span>
              <button
                type="button"
                onClick={handleIncrement}
                aria-label="Increase quantity"
                className="w-10 flex items-center justify-center text-white hover:bg-primary-dark active:scale-[0.97] transition-transform duration-150 ease-out"
              >
                <Plus size={15} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd || isAdding}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 min-h-12 rounded-xl text-[13px] font-bold transition-[background-color,transform] duration-150 ease-out',
                canAdd
                  ? 'bg-primary text-white hover:bg-primary-dark active:scale-[0.97] shadow-[0_6px_18px_-6px_rgba(107,29,46,0.45)]'
                  : 'bg-[#F3EEE8] text-[#9CA3AF] cursor-not-allowed',
                isAdding && 'opacity-70',
              )}
            >
              {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={3} />}
              Add
            </button>
          )}

          {hasOffers ? (
            <button
              type="button"
              onClick={() => onCompare(item)}
              className="min-h-8 text-[12px] font-semibold text-primary hover:underline underline-offset-2 active:scale-[0.97] transition-transform duration-150 ease-out"
            >
              Compare {item.vendorCount} supplier{item.vendorCount === 1 ? '' : 's'}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
});
