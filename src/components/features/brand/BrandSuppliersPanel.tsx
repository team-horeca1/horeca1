'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronDown, CreditCard, MapPin, Star, Store, X } from 'lucide-react';
import { toast } from 'sonner';

export interface BrandSupplier {
  id: string;
  name: string;
  slug?: string;
  logo: string;
  location: string;
  productIds: string[];
  prices: Record<string, string | number>;
  servicesPincode?: boolean;
  rating?: number;
  creditEnabled?: boolean;
}

export interface BrandSupplierSku {
  id: string;
  name: string;
  image: string;
  distributors: Array<{
    vendorId: string;
    vendorSlug?: string;
    distributorProductId: string;
    inStock: boolean;
    servicesPincode?: boolean;
    price: number;
  }>;
}

type SortKey = 'recommended' | 'price' | 'rating' | 'credit';

function vendorHref(vendor: BrandSupplier, sku?: BrandSupplierSku | null, brandSlug?: string): string {
  const base = `/vendor/${vendor.slug || vendor.id}`;
  if (sku) {
    const dist = sku.distributors.find((d) => d.vendorId === vendor.id);
    if (dist?.distributorProductId) return `${base}?product=${dist.distributorProductId}`;
  }
  if (brandSlug) return `${base}?brand=${brandSlug}`;
  return base;
}

function rememberNotify(key: string) {
  try { localStorage.setItem(key, String(Date.now())); } catch { /* private mode */ }
  toast.success('We will notify you when this is available in your area');
}

function SupplierAvatar({ name, logo }: { name: string; logo?: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="size-14 rounded-xl overflow-hidden bg-ivory border border-divider flex items-center justify-center shrink-0">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-[18px] font-semibold text-primary">{initial}</span>
      )}
    </div>
  );
}

