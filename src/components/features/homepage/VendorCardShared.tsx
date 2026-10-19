'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, ArrowRight, Package, ShieldCheck } from 'lucide-react';
import type { Vendor } from '@/types';
import { ShareButton } from '@/components/features/share/ShareButton';
import { vendorShareContent } from '@/lib/share-cards/types';
import { PLACEHOLDERS } from '@/lib/constants';
import { vendorPublicPath } from '@/lib/publicSlug';

export const VENDOR_COVERS = [
  '/images/placeholders/no-vendor.svg',
];

function vendorYears(createdAt?: string) {
  if (!createdAt) return null;
  const years = Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / (365.25 * 86400000)));
  return `${years}+ Yrs`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `YYYY-MM-DD` → `Mon 28 Sep 26`. Returns null when the value is not a calendar date. */
function formatNextDelivery(ymd: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${WEEKDAYS[date.getDay()]} ${day} ${MONTHS[month - 1]} ${String(year).slice(2)}`;
}

function formatMov(value: number): string {
  return `Rs. ${Math.round(value).toLocaleString('en-IN')}`;
}

interface VendorCardProps {
  vendor: Vendor;
  index: number;
  fluid?: boolean;
  priority?: boolean;
}

export function VendorCard({ vendor, index, fluid = false, priority = false }: VendorCardProps) {
  const cover = vendor.coverImage || PLACEHOLDERS.vendor;
  const categoryPills = vendor.categories.slice(0, 3);
  const remainingCategories = Math.max(0, vendor.categories.length - 3);
  const years = vendorYears(vendor.createdAt);
  const nextDelivery = vendor.nextDeliveryDate ? formatNextDelivery(vendor.nextDeliveryDate) : null;
  const vendorHref = vendorPublicPath(vendor);
  const shareContent = vendorShareContent({
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    image: vendor.logo || cover,
  });

  return (
    <article
      className={`group relative flex flex-col bg-white rounded-2xl overflow-hidden border border-[#CDC4BA] 
        shadow-[0_2px_10px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_36px_-6px_rgba(107,29,46,0.14)] 
        hover:border-primary/40 hover:-translate-y-1.5 transition-all duration-300
        ${fluid ? 'w-full max-w-[480px] mx-auto min-[500px]:max-w-none' : 'flex-none w-[280px] sm:w-[295px]'}`}
    >
      {/* Cover — 840×480 (7:4) matches vendor upload / ImagePreview vendor-cover */}
      <Link href={vendorHref} className="relative block aspect-[840/480] overflow-hidden bg-gray-100" tabIndex={-1}>
        <Image
          src={cover}
          alt={vendor.name}
          fill
          sizes="(max-width: 768px) 280px, 320px"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          loading={priority ? 'eager' : 'lazy'}
          priority={priority}
        />
        {/* Share — stays top-right */}
        <div className="absolute top-2.5 right-2.5 z-10 pointer-events-auto">
          <ShareButton content={shareContent} variant="overlay" className="size-9" />
        </div>
      </Link>

      {/* Name tag sits up on the banner, the way the logo used to */}
      <div className="px-3.5 pb-3.5 flex flex-col flex-1">
        <div className="flex justify-center -mt-4 relative z-10 px-1">
          <Link
            href={vendorHref}
            className="group/title inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-xl bg-[#FFF9F4] px-4.5 py-1.5 md:py-2 border border-[#E8DFD5] shadow-[0_4px_14px_-6px_rgba(28,28,28,0.2)] hover:border-primary/40 transition-all"
          >
            <h3 className="truncate text-[15.5px] md:text-[16px] font-extrabold text-[#181725] tracking-tight leading-none group-hover/title:text-primary transition-colors">
              {vendor.name}
            </h3>
            {vendor.isVerified ? (
              <ShieldCheck size={15} className="shrink-0 text-emerald-600" aria-label="Verified supplier" />
            ) : null}
          </Link>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
          {vendor.productCount != null && vendor.productCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[12px] text-text-secondary leading-none">
              <Package size={13} className="text-text-muted shrink-0" />
              <span className="tabular-nums">{vendor.productCount}+ products</span>
            </span>
          )}
          {Number(vendor.rating) > 0 && (
            <span className="inline-flex h-6 items-center gap-1 bg-amber-50 border border-amber-200/80 text-amber-950 px-2 rounded-full text-[11px] font-bold tabular-nums">
              <Star size={12} className="text-amber-500 fill-amber-500" />
              {Number(vendor.rating).toFixed(1)}
            </span>
          )}
          {years && (
            <span className="inline-flex h-6 items-center text-[11px] font-medium text-text-secondary bg-stone-100 px-2 rounded-full border border-stone-200/70">
              {years}
            </span>
          )}
        </div>

        {categoryPills.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
            {categoryPills.map((cat) => (
              <span
                key={cat}
                className="inline-flex h-[23px] items-center text-[11px] font-semibold leading-none bg-[#EDF5FA] text-[#1E3F5A] px-2.5 rounded-md border border-[#D0E2EF] shadow-[0_1px_2px_rgba(30,63,90,0.04)]"
              >
                {cat}
              </span>
            ))}
            {remainingCategories > 0 && (
              <span className="inline-flex h-[23px] items-center text-[10.5px] font-bold leading-none text-[#183954] bg-[#E1EDF6] px-2 rounded-md border border-[#C5DCEB]">
                +{remainingCategories}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto pt-3">
          <div className="mb-2.5 space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11.5px] font-medium text-text-secondary">Min. order value</span>
              <span className="text-[12.5px] font-semibold text-[#16A34A] tabular-nums">{formatMov(vendor.minOrderValue)}</span>
            </div>
            {nextDelivery ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11.5px] font-medium text-text-secondary">Next delivery</span>
                <span className="text-[12.5px] font-semibold text-[#16A34A] tabular-nums">{nextDelivery}</span>
              </div>
            ) : null}
          </div>
          <Link
            href={vendorHref}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl 
              bg-primary hover:bg-primary-dark active:bg-primary-pressed text-white text-[13px] font-semibold 
              shadow-sm hover:shadow-md hover:shadow-primary/25 transition-all duration-200 active:scale-[0.98]"
          >
            <span>Browse Store</span>
            <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </article>
  );
}
