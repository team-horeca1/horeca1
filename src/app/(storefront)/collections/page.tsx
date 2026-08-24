'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { dal } from '@/lib/dal';

interface CollectionCard {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  category: string;
}

const COLLECTION_STYLE: Record<string, { image: string; category: string }> = {
  'weekend-specials': {
    image: '/images/collections/weekend.png',
    category: 'WEEKEND DEALS',
  },
  'kitchen-essentials': {
    image: '/images/collections/kitchen.png',
    category: 'KITCHEN & DINING',
  },
  'new-arrivals': {
    image: '/images/collections/new-arrivals.png',
    category: 'JUST ARRIVED',
  },
};

const FALLBACK_STYLE = {
  image: '/images/collections/kitchen.png',
  category: 'COLLECTION',
};

export default function CollectionsIndexPage() {
  const [collections, setCollections] = useState<CollectionCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dal.collections
      .list()
      .then((data) => {
        setCollections(
          data.map((c) => {
            const style = COLLECTION_STYLE[c.slug] || FALLBACK_STYLE;
            return {
              id: c.id,
              name: c.name,
              slug: c.slug,
              description: c.description || '',
              ...style,
            };
          }),
        );
      })
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24">
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
        <div className="max-w-[var(--container-max)] mx-auto px-[clamp(1rem,3vw,2rem)] py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2.5 hover:bg-gray-100/80 rounded-2xl transition-all active:scale-95"
            >
              <ChevronLeft size={22} className="text-gray-700" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#EEF8F1] text-[#299E60] flex items-center justify-center">
                <Layers size={18} strokeWidth={2.5} />
              </div>
              <h1 className="text-[clamp(1.25rem,2vw+0.6rem,1.75rem)] font-extrabold text-[#181725] tracking-tight">
                Curated Collections
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[var(--container-max)] mx-auto px-[clamp(1rem,3vw,2rem)] py-8">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-10 h-10 border-[3px] border-[#53B175]/10 border-t-[#53B175] rounded-full animate-spin" />
          </div>
        ) : collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <p className="text-[15px] font-semibold text-gray-500">No collections available yet.</p>
            <Link href="/vendors" className="mt-4 text-[14px] font-bold text-[#299E60] hover:opacity-80">
              Browse vendors
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {collections.map((col) => (
              <Link key={col.id} href={`/collections/${col.slug}`} className="group block">
                <div className="relative rounded-[18px] overflow-hidden aspect-[16/10] shadow-md shadow-black/8 group-hover:shadow-xl transition-shadow">
                  <img
                    src={col.image}
                    alt={col.name}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#072e16]/90 via-[#072e16]/25 to-transparent" />
                  <div className="absolute top-3 left-3 z-10">
                    <span className="inline-block px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[10px] font-bold tracking-[0.14em] text-white/90 uppercase">
                      {col.category}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#299E60] flex items-center justify-center z-10 group-hover:bg-[#238a52] transition-colors">
                    <ChevronRight size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-5 z-10">
                    <h2 className="text-[clamp(1rem,1.5vw+0.5rem,1.25rem)] font-extrabold text-white tracking-tight">
                      {col.name}
                    </h2>
                    {col.description ? (
                      <p className="text-[12px] text-white/70 font-medium mt-1 line-clamp-2">
                        {col.description}
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
