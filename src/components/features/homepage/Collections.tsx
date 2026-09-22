'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { dal } from '@/lib/dal';
import { SectionHeader } from '@/components/ui/SectionHeader';

interface Collection {
  id: string;
  name: string;
  slug: string;
  image: string;
  itemCount: number;
}

const FALLBACK_IMAGE = '/images/collections/kitchen.png';

const SLUG_IMAGES: Record<string, string> = {
  'weekend-specials': '/images/collections/weekend.png',
  'kitchen-essentials': '/images/collections/kitchen.png',
  'new-arrivals': '/images/collections/new-arrivals.png',
};

export function Collections() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    dal.collections
      .list()
      .then((data) => {
        setCollections(
          data.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            image: c.imageUrl || SLUG_IMAGES[c.slug] || FALLBACK_IMAGE,
            itemCount: c.masters?.length ?? 0,
          })),
        );
      })
      .catch(() => {});
  }, []);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  };

  useEffect(() => {
    checkScroll();
  }, [collections]);

  const scrollRight = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Scroll by roughly one card (~1/5 of the visible track)
    el.scrollBy({ left: el.clientWidth / 5, behavior: 'smooth' });
    setTimeout(checkScroll, 350);
  };

  if (collections.length === 0) return null;

  return (
    <section className="w-full py-6 md:py-8 bg-background overflow-hidden">
      <div className="max-w-[var(--container-max)] mx-auto">
        <div className="px-4 md:px-[var(--container-padding)]">
          <SectionHeader
            title="Collections"
            subtitle="Explore curated lists of top products and wholesale deals"
            actionLabel="All collections →"
            actionHref="/collections"
            className="mb-4 md:mb-5"
          />
        </div>

        <div className="relative w-full">
          <div
            ref={scrollRef}
            onScroll={checkScroll}
            className="overflow-x-auto no-scrollbar scroll-smooth w-full @container"
          >
            {/*
              Card width: mobile ~2.2 visible, tablet ~3.2, desktop exactly 5
              (content width minus 4 gaps) / 5
            */}
            <div className="flex gap-3 md:gap-4 px-4 md:px-[var(--container-padding)] w-max pb-1">
              {collections.map((col) => (
                <Link
                  key={col.id}
                  href={`/collections/${col.slug}`}
                  className="group block shrink-0 w-[calc((100cqw-2rem-0.75rem)/2.15)] sm:w-[calc((100cqw-3rem-1.5rem)/3.2)] lg:w-[calc((100cqw-2*var(--container-padding)-4*1rem)/5)]"
                >
                  <div className="relative aspect-[3/4] rounded-[12px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={col.image}
                      alt={col.name}
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-3.5 md:p-4 z-10">
                      <h3 className="text-[16px] md:text-[18px] font-semibold text-white leading-snug text-balance line-clamp-2">
                        {col.name}
                      </h3>
                      {col.itemCount > 0 ? (
                        <p className="mt-1 flex items-center gap-0.5 text-[13px] md:text-[14px] font-medium text-white/90 tabular-nums">
                          {col.itemCount} {col.itemCount === 1 ? 'Product' : 'Products'}
                          <ChevronRight size={15} strokeWidth={2.5} className="shrink-0 opacity-90" />
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {canScrollRight ? (
            <button
              type="button"
              onClick={scrollRight}
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 size-11 items-center justify-center rounded-full bg-white border border-[#E9E3DD] shadow-[0_8px_24px_rgba(0,0,0,0.12)] hover:scale-105 active:scale-95 transition-transform"
              aria-label="Scroll collections"
            >
              <ChevronRight size={22} className="text-[#1C1C1C]" strokeWidth={2.5} />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
