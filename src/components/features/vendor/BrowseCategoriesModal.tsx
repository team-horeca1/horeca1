'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { X, Search, LayoutGrid, Tag, Zap, Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CategoryTreeNode } from '@/lib/categoryTree';

interface BrowseCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorName: string;
  categories: CategoryTreeNode[];
  activeTab: string;
  totalProductsCount: number;
  onSelectCategory: (tabKey: string) => void;
  hasDeals?: boolean;
  hasFrequent?: boolean;
}

function getCategoryEmoji(name: string): string {
  if (!name || typeof name !== 'string') return '📦';
  const n = name.toLowerCase();
  if (n.includes('dairy') || n.includes('milk') || n.includes('cheese') || n.includes('paneer') || n.includes('butter')) return '🧀';
  if (n.includes('beverage') || n.includes('syrup') || n.includes('drink') || n.includes('juice') || n.includes('tea') || n.includes('coffee') || n.includes('bar & brew')) return '☕';
  if (n.includes('oil') || n.includes('ghee')) return '🫒';
  if (n.includes('grain') || n.includes('rice') || n.includes('atta') || n.includes('flour')) return '🌾';
  if (n.includes('spice') || n.includes('masala') || n.includes('season')) return '🧂';
  if (n.includes('sauce') || n.includes('dip') || n.includes('ketchup') || n.includes('mayo') || n.includes('dessert sauce')) return '🥫';
  if (n.includes('pulse') || n.includes('dal') || n.includes('bean')) return '🫘';
  if (n.includes('frozen') || n.includes('ice') || n.includes('peas')) return '🧊';
  if (n.includes('pack') || n.includes('disposable') || n.includes('container') || n.includes('box')) return '📦';
  if (n.includes('clean') || n.includes('wash') || n.includes('hygiene') || n.includes('chemical')) return '🧼';
  if (n.includes('kitchen') || n.includes('cook') || n.includes('utensil') || n.includes('tableware')) return '🍳';
  if (n.includes('bakery') || n.includes('bread') || n.includes('bun') || n.includes('cake')) return '🍞';
  if (n.includes('meat') || n.includes('chicken') || n.includes('poultry') || n.includes('seafood') || n.includes('fish') || n.includes('prawn')) return '🍗';
  if (n.includes('veg') || n.includes('fruit') || n.includes('salad') || n.includes('organic')) return '🥗';
  if (n.includes('sweet') || n.includes('dessert') || n.includes('confection') || n.includes('chocolate')) return '🍫';
  if (n.includes('snack') || n.includes('namkeen') || n.includes('chip')) return '🥨';
  return '📦';
}

