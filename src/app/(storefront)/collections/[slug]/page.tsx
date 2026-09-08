'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, MapPin, Package, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { dal } from '@/lib/dal';
import { useAddress } from '@/context/AddressContext';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { useCart } from '@/context/CartContext';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { VendorOfferPicker } from '@/components/features/homepage/VendorOfferPicker';
import {
  CollectionSkuCard,
  type CollectionSkuItem,
} from '@/components/features/collections/CollectionSkuCard';
import { cn } from '@/lib/utils';
import type { VendorProduct } from '@/types';

interface CollectionDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  items: CollectionSkuItem[];
}

type SortKey = 'curated' | 'price_asc' | 'suppliers_desc';

const COLLECTION_STYLE: Record<string, { image: string }> = {
  'weekend-specials': { image: '/images/collections/weekend.png' },
  'kitchen-essentials': { image: '/images/collections/kitchen.png' },
  'new-arrivals': { image: '/images/collections/new-arrivals.png' },
};

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'curated', label: 'Curated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'suppliers_desc', label: 'Most suppliers' },
];

function itemHasStock(item: CollectionSkuItem): boolean {
  return item.offers.some((offer) => offer.stock == null || offer.stock > 0);
}

function CollectionDetailSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-28">
      <div className="md:max-w-[var(--container-max)] md:mx-auto md:px-[clamp(1rem,3vw,2rem)] md:pt-6">
        <div className="h-[clamp(10rem,28vw,16rem)] w-full bg-[#E9E3DD] animate-pulse md:rounded-3xl" />
      </div>
      <div className="max-w-[var(--container-max)] mx-auto px-[clamp(1rem,3vw,2rem)] py-6">
        <div className="mb-4 h-10 rounded-xl bg-[#E9E3DD] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#E9E3DD] bg-white overflow-hidden">
              <div className="aspect-square bg-[#FAF5EC] animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-4/5 rounded bg-[#E9E3DD] animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-[#E9E3DD] animate-pulse" />
                <div className="h-5 w-2/3 rounded bg-[#E9E3DD] animate-pulse" />
                <div className="h-12 w-full rounded-xl bg-[#F3EEE8] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CollectionDetailPage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [picker, setPicker] = useState<CollectionSkuItem | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('curated');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);

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
        setHeroFailed(false);
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

  const items = useMemo(() => collection?.items ?? [], [collection]);

  const stats = useMemo(() => {
    const skuCount = items.length;
    const supplierIds = new Set<string>();
    let lowestPrice: number | null = null;
    for (const item of items) {
      for (const offer of item.offers) {
        if (offer.vendorId) supplierIds.add(offer.vendorId);
      }
      const price = item.defaultOffer ? Number(item.defaultOffer.price) : NaN;
      if (Number.isFinite(price) && (lowestPrice == null || price < lowestPrice)) {
        lowestPrice = price;
      }
    }
    return {
      skuCount,
      supplierCount: supplierIds.size,
      lowestPrice,
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (inStockOnly) {
      list = list.filter(itemHasStock);
    }
    if (sortKey === 'curated') return list;
    const copy = list.slice();
    if (sortKey === 'price_asc') {
      copy.sort((a, b) => {
        const pa = a.defaultOffer ? Number(a.defaultOffer.price) : NaN;
        const pb = b.defaultOffer ? Number(b.defaultOffer.price) : NaN;
        const aMissing = !Number.isFinite(pa);
        const bMissing = !Number.isFinite(pb);
        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;
        return pa - pb;
      });
    } else {
      copy.sort((a, b) => b.vendorCount - a.vendorCount);
    }
    return copy;
  }, [items, sortKey, inStockOnly]);

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

  const openCompare = (item: CollectionSkuItem) => {
    if (item.offers.length === 0) return;
    setPicker(item);
  };

  const clearFilters = () => {
    setSortKey('curated');
    setInStockOnly(false);
  };

  if (loading) {
    return <CollectionDetailSkeleton />;
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
    !heroFailed &&
    (collection.imageUrl || COLLECTION_STYLE[collection.slug]?.image || '/images/collections/kitchen.png');

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-28">
      <div className="md:max-w-[var(--container-max)] md:mx-auto md:px-[clamp(1rem,3vw,2rem)] md:pt-6">
        <div className="relative h-[clamp(10rem,28vw,16rem)] w-full overflow-hidden md:rounded-3xl">
          {heroImage ? (
            <Image
              src={heroImage}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
              onError={() => setHeroFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 bg-[#2d0912]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#2d0912]/90 via-[#2d0912]/40 to-black/20" />

          <div className="absolute inset-x-0 top-0 p-4 md:p-5">
            <Link
              href="/collections"
              className="md:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 backdrop-blur-md text-white text-[13px] font-bold hover:bg-white/25 active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
              Collections
            </Link>
            <nav
              aria-label="Breadcrumb"
              className="hidden md:flex items-center gap-1.5 text-[13px] font-semibold text-white/80"
            >
              <Link href="/" className="hover:text-white transition-colors duration-150">
                Home
              </Link>
              <span className="text-white/40">/</span>
              <Link href="/collections" className="hover:text-white transition-colors duration-150">
                Collections
              </Link>
              <span className="text-white/40">/</span>
              <span className="text-white truncate max-w-[20rem]">{collection.name}</span>
            </nav>
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
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.skuCount > 0 ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-[12px] font-semibold">
                  {stats.skuCount} SKU{stats.skuCount === 1 ? '' : 's'}
                </span>
              ) : null}
              {stats.supplierCount > 0 ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-[12px] font-semibold">
                  {stats.supplierCount} supplier{stats.supplierCount === 1 ? '' : 's'}
                </span>
              ) : null}
              {stats.lowestPrice != null ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-[12px] font-semibold tabular-nums">
                  from ₹{Math.round(stats.lowestPrice).toLocaleString('en-IN')}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[var(--container-max)] mx-auto px-[clamp(1rem,3vw,2rem)] py-6 md:py-8">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-[#E9E3DD]">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF5EC] flex items-center justify-center mb-4">
              <Package size={28} className="text-[#D9D0C8]" />
            </div>
            <p className="text-[16px] font-bold text-[#1C1C1C]">No products in this collection yet</p>
            <p className="mt-1 text-[13px] text-[#667085] max-w-sm">
              We’re still curating SKUs for this set. Browse vendors in the meantime.
            </p>
            <Link
              href="/vendors"
              className="mt-5 inline-flex items-center justify-center min-h-12 px-5 rounded-xl bg-primary text-white text-[14px] font-bold hover:bg-primary-dark active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out"
            >
              Browse vendors
            </Link>
          </div>
        ) : (
          <>
            <div className="sticky top-[3.6rem] lg:top-[4.75rem] z-30 -mx-[clamp(1rem,3vw,2rem)] px-[clamp(1rem,3vw,2rem)] py-3 mb-4 bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#E9E3DD]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] font-semibold text-[#667085]">
                  {visibleItems.length === items.length
                    ? `${visibleItems.length} SKU${visibleItems.length === 1 ? '' : 's'}`
                    : `${visibleItems.length} of ${items.length} SKUs`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {validPincode ? (
                    <span className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-[#F8E8EC] text-primary text-[12px] font-semibold">
                      <MapPin size={12} strokeWidth={2.5} />
                      Delivering to {validPincode}
                    </span>
                  ) : null}
                  <label className="relative inline-flex items-center">
                    <SlidersHorizontal
                      size={13}
                      className="absolute left-3 text-[#667085] pointer-events-none"
                    />
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      className="h-10 appearance-none rounded-xl border border-[#E9E3DD] bg-white pl-8 pr-8 text-[13px] font-semibold text-[#1C1C1C] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      aria-label="Sort collection"
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setInStockOnly((prev) => !prev)}
                    aria-pressed={inStockOnly}
                    className={cn(
                      'h-10 px-3 rounded-full text-[13px] font-semibold border transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]',
                      inStockOnly
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-[#667085] border-[#E9E3DD] hover:border-[#D9D0C8]',
                    )}
                  >
                    In stock only
                  </button>
                </div>
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-[#E9E3DD]">
                <Package size={28} className="text-[#D9D0C8] mb-3" />
                <p className="text-[15px] font-bold text-[#1C1C1C]">No SKUs match these filters</p>
                <p className="mt-1 text-[13px] text-[#667085]">
                  Try showing all products, or switch back to curated order.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-5 inline-flex items-center justify-center min-h-12 px-5 rounded-xl bg-primary text-white text-[14px] font-bold hover:bg-primary-dark active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
                {visibleItems.map((item) => (
                  <CollectionSkuCard
                    key={item.master.id}
                    item={item}
                    addingId={addingId}
                    onCompare={openCompare}
                    onAdd={handleAddOffer}
                  />
                ))}
              </div>
            )}
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
