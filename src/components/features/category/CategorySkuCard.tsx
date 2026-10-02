'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Package, Store } from 'lucide-react';
import { formatPackSize, formatPrice, cn } from '@/lib/utils';
import { categorySkuHref } from '@/lib/categoryBrowse';
import type { VendorProduct } from '@/types';
import { ShareButton } from '@/components/features/share/ShareButton';
import { productShareContent } from '@/lib/share-cards/types';

export interface CategorySkuItem {
  master: {
    id: string;
    name: string;
    imageUrl: string | null;
    images?: string[];
    packSize: string | null;
    unit: string | null;
  } | null;
  vendorCount: number;
  defaultOffer: VendorProduct;
  offers: VendorProduct[];
}

export interface CategorySkuCardProps {
  categorySlug: string;
  item: CategorySkuItem;
  onCompare?: (item: CategorySkuItem) => void;
  onAdd?: (offer: VendorProduct) => void;
  addingId?: string | null;
}

export function CategorySkuCard({
  categorySlug,
  item,
  onCompare,
  onAdd,
  addingId,
}: CategorySkuCardProps) {
  const title = item.master?.name || item.defaultOffer.displayName || item.defaultOffer.name;
  const img =
    item.master?.imageUrl ||
    item.master?.images?.[0] ||
    item.defaultOffer.images?.[0] ||
    null;
  const pack = formatPackSize(
    item.master?.packSize || item.defaultOffer.packSize,
    item.master?.unit || item.defaultOffer.unit,
  );
  const price = Number(item.defaultOffer.price);
  const href = categorySkuHref(categorySlug, item);
  const shareContent = productShareContent({
    id: item.defaultOffer.id,
    vendorId: item.defaultOffer.vendorId,
    title,
    vendorName: item.defaultOffer.vendorName,
    image: img,
    priceLabel: Number.isFinite(price) ? `From ${formatPrice(price)}` : null,
    pack: pack || null,
  });

  const handleClick = (e: React.MouseEvent) => {
    if (onCompare) {
      e.preventDefault();
      onCompare(item);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group bg-white rounded-xl border border-divider overflow-hidden shadow-cdl-1 hover:shadow-cdl-2 hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200 flex flex-col relative',
        onCompare ? 'cursor-pointer' : '',
      )}
    >
      <div className="relative aspect-square bg-white rounded-t-xl overflow-hidden">
        {img ? (
          <Image src={img} alt={title} fill sizes="(max-width: 768px) 42vw, 220px" className="object-contain p-2 md:p-3" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package size={28} className="text-gray-300" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
          <ShareButton content={shareContent} variant="overlay" />
        </div>
      </div>
      <div className="p-2 md:p-3 flex flex-col flex-1">
        <h3 className="text-[12px] md:text-[13px] font-bold text-[#1C1C1C] line-clamp-2 leading-snug group-hover:text-primary transition-colors">
          {title}
        </h3>
        {pack ? (
          <p className="mt-0.5 md:mt-1 text-[11px] text-[#667085] font-medium truncate">{pack}</p>
        ) : null}
        {Number.isFinite(price) ? (
          <p className="mt-1.5 md:mt-2 text-[13px] md:text-[14px] font-bold text-[#1C1C1C] tabular-nums">
            From {formatPrice(price)}
          </p>
        ) : null}
        
        <div className="mt-auto pt-2 flex items-center justify-between gap-1">
          <p className="inline-flex items-center gap-1 text-[11px] md:text-[12px] font-semibold text-primary">
            <Store size={12} strokeWidth={2.5} />
            {item.vendorCount} {item.vendorCount === 1 ? 'vendor' : 'vendors'}
          </p>
          <span className="text-[11px] font-bold text-primary group-hover:translate-x-0.5 transition-transform">
            View &rsaquo;
          </span>
        </div>
      </div>
    </div>
  );
}
