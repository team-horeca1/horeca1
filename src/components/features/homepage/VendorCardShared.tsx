'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, ArrowRight, Package, Clock, ShieldCheck } from 'lucide-react';
import type { Vendor } from '@/types';
import { ShareButton } from '@/components/features/share/ShareButton';
import { vendorShareContent } from '@/lib/share-cards/types';
import { PLACEHOLDERS } from '@/lib/constants';

export const VENDOR_COVERS = [
  '/images/placeholders/no-vendor.svg',
];

function vendorYears(createdAt?: string) {
  if (!createdAt) return null;
  const years = Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / (365.25 * 86400000)));
  return `${years}+ Yrs`;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
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
  const vendorHref = `/vendor/${vendor.id}`;
  const shareContent = vendorShareContent({
    id: vendor.id,
    name: vendor.name,
    image: vendor.logo || cover,
  });

  return (
    <article
      className={`group relative flex flex-col bg-white rounded-2xl overflow-hidden border border-border/80 
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
        {/* Soft bottom fade — keeps share readable without covering hero art */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent pointer-events-none" />

        {/* Share — stays top-right */}
        <div className="absolute top-2.5 right-2.5 z-10 pointer-events-auto">
          <ShareButton content={shareContent} variant="overlay" className="size-9" />
        </div>
      </Link>

      {/* Card Body */}
      <div className="px-4 pb-4 pt-2.5 flex flex-col flex-1">
        {/* Avatar overlaps cover; trust chips sit in body so cover art stays clean */}
        <div className="flex items-end justify-between gap-2 mb-3 relative">
          <Link
            href={vendorHref}
            className="relative -mt-9 size-14 shrink-0 z-10 rounded-2xl ring-4 ring-white shadow-md"
          >
            <span className="absolute inset-0 overflow-hidden rounded-[inherit] bg-white [transform:translateZ(0)]">
              {vendor.logo ? (
                <Image
                  src={vendor.logo}
                  alt={vendor.name}
                  fill
                  sizes="56px"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                />
              ) : (
                <span className="flex size-full items-center justify-center bg-gradient-to-br from-primary to-primary-dark font-bold text-sm tracking-wide text-white">
                  {getInitials(vendor.name)}
                </span>
              )}
            </span>
          </Link>

          <div className="flex items-center justify-end gap-1.5 pt-1 shrink-0">
            <div className="inline-flex items-center gap-1 bg-amber-50/90 border border-amber-200/80 text-amber-950 px-2.5 py-1 rounded-full text-xs font-bold">
              <Star size={13} className="text-amber-500 fill-amber-500" />
              <span>{vendor.rating ? Number(vendor.rating).toFixed(1) : '4.8'}</span>
            </div>
            {years && (
              <span className="text-xs font-medium text-text-secondary bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200/70">
                {years}
              </span>
            )}
          </div>
        </div>

        {/* Supplier Name — verified is a mark on the name, not a chip */}
        <div className="mb-2">
          <Link href={vendorHref} className="group/title block">
            <h3 className="flex items-center gap-1 text-[15px] sm:text-[16px] font-bold text-text group-hover/title:text-primary transition-colors">
              <span className="truncate">{vendor.name}</span>
              {vendor.isVerified ? (
                <ShieldCheck size={15} className="shrink-0 text-emerald-600" aria-label="Verified supplier" />
              ) : null}
            </h3>
          </Link>

          <div className="flex items-center gap-1.5 text-[12px] text-text-secondary mt-0.5 min-w-0">
            {vendor.productCount != null && vendor.productCount > 0 && (
              <span className="inline-flex items-center gap-1 shrink-0">
                <Package size={12} className="text-text-muted" />
                <span>{vendor.productCount}+ Products</span>
              </span>
            )}
            {vendor.productCount != null && vendor.productCount > 0 && (vendor.deliveryTime || vendor.deliverySchedule) && (
              <span className="text-text-muted shrink-0">·</span>
            )}
            {(vendor.deliveryTime || vendor.deliverySchedule) && (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium truncate min-w-0">
                <Clock size={12} className="shrink-0" />
                <span className="truncate">{vendor.deliverySchedule || vendor.deliveryTime}</span>
              </span>
            )}
            {(vendor.productCount != null && vendor.productCount > 0) || vendor.deliveryTime || vendor.deliverySchedule ? (
              <span className="text-text-muted shrink-0">·</span>
            ) : null}
            <span className={`shrink-0 font-medium ${vendor.minOrderValue > 0 ? 'text-text-secondary' : 'text-emerald-700'}`}>
              {vendor.minOrderValue > 0 ? `Min. ₹${vendor.minOrderValue}` : 'No min. order'}
            </span>
          </div>
        </div>

        {/* Categories Pills - Crisp, modern soft tint */}
        {categoryPills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
            {categoryPills.map((cat) => (
              <span
                key={cat}
                className="text-[11px] font-medium bg-primary-light/60 text-primary-dark px-2.5 py-0.5 rounded-md border border-primary/10 transition-colors hover:bg-primary-light"
              >
                {cat}
              </span>
            ))}
            {remainingCategories > 0 && (
              <span className="text-[10px] font-semibold text-text-muted bg-stone-100 px-1.5 py-0.5 rounded-md">
                +{remainingCategories}
              </span>
            )}
          </div>
        )}

        {/* CTA Button */}
        <div className="mt-auto pt-1">
          <Link
            href={vendorHref}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl 
              bg-primary hover:bg-primary-dark active:bg-primary-pressed text-white text-[13px] sm:text-[14px] font-semibold 
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
