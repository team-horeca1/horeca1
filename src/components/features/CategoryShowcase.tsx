'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dal } from '@/lib/dal';
import type { Category } from '@/types';

// Original desktop category background colors
const CATEGORY_BG: Record<string, string> = {
    'vegetables': '#e8f9e9',
    'fruits': '#fff7ed',
    'dairy-eggs': '#eef2ff',
    'spices-masala': '#fef2f2',
    'grains-pulses': '#f5f3ff',
    'meat-poultry': '#fffbeb',
    'seafood': '#fdf4ff',
    'beverages': '#ecfdf5',
    'oils-ghee': '#f0fdf4',
    'packaging-supplies': '#f8fafc',
};

// High-fidelity fallback product cutouts per category/slug
const CATEGORY_IMAGE_MAP: Record<string, string> = {
  'fresh-produce': '/images/category/vegitable.png',
  'vegetables': '/images/category/vegitable.png',
  'fruits': '/images/category/fruits.png',
  'herbs-seasonings': '/images/fruits-vegetables/corriander.png',
  'dairy-cheese-eggs': '/images/category/milk.png',
  'milk-butter': '/images/dairy/amul-butter.png',
  'cheese-paneer': '/images/dairy/amul-cheese.png',
  'eggs': '/images/category/milk.png',
  'pantry-staples': '/images/category/snacks.png',
  'spices-masala': '/images/masala-salt/everest-masala.png',
  'grains-rice': '/images/category/snacks.png',
  'pulses-dal': '/images/category/snacks.png',
  'oils-ghee': '/images/edible-oil/saffola-gold-oil.png',
  'meat-poultry-seafood': '/images/category/fish & meat.png',
  'poultry': '/images/category/fish & meat.png',
  'mutton-lamb': '/images/category/fish & meat.png',
  'seafood': '/images/category/fish & meat.png',
  'beverages-drinks': '/images/category/drink-juice.png',
  'soft-drinks-water': '/images/category/drink-juice.png',
  'tea-coffee': '/images/category/drink-juice.png',
  'juices-energy': '/images/category/drink-juice.png',
  'bakery-frozen': '/images/category/desset.png',
  'bakery-bread': '/images/category/desset.png',
  'frozen-foods': '/images/category/frozen foods.png',
  'cleaning-hygiene': '/images/product/product-img5.png',
  'cleaning-supplies': '/images/product/product-img5.png',
  'disposables-packaging': '/images/category/frozen foods.png',
  'snacks-confectionery': '/images/category/candy.png',
  'snacks-namkeen': '/images/category/snacks.png',
  'sweets-confectionery': '/images/category/candy.png',
};

interface CategoryShowcaseProps {
  filterByProducts?: { category: string }[];
  title?: string;
  onCategoryClick?: (categoryName: string) => void;
  activeCategory?: string;
}

