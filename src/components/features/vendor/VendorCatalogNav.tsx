'use client';

import React from 'react';
import { Search, X, LayoutGrid, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VendorCatalogNavProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    categories: string[];
    searchQuery: string;
    onSearchChange: (q: string) => void;
    subcategories?: Record<string, string[]>;
    layoutMode?: 'grid' | 'list';
    onLayoutModeChange?: (mode: 'grid' | 'list') => void;
    searchPlaceholder?: string;
    /** Supplier store shows catalog tabs. Category and collection pages use search only. */
    showStoreTabs?: boolean;
    barClassName?: string;
}

const TABS = [
    { key: 'all', label: 'All Items' },
    { key: 'frequent', label: 'Frequently Ordered' },
    { key: 'deals', label: 'Deals' },
    { key: 'prev-ordered', label: 'Previously Ordered' },
];

export function VendorCatalogNav({
    activeTab,
    onTabChange,
    searchQuery,
    onSearchChange,
    layoutMode,
    onLayoutModeChange,
    searchPlaceholder = 'Search in this store...',
    showStoreTabs = true,
    barClassName,
}: VendorCatalogNavProps) {
    const showToggle = !!onLayoutModeChange;
    const ToggleGroup = (
        showToggle ? (
            <div className="flex items-center shrink-0 rounded-xl border border-divider bg-ivory/80 p-0.5 shadow-2xs">
                <button
                    type="button"
                    onClick={() => onLayoutModeChange!('grid')}
                    aria-label="Grid view"
                    aria-pressed={layoutMode === 'grid'}
                    className={cn(
                        'rounded-lg p-1.5 transition-all md:p-2',
                        layoutMode === 'grid'
                            ? 'bg-primary text-white shadow-xs font-semibold'
                            : 'text-text-muted hover:text-text hover:bg-white/60'
                    )}
                >
                    <LayoutGrid size={15} strokeWidth={2} className="md:hidden" />
                    <LayoutGrid size={16} strokeWidth={2} className="hidden md:block" />
                </button>
                <button
                    type="button"
                    onClick={() => onLayoutModeChange!('list')}
                    aria-label="List view"
                    aria-pressed={layoutMode === 'list'}
                    className={cn(
                        'rounded-lg p-1.5 transition-all md:p-2',
                        layoutMode === 'list'
                            ? 'bg-primary text-white shadow-xs font-semibold'
                            : 'text-text-muted hover:text-text hover:bg-white/60'
                    )}
                >
                    <LayoutList size={15} strokeWidth={2} className="md:hidden" />
                    <LayoutList size={16} strokeWidth={2} className="hidden md:block" />
                </button>
            </div>
        ) : null
    );

    return (
        <div className={cn('w-full bg-white/95 backdrop-blur-md sticky z-30 border-b border-divider/80 shadow-[0_2px_10px_rgba(37,24,0,0.03)]', barClassName ?? 'top-0')}>
            <div className="max-w-[var(--container-max)] mx-auto px-3 md:px-[var(--container-padding)]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 py-2.5 md:py-3">
                    {/* Highlighted Single Solo Search Bar */}
                    <div className="relative group w-full flex-1 md:max-w-[540px] lg:max-w-[640px] flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search
                                size={17}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary group-focus-within:scale-110 transition-transform"
                                strokeWidth={2.25}
                            />
                            <input
                                type="text"
                                placeholder={searchPlaceholder}
                                value={searchQuery}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="w-full h-10.5 md:h-11.5 pl-10.5 pr-9 bg-white hover:bg-white focus:bg-white border-[1.5px] border-[#BFAFA3] hover:border-primary/80 focus:border-primary rounded-full md:rounded-2xl text-[13.5px] md:text-sm font-medium text-text placeholder:text-[#8C7A6F] focus:outline-none focus:ring-4 focus:ring-primary/15 shadow-[0_2px_8px_rgba(40,20,10,0.05)] focus:shadow-[0_4px_16px_rgba(107,29,46,0.12)] transition-all"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => onSearchChange('')}
                                    aria-label="Clear search"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 size-5.5 rounded-full bg-gray-200/80 hover:bg-gray-300 text-gray-600 hover:text-black flex items-center justify-center transition-all active:scale-90"
                                >
                                    <X size={12} strokeWidth={2.5} />
                                </button>
                            )}
                        </div>
                        {ToggleGroup}
                    </div>
                    {showStoreTabs ? <div className="hidden md:flex items-center gap-2 overflow-x-auto no-scrollbar md:mx-0 md:px-0">
                        {TABS.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => onTabChange(tab.key)}
                                className={cn(
                                    'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border shadow-2xs',
                                    activeTab === tab.key
                                        ? 'text-white bg-primary border-primary shadow-xs'
                                        : 'text-text-secondary bg-white border-divider hover:border-gray-300 hover:text-primary'
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div> : null}
                </div>
            </div>
        </div>
    );
}
