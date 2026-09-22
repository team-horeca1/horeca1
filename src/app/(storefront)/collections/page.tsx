'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dal } from '@/lib/dal';
import { ShareButton } from '@/components/features/share/ShareButton';
import { collectionShareContent } from '@/lib/share-cards/types';

interface CollectionCard {
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

export default function CollectionsIndexPage() {
  const [collections, setCollections] = useState<CollectionCard[]>([]);
  const [loading, setLoading] = useState(true);

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
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-24">
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-[#E9E3DD]">
        <div className="max-w-[var(--container-max)] mx-auto px-[clamp(1rem,3vw,2rem)] py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2.5 hover:bg-[#F8E8EC] rounded-xl transition-colors active:scale-95"
              aria-label="Back to home"
            >
              <ChevronLeft size={22} className="text-[#1C1C1C]" />
            </Link>
            <div>
              <h1 className="text-[clamp(1.25rem,2vw+0.6rem,1.75rem)] font-bold text-[#1C1C1C] text-balance m-0">
                Collections
              </h1>
              <p className="text-[13px] text-[#667085] mt-0.5 text-pretty">
                Explore curated lists of top products and wholesale deals
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[var(--container-max)] mx-auto px-[clamp(1rem,3vw,2rem)] py-8">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="size-10 border-[3px] border-primary/10 border-t-primary rounded-full animate-spin" />
          </div>
        ) : collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <p className="text-[15px] font-semibold text-[#667085]">No collections available yet.</p>
            <Link href="/vendors" className="mt-4 text-[14px] font-bold text-primary hover:underline">
              Browse vendors
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {collections.map((col) => (
              <Link key={col.id} href={`/collections/${col.slug}`} className="group block relative">
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={col.image}
                    alt={col.name}
                    className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  <div className="absolute top-2.5 right-2.5 z-20">
                    <ShareButton
                      content={collectionShareContent({
                        slug: col.slug,
                        name: col.name,
                        image: col.image,
                      })}
                      variant="overlay"
                      className="size-8"
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-3 md:p-3.5 z-10">
                    <h2 className="text-[15px] md:text-[16px] font-semibold text-white leading-snug text-balance line-clamp-2">
                      {col.name}
                    </h2>
                    {col.itemCount > 0 ? (
                      <p className="mt-1 flex items-center gap-0.5 text-[12px] md:text-[13px] font-medium text-white/90 tabular-nums">
                        {col.itemCount} {col.itemCount === 1 ? 'Product' : 'Products'}
                        <ChevronRight size={14} strokeWidth={2.5} className="shrink-0 opacity-90" />
                      </p>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