export function BrandSuppliersPanel({
  brandName,
  brandSlug,
  pincode,
  vendors,
  sku,
  brandWideUnavailable,
  onClearSku,
  onBrowseCatalogue,
}: {
  brandName: string;
  brandSlug: string;
  pincode?: string;
  vendors: BrandSupplier[];
  sku: BrandSupplierSku | null;
  brandWideUnavailable: boolean;
  onClearSku: () => void;
  onBrowseCatalogue: () => void;
}) {
  const skuUnavailable = !!sku && nearbyForSku(sku) === 0;
  const [sort, setSort] = useState<SortKey>('recommended');

  if (brandWideUnavailable) {
    return (
      <UnavailableState
        title="Currently unavailable in your area"
        body={pincode ? `No ${brandName} suppliers deliver to ${pincode} yet.` : `No ${brandName} suppliers are available right now.`}
        onNotify={() => rememberNotify(`horeca_brand_notify:${brandSlug}:all:${pincode ?? 'none'}`)}
      />
    );
  }

  if (skuUnavailable) {
    return (
      <UnavailableState
        title="Currently unavailable in your area"
        body={`${sku!.name} is not stocked nearby right now.`}
        onNotify={() => rememberNotify(`horeca_brand_notify:${brandSlug}:${sku!.id}:${pincode ?? 'none'}`)}
        browseLabel={`Browse other ${brandName} products`}
        onBrowse={onBrowseCatalogue}
      />
    );
  }

  const list = sortSuppliers(vendors, sku, sort);

  return (
    <div>
      {sku && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary-tint px-3 py-2">
          <p className="flex-1 min-w-0 text-[12px] font-medium text-text truncate">
            Showing suppliers for: {sku.name}
          </p>
          <button
            type="button"
            onClick={onClearSku}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary shrink-0"
          >
            Clear
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[12px] text-text-muted tabular-nums">{list.length} suppliers</p>
        <label className="relative inline-flex items-center">
          <span className="sr-only">Sort suppliers</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="appearance-none bg-white border border-divider rounded-full pl-3 pr-8 py-1.5 text-[12px] font-medium text-text"
          >
            <option value="recommended">Recommended</option>
            {sku && <option value="price">Price</option>}
            <option value="rating">Rating</option>
            <option value="credit">Credit terms</option>
          </select>
          <ChevronDown size={14} className="absolute right-2.5 text-text-muted pointer-events-none" />
        </label>
      </div>

      {list.length === 0 ? (
        <div className="py-16 text-center">
          <Store size={36} className="mx-auto text-text-muted mb-3" strokeWidth={1.5} />
          <p className="text-[15px] font-semibold text-text">No suppliers to show</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((vendor) => {
            const skuPrice = sku ? Number(vendor.prices[sku.id] ?? 0) : 0;
            const dist = sku?.distributors.find((d) => d.vendorId === vendor.id);
            return (
              <Link
                key={vendor.id}
                href={vendorHref(vendor, sku, brandSlug)}
                className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-divider hover:border-primary/30 transition-colors"
              >
                <SupplierAvatar name={vendor.name} logo={vendor.logo} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-text truncate">{vendor.name}</p>
                  <p className="mt-0.5 text-[11px] text-text-muted flex items-center gap-1">
                    <MapPin size={11} />
                    {vendor.location}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {vendor.rating ? (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-text tabular-nums">
                        <Star size={11} className="text-warning fill-warning" />
                        {vendor.rating.toFixed(1)}
                      </span>
                    ) : null}
                    {vendor.creditEnabled && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
                        <CreditCard size={11} />
                        Credit
                      </span>
                    )}
                    {sku && skuPrice > 0 && (
                      <span className="text-[14px] font-semibold text-primary tabular-nums">₹{skuPrice}</span>
                    )}
                    {!sku && (
                      <span className="text-[11px] text-text-muted tabular-nums">
                        {vendor.productIds.length} products
                      </span>
                    )}
                    {dist && !dist.inStock && (
                      <span className="text-[10px] font-medium text-error">Out of stock</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function nearbyForSku(sku: BrandSupplierSku): number {
  return sku.distributors.filter((d) => d.inStock && d.servicesPincode !== false).length;
}

function sortSuppliers(vendors: BrandSupplier[], sku: BrandSupplierSku | null, sort: SortKey): BrandSupplier[] {
  const copy = [...vendors];
  copy.sort((a, b) => {
    const aPin = a.servicesPincode === false ? 0 : 1;
    const bPin = b.servicesPincode === false ? 0 : 1;
    if (bPin !== aPin) return bPin - aPin;

    if (sort === 'price' && sku) {
      return Number(a.prices[sku.id] ?? Infinity) - Number(b.prices[sku.id] ?? Infinity);
    }
    if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
    if (sort === 'credit') return Number(!!b.creditEnabled) - Number(!!a.creditEnabled);

    const aScore =
      (aPin * 40) +
      ((a.rating ?? 0) * 8) +
      (a.creditEnabled ? 10 : 0) +
      (sku ? Math.max(0, 20 - Number(a.prices[sku.id] ?? 20) / 50) : a.productIds.length);
    const bScore =
      (bPin * 40) +
      ((b.rating ?? 0) * 8) +
      (b.creditEnabled ? 10 : 0) +
      (sku ? Math.max(0, 20 - Number(b.prices[sku.id] ?? 20) / 50) : b.productIds.length);
    return bScore - aScore;
  });
  return copy;
}

function UnavailableState({
  title,
  body,
  onNotify,
  browseLabel,
  onBrowse,
}: {
  title: string;
  body: string;
  onNotify: () => void;
  browseLabel?: string;
  onBrowse?: () => void;
}) {
  return (
    <div className="py-16 px-4 text-center max-w-md mx-auto">
      <div className="size-14 mx-auto rounded-full bg-ivory flex items-center justify-center mb-4">
        <MapPin size={22} className="text-text-muted" />
      </div>
      <h3 className="text-[18px] font-semibold text-text text-balance">{title}</h3>
      <p className="mt-2 text-[13px] text-text-secondary text-pretty">{body}</p>
      <button
        type="button"
        onClick={onNotify}
        className="mt-5 inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-xl bg-primary text-white text-[13px] font-semibold"
      >
        <Bell size={15} />
        Notify me
      </button>
      {browseLabel && onBrowse && (
        <button
          type="button"
          onClick={onBrowse}
          className="mt-3 block mx-auto text-[13px] font-medium text-primary"
        >
          {browseLabel}
        </button>
      )}
    </div>
  );
}

