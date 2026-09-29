'use client';

import React, { useState, useMemo } from 'react';
import {
  Layers,
  ChevronDown,
  LayoutGrid,
  LayoutList,
  Tag,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CategoryTreeNode } from '@/lib/categoryTree';
import { BrowseCategoriesModal } from './BrowseCategoriesModal';

interface VendorCategoryHeaderBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tree: CategoryTreeNode[];
  productCount: number;
  totalProductsCount: number;
  vendorName: string;
  layoutMode?: 'grid' | 'list';
  onLayoutModeChange?: (mode: 'grid' | 'list') => void;
  hasDeals?: boolean;
  hasFrequent?: boolean;
}

export function VendorCategoryHeaderBar({
  activeTab,
  onTabChange,
  tree,
  productCount,
  totalProductsCount,
  vendorName,
  layoutMode = 'grid',
  onLayoutModeChange,
  hasDeals = false,
  hasFrequent = false,
}: VendorCategoryHeaderBarProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Derive current label
  const activeName = activeTab.startsWith('cat:') ? activeTab.slice(4) : '';
  const currentParent = useMemo(() => {
    if (!activeName) return null;
    return (
      tree.find((p) => p.name === activeName) ||
      tree.find((p) => p.children.some((c) => c.name === activeName)) ||
      null
    );
  }, [tree, activeName]);

  const currentLabel = useMemo(() => {
    if (activeTab === 'all') return 'Categories';
    if (activeTab === 'deals') return 'Deals & Offers';
    if (activeTab === 'frequent') return 'Frequent Items';
    if (activeTab === 'prev-ordered') return 'Past Orders';
    if (activeName) return activeName;
    return 'Categories';
  }, [activeTab, activeName]);

  return (
    <>
      <div className="mb-3.5 space-y-2">
        {/* Top Control Bar: "Change Category" Pill + Items Count + Layout Toggle */}
        <div className="flex items-center justify-between gap-2 bg-white/90 backdrop-blur-md rounded-2xl border border-divider/80 p-2 md:p-2.5 shadow-2xs">
          {/* Left: Change Category Trigger Button */}
          <button
            type="button"
            aria-label="Browse and change category"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 rounded-xl bg-ivory/80 hover:bg-primary-tint/40 border border-divider hover:border-primary/40 transition-all duration-200 group active:scale-[0.98] text-left shrink min-w-0"
          >
            <div className="size-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Layers size={13} strokeWidth={2.2} />
            </div>
            <span className="text-[12.5px] md:text-[13.5px] font-extrabold text-[#181725] group-hover:text-primary transition-colors truncate block">
              {currentLabel}
            </span>
            <ChevronDown size={13} strokeWidth={2.5} className="text-primary shrink-0 group-hover:translate-y-0.5 transition-transform ml-0.5" />
          </button>

          {/* Right: Items Count & Layout Mode Switcher */}
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            {/* Items count badge */}
            <span className="text-[11px] md:text-[12px] font-bold text-text-secondary bg-ivory px-2 py-1 rounded-full border border-divider/60 tabular-nums shadow-2xs whitespace-nowrap">
              {productCount.toLocaleString()} {productCount === 1 ? 'item' : 'items'}
            </span>

            {/* Layout Toggle (Grid vs List) */}
            {onLayoutModeChange && (
              <div className="flex items-center rounded-xl border border-divider bg-ivory/80 p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => onLayoutModeChange('grid')}
                  aria-label="Grid view"
                  aria-pressed={layoutMode === 'grid'}
                  className={cn(
                    'rounded-lg p-1 transition-all',
                    layoutMode === 'grid'
                      ? 'bg-primary text-white shadow-xs font-semibold'
                      : 'text-text-muted hover:text-text hover:bg-white/60',
                  )}
                >
                  <LayoutGrid size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => onLayoutModeChange('list')}
                  aria-label="List view"
                  aria-pressed={layoutMode === 'list'}
                  className={cn(
                    'rounded-lg p-1 transition-all',
                    layoutMode === 'list'
                      ? 'bg-primary text-white shadow-xs font-semibold'
                      : 'text-text-muted hover:text-text hover:bg-white/60',
                  )}
                >
                  <LayoutList size={13} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Filter Strip / Subcategory Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 scroll-smooth">
          {/* If drilled down into a parent category with subcategories */}
          {currentParent && currentParent.children.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => onTabChange(`cat:${currentParent.name}`)}
                className={cn(
                  'px-3 py-1 rounded-full text-[11.5px] font-semibold shrink-0 transition-all shadow-2xs',
                  activeTab === `cat:${currentParent.name}`
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-white text-text-secondary border border-divider hover:border-gray-300 hover:bg-ivory',
                )}
              >
                All {currentParent.name}
              </button>
              {currentParent.children.map((child) => {
                const isChildActive = activeTab === `cat:${child.name}`;
                return (
                  <button
                    key={child.id || child.name}
                    type="button"
                    onClick={() => onTabChange(`cat:${child.name}`)}
                    className={cn(
                      'px-3 py-1 rounded-full text-[11.5px] font-semibold shrink-0 transition-all flex items-center gap-1.5 shadow-2xs',
                      isChildActive
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-white text-text-secondary border border-divider hover:border-gray-300 hover:bg-ivory',
                    )}
                  >
                    <span>{child.name}</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.2 rounded-full tabular-nums',
                        isChildActive ? 'bg-white/20 text-white' : 'bg-ivory text-text-muted',
                      )}
                    >
                      {child.count}
                    </span>
                  </button>
                );
              })}
            </>
          ) : (
            /* Root chips: All, Deals, Frequent, and Top Categories */
            <>
              <button
                type="button"
                onClick={() => onTabChange('all')}
                className={cn(
                  'px-3 py-1 rounded-full text-[11.5px] font-semibold shrink-0 transition-all shadow-2xs',
                  activeTab === 'all'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-white text-text-secondary border border-divider hover:border-gray-300 hover:bg-ivory',
                )}
              >
                All Items
              </button>

              {hasDeals && (
                <button
                  type="button"
                  onClick={() => onTabChange('deals')}
                  className={cn(
                    'px-3 py-1 rounded-full text-[11.5px] font-semibold shrink-0 transition-all flex items-center gap-1 shadow-2xs',
                    activeTab === 'deals'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100',
                  )}
                >
                  <Tag size={12} strokeWidth={2.2} />
                  <span>Deals</span>
                </button>
              )}

              {hasFrequent && (
                <button
                  type="button"
                  onClick={() => onTabChange('frequent')}
                  className={cn(
                    'px-3 py-1 rounded-full text-[11.5px] font-semibold shrink-0 transition-all flex items-center gap-1 shadow-2xs',
                    activeTab === 'frequent'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100',
                  )}
                >
                  <Zap size={12} strokeWidth={2.2} />
                  <span>Frequent</span>
                </button>
              )}

              {tree.slice(0, 8).map((cat) => {
                const isActive =
                  activeTab === `cat:${cat.name}` ||
                  cat.children.some((c) => activeTab === `cat:${c.name}`);
                return (
                  <button
                    key={cat.id || cat.name}
                    type="button"
                    onClick={() => onTabChange(`cat:${cat.name}`)}
                    className={cn(
                      'px-3 py-1 rounded-full text-[11.5px] font-semibold shrink-0 transition-all flex items-center gap-1 shadow-2xs',
                      isActive
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-white text-text-secondary border border-divider hover:border-gray-300 hover:bg-ivory',
                    )}
                  >
                    <span>{cat.name}</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.2 rounded-full tabular-nums',
                        isActive ? 'bg-white/20 text-white' : 'bg-ivory text-text-muted',
                      )}
                    >
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Modal */}
      <BrowseCategoriesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        vendorName={vendorName}
        categories={tree}
        activeTab={activeTab}
        totalProductsCount={totalProductsCount}
        onSelectCategory={onTabChange}
        hasDeals={hasDeals}
        hasFrequent={hasFrequent}
      />
    </>
  );
}
