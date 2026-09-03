'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Package, Store } from 'lucide-react';
import { toast } from 'sonner';
import { dal } from '@/lib/dal';
import { useAddress } from '@/context/AddressContext';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { useCart } from '@/context/CartContext';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { VendorOfferPicker } from '@/components/features/homepage/VendorOfferPicker';
import type { VendorProduct } from '@/types';

interface MasterCardItem {
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

interface CollectionDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  items: MasterCardItem[];
}

const COLLECTION_STYLE: Record<string, { image: string }> = {
  'weekend-specials': { image: '/images/collections/weekend.png' },
  'kitchen-essentials': { image: '/images/collections/kitchen.png' },
  'new-arrivals': { image: '/images/collections/new-arrivals.png' },
};

function masterImage(item: MasterCardItem): string | null {
  if (item.master.imageUrl) return item.master.imageUrl;
  if (item.master.images?.[0]) return item.master.images[0];
  return item.defaultOffer?.images?.[0] ?? null;
}

function packLabel(item: MasterCardItem): string | null {
  const pack = item.master.packSize || item.defaultOffer?.packSize;
  const unit = item.master.unit || item.defaultOffer?.unit;
  if (pack && unit && !String(pack).includes(String(unit))) return `${pack} ${unit}`;
  return pack || unit || null;
}

export default function CollectionDetailPage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [picker, setPicker] = useState<MasterCardItem | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const { addToCart } = useCart();
  const { selectedAddress } = useAddress();
  const { currentOutlet } = useBusinessAccountSwitcher();
  const pincode = currentOutlet?.pincode ?? selectedAddress?.pincode;
  const validPincode = pincode && /^\d{6}$/.test(pincode) ? pincode : undefined;

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    dal.collections
      .getBySlug(slug, { pincode: validPincode })
      .then((data) => {
        if (cancelled) return;
        setCollection(data);
      })
      .catch(() => {
        if (!cancelled) {
          setCollection(null);
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, validPincode]);

  const handleAddOffer = (offer: VendorProduct) => {
    setAddingId(offer.id);
    try {
      addToCart(offer, offer.minOrderQuantity || 1);
      toast.success(`Added from ${offer.vendorName || 'supplier'}`);
      setPicker(null);
    } catch {
      toast.error('Could not add to cart');
    } finally {
      queueMicrotask(() => setAddingId(null));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !collection) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF7F2] px-6 text-center">
        <Package size={40} className="text-[#E9E3DD] mb-4" />
        <h1 className="text-[22px] font-extrabold text-[#1C1C1C] mb-2">Collection not found</h1>
        <p className="text-[14px] text-[#667085] mb-6">
          This collection may have been removed or the link is outdated.
        </p>
        <Link href="/collections" className="text-[14px] font-bold text-primary hover:opacity-80">
          Browse all collections
        </Link>
      </div>
    );
  }

  const heroImage =
    collection.imageUrl ||
    COLLECTION_STYLE[collection.slug]?.image ||
    '/images/collections/kitchen.png';
  const items = collection.items || [];

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-28">
      <div className="relative h-[clamp(10rem,28vw,16rem)] w-full overflow-hidden">
        <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2d0912]/90 via-[#2d0912]/40 to-black/20" />
        <div className="absolute inset-x-0 top-0 p-4">
          <Link
            href="/collections"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 backdrop-blur-md text-white text-[13px] font-bold hover:bg-white/25 transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
            Collections
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-[clamp(1rem,3vw,1.75rem)]">
          <h1 className="text-[clamp(1.5rem,3vw+0.5rem,2.25rem)] font-extrabold text-white tracking-tight">
            {collection.name}
          </h1>
          {collection.description ? (
            <p className="mt-1 text-[clamp(0.8rem,1.5vw+0.4rem,1rem)] text-white/75 font-medium max-w-2xl">
              {collection.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="max-w-[var(--container-max)] mx-auto px-[clamp(1rem,3vw,2rem)] py-8">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-[#E9E3DD]">
            <Package size={36} className="text-[#E9E3DD] mb-3" />
            <p className="text-[15px] font-semibold text-[#667085]">
              No products in this collection yet.
            </p>
            <Link href="/vendors" className="mt-4 text-[14px] font-bold text-primary hover:opacity-80">
              Browse vendors instead
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-[#667085]">
                {items.length} curated SKU{items.length === 1 ? '' : 's'}
              </p>
              <p className="text-[12px] text-[#9CA3AF] font-medium">Tap a card to choose supplier</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {items.map((item) => {
                const img = masterImage(item);
                const pack = packLabel(item);
                const hasOffers = item.offers.length > 0;
                return (
                  <button
                    key={item.master.id}
                    type="button"
                    onClick={() => {
                      if (hasOffers) setPicker(item);
                      else toast.message('No suppliers available for this SKU right now');
                    }}
                    className="group text-left bg-white rounded-2xl border border-[#E9E3DD] overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <div className="relative aspect-[4/3] bg-gradient-to-b from-[#FFF7F0] to-[#FAF5EC] p-3 md:p-4">
                      {img ? (
                        <img
                          src={img}
                          alt={item.master.name}
                          className="absolute inset-0 w-full h-full object-contain p-3 md:p-4 group-hover:scale-[1.02] transition-transform duration-300"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[#E9E3DD]">
                          <Package size={32} />
                        </div>
                      )}
                    </div>
                    <div className="p-3 md:p-4">
                      <h2 className="text-[13px] md:text-[14px] font-bold text-[#1C1C1C] line-clamp-2 leading-snug min-h-[2.6em]">
                        {item.master.name}
                      </h2>
                      {pack ? (
                        <p className="mt-1 text-[11px] text-[#667085] font-medium truncate">{pack}</p>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                          <Store size={12} strokeWidth={2.5} />
                          {item.vendorCount > 0
                            ? `${item.vendorCount} supplier${item.vendorCount === 1 ? '' : 's'}`
                            : 'No suppliers'}
                        </p>
                        <span className="text-[11px] font-bold text-[#6B1D2E]">
                          {hasOffers ? 'Choose →' : 'Unavailable'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {picker ? (
        <VendorOfferPicker
          productName={picker.master.name}
          offers={picker.offers}
          pincode={validPincode}
          addingId={addingId}
          onClose={() => setPicker(null)}
          onAdd={handleAddOffer}
        />
      ) : null}

      <StickyCartBar />
    </div>
  );
}