export function CategoryShowcase({
  filterByProducts,
  title = "Shop By Category",
  onCategoryClick,
  activeCategory,
}: CategoryShowcaseProps) {
  const [categories, setCategories] = useState<(Category & { bgColor: string })[]>([]);
  const [allCategoriesList, setAllCategoriesList] = useState<Category[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dal.categories.list().then((cats) => {
      let filtered = cats;
      if (filterByProducts) {
        const uniqueVendorCats = new Set(filterByProducts.map((p) => p.category));
        filtered = cats.filter((c) => uniqueVendorCats.has(c.name));
      }

      // Desktop original categories with background colors
      setCategories(filtered.map((c) => ({
        ...c,
        bgColor: CATEGORY_BG[c.slug] || '#f7f8fa',
      })));

      // Collect all categories (parents first, then subcategories)
      const parents = filtered.filter((c) => !c.parentId);
      const parentIds = new Set(parents.map((c) => c.id));
      const fullList: Category[] = [...parents];

      filtered.forEach((parent) => {
        const children = (parent as unknown as { children?: Category[] }).children;
        if (Array.isArray(children)) {
          children.forEach((child) => {
            if (!parentIds.has(child.id) && !fullList.some((c) => c.id === child.id)) {
              fullList.push(child);
            }
          });
        }
      });

      filtered.forEach((c) => {
        if (!fullList.some((existing) => existing.id === c.id)) {
          fullList.push(c);
        }
      });

      setAllCategoriesList(fullList);
    }).catch(console.error);
  }, [filterByProducts]);

  if (categories.length === 0) return null;

  const toggleExpand = () => {
    if (isExpanded && sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setIsExpanded((prev) => !prev);
  };

  // Interleave for 2-row horizontal scroll so Row 1 and Row 2 have items side by side
  const mobileList = allCategoriesList.length > 0 ? allCategoriesList : categories;
  const half = Math.ceil(mobileList.length / 2);
  const row1 = mobileList.slice(0, half);
  const row2 = mobileList.slice(half);

  const mobileHorizontalList: Category[] = [];
  for (let i = 0; i < half; i++) {
    if (row1[i]) mobileHorizontalList.push(row1[i]);
    if (row2[i]) mobileHorizontalList.push(row2[i]);
  }

  return (
    <section
      ref={sectionRef}
      className="w-full pt-6 md:pt-8 pb-4 bg-white relative z-30"
      suppressHydrationWarning
    >
      <div className="max-w-[var(--container-max)] mx-auto overflow-hidden">
        {/* Header */}
        <div className="px-4 md:px-[var(--container-padding)] mb-3 md:mb-6">
          <div className="flex items-end justify-between gap-3 mb-1">
            <div className="min-w-0">
              <h2 className="text-primary font-bold text-balance m-0 text-[clamp(1.125rem,3vw,1.25rem)] leading-snug">
                {title}
              </h2>
              {/* Desktop-only subtitle sentence — hidden on mobile */}
              <p className="hidden md:block text-[13px] text-text-secondary mt-0.5 text-pretty">
                Quality wholesale ingredients and supplies across key categories
              </p>
            </div>

            {/* View all / Show less toggle */}
            {!onCategoryClick ? (
              <button
                type="button"
                onClick={toggleExpand}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline shrink-0 bg-transparent border-0 p-0 cursor-pointer"
              >
                {isExpanded ? (
                  <>
                    Show less <ChevronUp size={16} strokeWidth={2.4} />
                  </>
                ) : (
                  <>
                    View all →
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>

        {/* Content Area */}
        <div className="relative">
          {/* ── MOBILE UI:
              1) Collapsed: 2 rows of 4 visible, horizontally scrollable to see categories on the right!
              2) Expanded: When "View all →" is clicked, all rows open downwards!
          ── */}
          <div className="md:hidden">
            {isExpanded ? (
              /* Expanded State: Rows open downwards in 4-column grid */
              <div className="px-4">
                <div className="grid grid-cols-4 gap-x-2.5 gap-y-3.5 animate-in fade-in duration-300">
                  {allCategoriesList.map((cat) => (
                    <MobileCategoryCard
                      key={cat.id}
                      cat={cat}
                      activeCategory={activeCategory}
                      onCategoryClick={onCategoryClick}
                    />
                  ))}
                </div>

                {/* Bottom Show less button */}
                <div className="flex justify-center mt-5 mb-2">
                  <button
                    type="button"
                    onClick={toggleExpand}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-white border border-divider text-[12px] font-semibold text-primary hover:bg-primary/5 active:scale-95 transition-all shadow-sm cursor-pointer"
                  >
                    Show less <ChevronUp size={15} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            ) : (
              /* Collapsed State: 2 rows (4 visible initially), horizontally scrollable to see categories on right */
              <div className="overflow-x-auto no-scrollbar scroll-smooth w-full px-4">
                <div className="grid grid-rows-2 grid-flow-col auto-cols-[calc((100vw-62px)/4)] gap-x-2.5 gap-y-3.5 py-1 w-max">
                  {mobileHorizontalList.map((cat) => (
                    <MobileCategoryCard
                      key={cat.id}
                      cat={cat}
                      activeCategory={activeCategory}
                      onCategoryClick={onCategoryClick}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── DESKTOP UI: EXACT ORIGINAL 9-COLUMN COMPACT GRID — COMPLETELY UNTOUCHED ── */}
          <div className="hidden md:block relative w-full">
            <div className="grid grid-cols-9 gap-x-3 gap-y-5 pb-4 px-4 md:px-[var(--container-padding)]">
              {(isExpanded ? categories : categories.slice(0, 18)).map((cat) => (
                <div key={cat.id} className="w-full">
                  <DesktopCategoryCard
                    cat={cat}
                    activeCategory={activeCategory}
                    onCategoryClick={onCategoryClick}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Mobile Category Card (4 per row, soft neutral squircle, 2-line title) ──
interface MobileCategoryCardProps {
  cat: Category;
  activeCategory?: string;
  onCategoryClick?: (categoryName: string) => void;
}

function MobileCategoryCard({ cat, activeCategory, onCategoryClick }: MobileCategoryCardProps) {
  const isActive = activeCategory === cat.name || activeCategory === `cat:${cat.name}`;
  const imageSrc = CATEGORY_IMAGE_MAP[cat.slug] || cat.image || '/images/category/vegitable.png';

  const content = (
    <div className="w-full flex flex-col items-center text-center">
      <div
        className={cn(
          "w-full aspect-square rounded-[18px] flex items-center justify-center relative overflow-hidden transition-all duration-200",
          isActive
            ? "bg-white border-2 border-primary shadow-sm ring-2 ring-primary/10"
            : "bg-[#F8F7F4] border border-[#ECE8E1] shadow-[0_1px_4px_rgba(0,0,0,0.02)] active:scale-95"
        )}
      >
        <div className="relative w-[70%] h-[70%]">
          <Image
            src={imageSrc}
            alt={cat.name}
            fill
            sizes="90px"
            className="object-contain"
          />
        </div>
      </div>
      <h3
        className={cn(
          "text-[10.5px] text-center font-bold leading-tight mt-1.5 line-clamp-2 min-h-[2.4em] px-0.5 break-words transition-colors",
          isActive ? "text-primary font-extrabold" : "text-[#1C1C1C]"
        )}
      >
        {cat.name}
      </h3>
    </div>
  );

  if (onCategoryClick) {
    return (
      <button type="button" onClick={() => onCategoryClick(cat.name)} className="w-full block">
        {content}
      </button>
    );
  }

  return (
    <Link href={`/category/${cat.slug}`} className="w-full block">
      {content}
    </Link>
  );
}

// ── Desktop Category Card (EXACT ORIGINAL 9-COLUMN COMPACT CARD) ──
interface DesktopCategoryCardProps {
  cat: Category & { bgColor: string };
  activeCategory?: string;
  onCategoryClick?: (categoryName: string) => void;
}

const DesktopCategoryCard = ({ cat, activeCategory, onCategoryClick }: DesktopCategoryCardProps) => {
  const isActive = activeCategory === `cat:${cat.name}` || activeCategory === cat.name;
  const sharedClass = "flex flex-col items-center group transition-transform active:scale-95 w-full";
  const content = (
    <>
      <div
        className={cn(
          "w-full aspect-square rounded-xl flex items-center justify-center mb-2 overflow-hidden relative border transition-all duration-200",
          isActive
            ? "border-primary shadow-cdl-2 ring-2 ring-primary/10 bg-white"
            : "border-divider shadow-cdl-1 group-hover:shadow-cdl-2 group-hover:border-primary/40"
        )}
        style={{ backgroundColor: isActive ? 'white' : cat.bgColor }}
      >
        <div className="relative w-[72%] h-[72%]">
          <Image
            src={cat.image || '/images/category/vegitable.png'}
            alt={cat.name}
            fill
            sizes="120px"
            className="object-contain"
          />
        </div>
      </div>
      <h3 className={cn(
        "text-[11px] md:text-[12px] text-center font-semibold leading-tight px-0.5 line-clamp-2 min-h-[2.4em] transition-colors",
        isActive ? "text-primary font-bold" : "text-text group-hover:text-primary"
      )}>
        {cat.name}
      </h3>
    </>
  );

  if (onCategoryClick) {
    return (
      <button type="button" onClick={() => onCategoryClick(cat.name)} className={sharedClass}>
        {content}
      </button>
    );
  }
  return (
    <Link href={`/category/${cat.slug}`} className={sharedClass}>
      {content}
    </Link>
  );
};
