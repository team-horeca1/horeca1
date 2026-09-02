'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, CheckCircle2, Grid3X3, Package } from 'lucide-react';
import type { Vendor } from '@/types';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';

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
  return `${years}+ Years`;
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
  const years = vendorYears(vendor.createdAt);

  return (
    <article
      className={`${fluid ? 'w-full max-w-[480px] mx-auto min-[500px]:max-w-none' : 'flex-none w-[260px] md:w-[280px]'}
        bg-white rounded-xl overflow-hidden border border-primary/30 shadow-cdl-1 flex flex-col`}
    >
      <div className="relative h-[120px] md:h-[140px]">
        <Image
          src={cover}
          alt={vendor.name}
          fill
          sizes="280px"
          className="object-cover"
          loading={priority ? 'eager' : 'lazy'}
          priority={priority}
        />
        {vendor.logo && (
          <div className="absolute left-3 -bottom-4 size-12 rounded-lg bg-white border border-divider shadow-cdl-1 overflow-hidden">
            <Image src={vendor.logo} alt="" width={48} height={48} className="object-contain p-1" />
          </div>
        )}
      </div>

      <div className="pt-6 px-3 pb-3 flex flex-col flex-1">
        <div className="flex items-start gap-1 mb-1">
          <h3 className="text-[15px] font-bold text-text line-clamp-1 flex-1">{vendor.name}</h3>
          {vendor.isVerified && (
            <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" aria-label="Verified" />
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-2">
          <span className="inline-flex items-center gap-0.5 font-semibold text-text">
            {vendor.rating}
            <Star size={12} className="text-warning fill-warning" />
          </span>
          {vendor.minOrderValue > 0 && (
            <span className="text-text-muted">· MOV ₹{vendor.minOrderValue}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1 mb-2 min-h-[22px]">
          {vendor.isVerified && (
            <Chip variant="neutral" className="text-[10px] h-5 px-2">Verified Store</Chip>
          )}
          {years && <Chip variant="neutral" className="text-[10px] h-5 px-2">{years}</Chip>}
          {vendor.productCount != null && vendor.productCount > 0 && (
            <Chip variant="neutral" icon={<Package size={10} />} className="text-[10px] h-5 px-2">
              {vendor.productCount}+ Products
            </Chip>
          )}
          {categoryPills.length > 0 && (
            <Chip variant="neutral" icon={<Grid3X3 size={10} />} className="text-[10px] h-5 px-2">
              {categoryPills.length}+ Categories
            </Chip>
          )}
        </div>

        {categoryPills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {categoryPills.map((cat) => (
              <span key={cat} className="text-[10px] font-medium bg-ivory text-text-secondary rounded-full px-2 py-0.5 border border-divider">
                {cat}
              </span>
            ))}
            {vendor.categories.length > 3 && (
              <span className="text-[10px] text-text-muted px-1">+{vendor.categories.length - 3}</span>
            )}
          </div>
        )}

        <Button href={`/vendor/${vendor.id}`} size="md" fullWidth className="mt-auto">
          Browse Store →
        </Button>
      </div>
    </article>
  );
}
