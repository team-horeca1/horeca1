'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { dal } from '@/lib/dal';

/** Priority leaf subcategory slugs for the 7 tiles (8th = See More). */
const PRIORITY_SLUGS = [
  'pulses-dal',
  'oils-ghee',
  'spices-masala',
  'grains-rice',
  'dairy-cheese-eggs',
  'frozen-foods',
  'cleaning-hygiene',
  // fallbacks if primary missing
  'grains-pulses',
  'herbs-seasonings',
  'milk-butter',
  'cleaning-supplies',
  'bakery-frozen',
  'flour-atta',
] as const;

const IMAGE_BY_SLUG: Record<string, string> = {
  'pulses-dal': '/images/category/snacks.png',
  'grains-pulses': '/images/category/snacks.png',
  'grains-rice': '/images/category/snacks.png',
  'flour-atta': '/images/category/snacks.png',
  'oils-ghee': '/images/edible-oil/saffola-gold-oil.png',
  'spices-masala': '/images/masala-salt/everest-masala.png',
  'herbs-seasonings': '/images/fruits-vegetables/corriander.png',
  'dairy-cheese-eggs': '/images/category/milk.png',
  'milk-butter': '/images/dairy/amul-butter.png',
  'frozen-foods': '/images/category/frozen foods.png',
  'bakery-frozen': '/images/category/desset.png',
  'cleaning-hygiene': '/images/product/product-img5.png',
  'cleaning-supplies': '/images/product/product-img5.png',
};

interface SubcatTile {
  id: string;
  name: string;
  slug: string;
  image: string;
}

function resolveImage(slug: string, imageUrl?: string | null): string {
  if (IMAGE_BY_SLUG[slug]) return IMAGE_BY_SLUG[slug];
  if (imageUrl && imageUrl.startsWith('/')) return imageUrl;
  return '/images/category/snacks.png';
}

function pickSubcategories(
  roots: Array<Record<string, unknown> & { children?: Array<Record<string, unknown>> }>,
): SubcatTile[] {
  const bySlug = new Map<string, Record<string, unknown>>();
  for (const root of roots) {
    const children = Array.isArray(root.children) ? root.children : [];
    if (children.length === 0) {
      bySlug.set((root.slug as string) || '', root);
      continue;
    }
    for (const child of children) {
      bySlug.set((child.slug as string) || '', child);
    }
  }

  const picked: SubcatTile[] = [];
  const seen = new Set<string>();

  for (const slug of PRIORITY_SLUGS) {
    if (picked.length >= 7) break;
    const hit = bySlug.get(slug);
    if (!hit) continue;
    const id = hit.id as string;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    picked.push({
      id,
      name: (hit.name as string) || slug,
      slug,
      image: resolveImage(slug, (hit.imageUrl as string) || null),
    });
  }

  if (picked.length < 7) {
    for (const [slug, hit] of bySlug) {
      if (picked.length >= 7) break;
      const id = hit.id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      picked.push({
        id,
        name: (hit.name as string) || slug,
        slug,
        image: resolveImage(slug, (hit.imageUrl as string) || null),
      });
    }
  }

  return picked.slice(0, 7);
}

/** Homepage 2×4 subcategory grid after Brand Store — discovery only, no prices. */
export function StartOrderSubcategories() {
  const [tiles, setTiles] = useState<SubcatTile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    dal.categories
      .listTree()
      .then((tree) => {
        if (cancelled) return;
        setTiles(pickSubcategories(tree));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setTiles([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && tiles.length === 0) return null;

  return (
    <section className="w-full py-5 md:py-8 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
        <div className="bg-white border border-divider rounded-2xl shadow-cdl-1 p-4 md:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3 md:mb-4">
            <h2 className="text-[16px] md:text-[18px] font-bold text-[#1C1C1C] m-0">
              Start Your First Order
            </h2>
            <Link
              href="/category"
              className="text-[13px] font-semibold text-primary hover:underline shrink-0"
            >
              See all →
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-2 md:gap-3">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-xl bg-[#F1F1EE] animate-pulse"
                  />
                ))
              : (
                <>
                  {tiles.map((tile) => (
                    <Link
                      key={tile.id}
                      href={`/category/${tile.slug}`}
                      className="flex flex-col items-center text-center rounded-xl bg-[#F7F6F3] border border-transparent hover:border-primary/20 hover:bg-ivory transition-colors p-2 md:p-3 min-h-[88px] md:min-h-[110px]"
                    >
                      <div className="relative w-full aspect-[4/3] max-h-[56px] md:max-h-[72px] mb-1.5">
                        <Image
                          src={tile.image}
                          alt=""
                          fill
                          className="object-contain"
                          sizes="90px"
                        />
                      </div>
                      <span className="text-[10px] md:text-[12px] font-semibold text-[#1C1C1C] leading-tight line-clamp-2">
                        {tile.name}
                      </span>
                    </Link>
                  ))}
                  <Link
                    href="/category"
                    className="flex flex-col items-center justify-center text-center rounded-xl bg-[#F7F6F3] border border-dashed border-divider hover:border-primary/30 hover:bg-primary-light/40 transition-colors p-2 md:p-3 min-h-[88px] md:min-h-[110px]"
                  >
                    <span className="text-[12px] md:text-[13px] font-bold text-primary">
                      See More →
                    </span>
                  </Link>
                </>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}
