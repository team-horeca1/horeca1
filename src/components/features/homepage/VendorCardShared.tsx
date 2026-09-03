'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, ArrowRight, Package, Clock, ShieldCheck } from 'lucide-react';
import type { Vendor } from '@/types';

export const VENDOR_COVERS = [
  '/images/vendors/chad-peltola-BTvQ2ET_iKc-unsplash.webp',
  '/images/vendors/eryka-ragna-K5dvZHBJp3k-unsplash.webp',
  '/images/vendors/gioia-m-EGjfIKl_ZvE-unsplash.webp',
  '/images/vendors/kylle-pangan-LjpD-uW4dH0-unsplash.webp',
  '/images/vendors/m-veven-4oHtqbwy7Lo-unsplash.webp',
  '/images/vendors/sleeba-thomas-h-T2VPkw9Kw-unsplash.webp',
  '/images/vendors/young-kane-kSDOJRNol9E-unsplash.webp',
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
  const cover = vendor.coverImage || VENDOR_COVERS[index % VENDOR_COVERS.length];
  const categoryPills = vendor.categories.slice(0, 3);
  const remainingCategories = Math.max(0, vendor.categories.length - 3);
  const years = vendorYears(vendor.createdAt);
  const vendorHref = `/vendor/${vendor.id}`;

  return (
    <article
      className={`group relative flex flex-col bg-white rounded-2xl overflow-hidden border border-border/80 
        shadow-[0_2px_10px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_16px_36px_-6px_rgba(107,29,46,0.14)] 
        hover:border-primary/40 hover:-translate-y-1.5 transition-all duration-300
        ${fluid ? 'w-full max-w-[480px] mx-auto min-[500px]:max-w-none' : 'flex-none w-[280px] sm:w-[295px]'}`}
    >
      {/* Top Banner with Cover & Floating Glass Badges */}
      <Link href={vendorHref} className="relative block h-[135px] sm:h-[145px] overflow-hidden bg-gray-100" tabIndex={-1}>
        <Image
          src={cover}
          alt={vendor.name}
          fill
          sizes="(max-width: 768px) 280px, 320px"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          loading={priority ? 'eager' : 'lazy'}
          priority={priority}
        />
        {/* Subtle Dark Gradient Overlay for Badge Contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent pointer-events-none" />

        {/* Floating Badges */}
        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between pointer-events-none">
          {vendor.isVerified ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-black/40 backdrop-blur-md border border-white/20 shadow-sm">
              <ShieldCheck size={12} className="text-emerald-400" />
              Verified
            </span>
          ) : (
            <span />
          )}

          {vendor.minOrderValue > 0 ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-primary/85 backdrop-blur-md border border-white/20 shadow-sm">
              MOV ₹{vendor.minOrderValue}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-emerald-600/85 backdrop-blur-md border border-white/20 shadow-sm">
              No Min. Order
            </span>
          )}
        </div>
      </Link>

      {/* Card Body */}
      <div className="px-4 pb-4 pt-2.5 flex flex-col flex-1">
        {/* Avatar & Right Metrics Row with Generous Breathing Room */}
        <div className="flex items-center justify-between mb-3 relative">
          {/* Brand Logo Avatar - Overlapping the cover with crisp white ring */}
          <Link
            href={vendorHref}
            className="relative -mt-9 size-14 rounded-2xl overflow-hidden ring-4 ring-white shadow-md bg-white shrink-0 group-hover:ring-primary/25 transition-all duration-300 z-10"
          >
            {vendor.logo ? (
              <Image
                src={vendor.logo}
                alt={vendor.name}
                fill
                sizes="56px"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary to-primary-dark text-white flex items-center justify-center font-bold text-sm tracking-wide">
                {getInitials(vendor.name)}
              </div>
            )}
          </Link>

          {/* Metrics Badges: Balanced vertical padding, centered in white card area */}
          <div className="flex items-center gap-1.5 pt-1">
            <div className="inline-flex items-center gap-1 bg-amber-50/90 border border-amber-200/80 text-amber-950 px-2.5 py-1 rounded-full text-xs font-bold shadow-xs">
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

        {/* Supplier Name */}
        <div className="mb-2">
          <Link href={vendorHref} className="group/title block">
            <h3 className="text-[15px] sm:text-[16px] font-bold text-text group-hover/title:text-primary transition-colors line-clamp-1">
              {vendor.name}
            </h3>
          </Link>

          {/* Trust meta line */}
          <div className="flex items-center gap-2 text-[12px] text-text-secondary mt-0.5">
            {vendor.productCount != null && vendor.productCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Package size={12} className="text-text-muted" />
                <span>{vendor.productCount}+ Products</span>
              </span>
            )}
            {vendor.productCount != null && vendor.productCount > 0 && (vendor.deliveryTime || vendor.deliverySchedule) && (
              <span className="text-text-muted">·</span>
            )}
            {(vendor.deliveryTime || vendor.deliverySchedule) && (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium truncate">
                <Clock size={12} />
                <span>{vendor.deliverySchedule || vendor.deliveryTime}</span>
              </span>
            )}
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
