'use client';

import React from 'react';
import { Search, X, SlidersHorizontal, LayoutGrid, LayoutList } from 'lucide-react';
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
}: VendorCatalogNavProps) {
    const showToggle = !!onLayoutModeChange;
    const ToggleGroup = (
        showToggle ? (
            <div className="flex items-center bg-white border border-divider rounded-xl p-0.5 shrink-0 shadow-cdl-1">
                <button
                    type="button"
                    onClick={() => onLayoutModeChange!('grid')}
                    aria-label="Grid view"
                    aria-pressed={layoutMode === 'grid'}
                    className={cn(
                        'p-2 rounded-lg transition-all',
                        layoutMode === 'grid' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-primary'
                    )}
                >
                    <LayoutGrid size={16} strokeWidth={2} />
                </button>
                <button
                    type="button"
                    onClick={() => onLayoutModeChange!('list')}
                    aria-label="List view"
                    aria-pressed={layoutMode === 'list'}
                    className={cn(
                        'p-2 rounded-lg transition-all',
                        layoutMode === 'list' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-primary'
                    )}
                >
                    <LayoutList size={16} strokeWidth={2} />
                </button>
            </div>
        ) : null
    );

    return (
        <div className="w-full bg-white/95 backdrop-blur-md sticky top-0 z-[40] border-b border-divider shadow-cdl-1">
            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 py-3 md:py-4">
                    <div className="relative group flex-1 md:max-w-[450px] lg:max-w-[600px] flex items-center gap-2 md:gap-3">
                        <div className="relative flex-1">
                            <Search
                                size={17}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors"
                                strokeWidth={2}
                            />
                            <input
                                type="text"
                                placeholder="Search in this store..."
                                value={searchQuery}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="w-full pl-10 pr-9 py-2.5 bg-ivory/50 border border-divider rounded-xl text-xs md:text-sm font-semibold text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10 transition-all shadow-sm"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => onSearchChange('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-gray-100 text-text-muted hover:text-text hover:bg-gray-200 transition-all active:scale-90"
                                >
                                    <X size={13} strokeWidth={2.5} />
                                </button>
                            )}
                        </div>
                        <button type="button" className="p-2.5 rounded-xl bg-white border border-divider text-text-muted hover:text-primary hover:border-primary/30 transition-all shrink-0">
                            <SlidersHorizontal size={17} strokeWidth={2} />
                        </button>
                        {ToggleGroup}
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
                        {TABS.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => onTabChange(tab.key)}
                                className={cn(
                                    'px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 border',
                                    activeTab === tab.key
                                        ? 'bg-primary text-white border-primary shadow-cdl-1'
                                        : 'bg-white text-text-secondary border-divider hover:border-primary/40 hover:text-primary'
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