export function BrowseCategoriesModal({
  isOpen,
  onClose,
  vendorName,
  categories,
  activeTab,
  totalProductsCount,
  onSelectCategory,
  hasDeals = false,
  hasFrequent = false,
}: BrowseCategoriesModalProps) {
  const [filterQuery, setFilterQuery] = useState('');

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Filtered list
  const filteredCategories = useMemo(() => {
    if (!filterQuery.trim()) return categories;
    const q = filterQuery.toLowerCase().trim();
    return categories.filter(
      (c) =>
        (typeof c.name === 'string' && c.name.toLowerCase().includes(q)) ||
        c.children?.some((child) => typeof child.name === 'string' && child.name.toLowerCase().includes(q)),
    );
  }, [categories, filterQuery]);

  if (!isOpen) return null;

  const handleSelect = (key: string) => {
    onSelectCategory(key);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal / Bottom Sheet Content */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="browse-categories-title"
        className={cn(
          'relative w-full z-10 bg-white shadow-2xl flex flex-col',
          'rounded-t-[28px] md:rounded-3xl',
          'max-h-[88vh] md:max-h-[82vh]',
          'md:max-w-2xl lg:max-w-3xl md:mx-4',
          'animate-in slide-in-from-bottom duration-300 md:zoom-in-95 ease-out',
        )}
      >
        {/* Mobile Pull Handle */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-gray-300/80" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 md:px-6 md:py-4 border-b border-divider">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="browse-categories-title"
                className="text-[17px] md:text-[19px] font-extrabold text-[#181725] tracking-tight"
              >
                Browse categories
              </h2>
              <span className="text-[13px] md:text-[14px] text-text-muted font-medium truncate max-w-[180px] md:max-w-xs">
                · {vendorName}
              </span>
            </div>
            <p className="text-[11.5px] md:text-[12.5px] text-text-muted mt-0.5">
              Select a category to quickly filter available products
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="size-8 md:size-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 hover:text-black transition-all active:scale-90 shrink-0"
          >
            <X size={17} strokeWidth={2.2} />
          </button>
        </div>

        {/* Search Input for categories (if more than 5 categories) */}
        {categories.length > 5 && (
          <div className="px-5 md:px-6 pt-3 pb-1">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
                strokeWidth={2}
              />
              <input
                type="text"
                placeholder="Search categories..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-8 bg-ivory/70 border border-divider hover:border-gray-300 focus:border-primary focus:bg-white rounded-xl text-[13px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 size-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300 text-[10px]"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Categories Grid (Scrollable) */}
        <div className="p-4 pb-8 md:p-6 md:pb-6 overflow-y-auto max-h-[calc(88vh-140px)] md:max-h-[calc(82vh-140px)] no-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3.5">
            {/* "All Products" Card */}
            {!filterQuery && (
              <button
                type="button"
                onClick={() => handleSelect('all')}
                className={cn(
                  'relative group p-3.5 rounded-2xl border text-center flex flex-col items-center justify-between transition-all duration-200 active:scale-[0.98]',
                  activeTab === 'all'
                    ? 'border-2 border-primary bg-primary-tint/30 shadow-xs ring-2 ring-primary/10'
                    : 'border-divider/80 bg-white hover:border-primary/40 hover:shadow-md hover:bg-ivory/30',
                )}
              >
                {activeTab === 'all' && (
                  <span className="absolute top-2 right-2 size-5 rounded-full bg-primary text-white flex items-center justify-center shadow-2xs">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                <div className="size-13 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                  <LayoutGrid size={24} strokeWidth={2} />
                </div>
                <div className="mt-2.5 w-full">
                  <span className="block text-[13px] md:text-[14px] font-bold text-[#181725] leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                    All Products
                  </span>
                  <span className="block text-[11px] md:text-[11.5px] font-semibold text-text-muted mt-0.5">
                    {totalProductsCount} items
                  </span>
                </div>
              </button>
            )}

            {/* Quick Deals Card (if store has deals) */}
            {hasDeals && !filterQuery && (
              <button
                type="button"
                onClick={() => handleSelect('deals')}
                className={cn(
                  'relative group p-3.5 rounded-2xl border text-center flex flex-col items-center justify-between transition-all duration-200 active:scale-[0.98]',
                  activeTab === 'deals'
                    ? 'border-2 border-primary bg-primary-tint/30 shadow-xs ring-2 ring-primary/10'
                    : 'border-divider/80 bg-white hover:border-primary/40 hover:shadow-md hover:bg-ivory/30',
                )}
              >
                {activeTab === 'deals' && (
                  <span className="absolute top-2 right-2 size-5 rounded-full bg-primary text-white flex items-center justify-center shadow-2xs">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                <div className="size-13 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                  <Tag size={24} strokeWidth={2} />
                </div>
                <div className="mt-2.5 w-full">
                  <span className="block text-[13px] md:text-[14px] font-bold text-[#181725] leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                    Deals & Offers
                  </span>
                  <span className="block text-[11px] md:text-[11.5px] font-semibold text-rose-600 mt-0.5">
                    Special pricing
                  </span>
                </div>
              </button>
            )}

            {/* Frequently Ordered Card */}
            {hasFrequent && !filterQuery && (
              <button
                type="button"
                onClick={() => handleSelect('frequent')}
                className={cn(
                  'relative group p-3.5 rounded-2xl border text-center flex flex-col items-center justify-between transition-all duration-200 active:scale-[0.98]',
                  activeTab === 'frequent'
                    ? 'border-2 border-primary bg-primary-tint/30 shadow-xs ring-2 ring-primary/10'
                    : 'border-divider/80 bg-white hover:border-primary/40 hover:shadow-md hover:bg-ivory/30',
                )}
              >
                {activeTab === 'frequent' && (
                  <span className="absolute top-2 right-2 size-5 rounded-full bg-primary text-white flex items-center justify-center shadow-2xs">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                <div className="size-13 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                  <Zap size={24} strokeWidth={2} />
                </div>
                <div className="mt-2.5 w-full">
                  <span className="block text-[13px] md:text-[14px] font-bold text-[#181725] leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                    Frequent Items
                  </span>
                  <span className="block text-[11px] md:text-[11.5px] font-semibold text-text-muted mt-0.5">
                    Fast reorder
                  </span>
                </div>
              </button>
            )}

            {/* Category Cards from Category Tree */}
            {filteredCategories.map((category) => {
              const tabKey = `cat:${category.name}`;
              const cChildren = category.children || [];
              const isSelected =
                activeTab === tabKey ||
                cChildren.some((c) => activeTab === `cat:${c.name}`);
              const emoji = getCategoryEmoji(category.name);

              return (
                <button
                  key={category.id || category.name}
                  type="button"
                  onClick={() => handleSelect(tabKey)}
                  className={cn(
                    'relative group p-3.5 rounded-2xl border text-center flex flex-col items-center justify-between transition-all duration-200 active:scale-[0.98]',
                    isSelected
                      ? 'border-2 border-primary bg-primary-tint/30 shadow-xs ring-2 ring-primary/10'
                      : 'border-divider/80 bg-white hover:border-primary/40 hover:shadow-md hover:bg-ivory/30',
                  )}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2 size-5 rounded-full bg-primary text-white flex items-center justify-center shadow-2xs">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}

                  {/* Icon / Image */}
                  <div className="size-13 rounded-2xl bg-[#FAF5EE] border border-amber-900/5 flex items-center justify-center overflow-hidden shadow-2xs group-hover:scale-105 transition-transform">
                    {category.image ? (
                      <Image
                        src={category.image}
                        alt={category.name}
                        width={44}
                        height={44}
                        className="object-contain size-full p-1"
                      />
                    ) : (
                      <span className="text-[26px] leading-none select-none">{emoji}</span>
                    )}
                  </div>

                  {/* Name + Count */}
                  <div className="mt-2.5 w-full">
                    <span className="block text-[13px] md:text-[14px] font-bold text-[#181725] leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                      {category.name}
                    </span>
                    <span className="block text-[11px] md:text-[11.5px] font-medium text-text-muted mt-0.5">
                      {category.count} {category.count === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {/* Subcategories indicator */}
                  {cChildren.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-0.5 text-[10px] text-primary font-semibold">
                      <span>{cChildren.length} subcategories</span>
                      <ChevronRight size={10} strokeWidth={2.5} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {filteredCategories.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[14px] font-semibold text-gray-700">No categories found</p>
              <p className="text-[12px] text-gray-400 mt-1">Try another search term</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
