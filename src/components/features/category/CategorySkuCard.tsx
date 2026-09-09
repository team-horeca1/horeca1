'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Package, Store } from 'lucide-react';
import { formatPackSize, formatPrice } from '@/lib/utils';
import { categorySkuHref } from '@/lib/categoryBrowse';
import type { VendorProduct } from '@/types';

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

export function CategorySkuCard({
  categorySlug,
  item,
}: {
  categorySlug: string;
  item: CategorySkuItem;
}) {
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

  return (
    <Link
      href={href}
      className="group bg-white rounded-xl border border-divider overflow-hidden shadow-cdl-1 hover:shadow-cdl-2 hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200 flex flex-col"
    >
      <div className="relative aspect-square bg-ivory">
        {img ? (
          <Image src={img} alt={title} fill sizes="(max-width: 768px) 42vw, 220px" className="object-contain p-2 md:p-3" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package size={28} className="text-gray-300" strokeWidth={1.5} />
          </div>
        )}
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
        <p className="mt-auto pt-1.5 md:pt-2 inline-flex items-center gap-1 text-[11px] md:text-[12px] font-semibold text-primary">
          <Store size={12} strokeWidth={2.5} />
          {item.vendorCount} vendor{item.vendorCount === 1 ? '' : 's'}
        </p>
      </div>
    </Link>
  );
}
