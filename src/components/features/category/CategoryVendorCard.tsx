'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock, Star } from 'lucide-react';
import { VENDOR_COVERS } from '@/components/features/homepage/VendorCardShared';

export function CategoryVendorCard({
  href,
  name,
  rating,
  minOrderValue,
  deliveryTime = '24 hrs',
  index,
}: {
  href: string;
  name: string;
  rating?: number;
  minOrderValue: number;
  deliveryTime?: string;
  index: number;
}) {
  const cover = VENDOR_COVERS[index % VENDOR_COVERS.length];
  const showRating = typeof rating === 'number' && rating > 0;

  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-divider overflow-hidden shadow-cdl-1 hover:shadow-cdl-2 hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200 group flex flex-col justify-between"
    >
      <div className="relative w-full h-[96px] md:h-[130px] overflow-hidden bg-ivory">
        <Image
          src={cover}
          alt={name}
          fill
          sizes="(max-width: 768px) 50vw, 220px"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <div className="p-2 md:p-3 flex flex-col flex-1 justify-between">
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <h3 className="text-[12px] md:text-sm font-bold text-text leading-tight group-hover:text-primary transition-colors line-clamp-2">
            {name}
          </h3>
          {showRating ? (
            <div className="flex items-center gap-0.5 text-[11px] font-bold text-text shrink-0">
              <Star size={11} className="fill-amber-400 text-amber-400" />
              <span>{rating}</span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between text-[11px] text-text-secondary border-t border-divider pt-2 mt-2">
          <div className="flex items-center gap-1 text-text-muted">
            <Clock size={11} />
            <span>{deliveryTime}</span>
          </div>
          <div className="font-semibold text-text">MOV ₹{minOrderValue}</div>
        </div>
      </div>
    </Link>
  );
}
