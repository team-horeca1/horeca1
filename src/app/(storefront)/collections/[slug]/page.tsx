'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Package } from 'lucide-react';
import { dal } from '@/lib/dal';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';

interface CollectionProductRow {
  id: string;
  productId: string;
  vendorId: string;
  product?: {
    id: string;
    name?: string;
    imageUrl?: string | null;
    packSize?: string | null;
    unit?: string | null;
    basePrice?: number | string | null;
  } | null;
  vendor?: {
    id: string;
    businessName?: string;
  } | null;
}

interface CollectionDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  products: CollectionProductRow[];
}

const COLLECTION_STYLE: Record<string, { image: string }> = {
  'weekend-specials': { image: '/images/collections/weekend.png' },
  'kitchen-essentials': { image: '/images/collections/kitchen.png' },
  'new-arrivals': { image: '/images/collections/new-arrivals.png' },
};

function formatPrice(value: number | string | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function CollectionDetailPage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    dal.collections
      .list()
      .then((data) => {
        if (cancelled) return;
        const found = data.find(
          (c) => c.slug === slug || c.slug.toLowerCase() === slug.toLowerCase(),
        ) as CollectionDetail | undefined;
        if (!found) {
          setCollection(null);
          setNotFound(true);
          return;
        }
        setCollection({
          id: found.id,
          name: found.name,
          slug: found.slug,
          description: found.description ?? null,
          imageUrl: (found as { imageUrl?: string | null }).imageUrl ?? null,
          products: (found.products as CollectionProductRow[]) || [],
        });
      })
      .catch(() => {
        if (!cancelled) {
          setCollection(null);
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-[#53B175] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !collection) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F9FA] px-6 text-center">
        <Package size={40} className="text-gray-300 mb-4" />
        <h1 className="text-[22px] font-extrabold text-[#181725] mb-2">Collection not found</h1>
        <p className="text-[14px] text-gray-500 mb-6">This collection may have been removed or the link is outdated.</p>
        <Link href="/collections" className="text-[14px] font-bold text-[#299E60] hover:opacity-80">
          Browse all collections
        </Link>
      </div>
    );
  }

  const heroImage =
    collection.imageUrl ||
    COLLECTION_STYLE[collection.slug]?.image ||
    '/images/collections/kitchen.png';
  const products = collection.products || [];

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-28">
      <div className="relative h-[clamp(10rem,28vw,16rem)] w-full overflow-hidden">
        <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#072e16]/85 via-[#072e16]/35 to-black/20" />
        <div className="absolute inset-x-0 top-0 p-4">
          <Link
            href="/collections"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 backdrop-blur-md text-white text-[13px] font-bold hover:bg-white/25 transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
            Collections
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-[clamp(1rem,3vw,1.75rem)]">
          <h1 className="text-[clamp(1.5rem,3vw+0.5rem,2.25rem)] font-extrabold text-white tracking-tight">
            {collection.name}
          </h1>
          {collection.description ? (
            <p className="mt-1 text-[clamp(0.8rem,1.5vw+0.4rem,1rem)] text-white/75 font-medium max-w-2xl">
              {collection.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="max-w-[var(--container-max)] mx-auto px-[clamp(1rem,3vw,2rem)] py-8">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-gray-100">
            <Package size={36} className="text-gray-300 mb-3" />
            <p className="text-[15px] font-semibold text-gray-500">No products in this collection yet.</p>
            <Link href="/vendors" className="mt-4 text-[14px] font-bold text-[#299E60] hover:opacity-80">
              Browse vendors instead
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {products.map((row) => {
              const product = row.product;
              if (!product?.id) return null;
              const href = `/product/${product.id}`;
              const vendorName = row.vendor?.businessName;
              return (
                <Link
                  key={row.id || product.id}
                  href={href}
                  className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="relative aspect-square bg-gray-50">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name || 'Product'}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                        <Package size={32} />
                      </div>
                    )}
                  </div>
                  <div className="p-3 md:p-4">
                    <h2 className="text-[13px] md:text-[14px] font-bold text-[#181725] line-clamp-2 leading-snug">
                      {product.name || 'Product'}
                    </h2>
                    {vendorName ? (
                      <p className="mt-1 text-[11px] text-gray-400 font-medium truncate">{vendorName}</p>
                    ) : null}
                    <p className="mt-2 text-[14px] font-extrabold text-[#299E60]">
                      {formatPrice(product.basePrice)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <StickyCartBar />
    </div>
  );
}
