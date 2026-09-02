'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronUp } from 'lucide-react';
import { dal } from '@/lib/dal';
import type { Category } from '@/types';
import { SectionHeader } from '@/components/ui/SectionHeader';

// Background colors per category slug (visual styling — not data)
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

interface CategoryShowcaseProps {
    filterByProducts?: { category: string }[];
    title?: string;
    onCategoryClick?: (categoryName: string) => void;
    activeCategory?: string;
}

export function CategoryShowcase({ filterByProducts, title = "Shop By Category", onCategoryClick, activeCategory }: CategoryShowcaseProps) {
    const [categories, setCategories] = useState<(Category & { bgColor: string })[]>([]);
    const [isMobileExpanded, setIsMobileExpanded] = useState(false);
    const [isDesktopExpanded, setIsDesktopExpanded] = useState(false);

    useEffect(() => {
        dal.categories.list().then((cats) => {
            let filtered = cats;
            if (filterByProducts) {
                const uniqueVendorCats = new Set(filterByProducts.map(p => p.category));
                filtered = cats.filter(c => uniqueVendorCats.has(c.name));
            }

            setCategories(filtered.map(c => ({
                ...c,
                bgColor: CATEGORY_BG[c.slug] || '#f7f8fa',
            })));
        }).catch(console.error);
    }, [filterByProducts]);

    if (categories.length === 0) return null;

    return (
        <section
            className="w-full pt-8 pb-4 bg-white relative z-30"
            suppressHydrationWarning={true}
        >
            <div className="max-w-[var(--container-max)] mx-auto overflow-hidden">
                {title && (
                    <div className="px-4 md:px-[var(--container-padding)] mb-4 md:mb-6">
                        <SectionHeader
                            title={title}
                            subtitle="Quality wholesale ingredients and supplies across key categories"
                            actionLabel={isDesktopExpanded ? "Show less" : "View all →"}
                            actionHref={onCategoryClick ? undefined : "/category"}
                            onActionClick={onCategoryClick ? () => {
                                setIsDesktopExpanded(!isDesktopExpanded);
                                setIsMobileExpanded(!isMobileExpanded);
                            } : undefined}
                        />
                    </div>
                )}

                {/* Content Area */}
                <div className="relative">
                    {/* Mobile: collapsed = single-row horizontal scroll, expanded = wrapping grid */}
                    <div className="md:hidden">
                        <div className={cn(
                            "overflow-x-auto no-scrollbar scroll-smooth w-full",
                            isMobileExpanded && "overflow-x-visible"
                        )}>
                            {isMobileExpanded ? (
                                <div className="grid grid-cols-3 auto-cols-[100px] gap-x-4 gap-y-6 pb-6 px-4 w-auto">
                                    {categories.map((cat) => (
                                        <CategoryCard key={cat.id} cat={cat} activeCategory={activeCategory} onCategoryClick={onCategoryClick} />
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-start gap-4 pb-6 px-4 w-max">
                                    {categories.map((cat) => (
                                        <div key={cat.id} className="w-[100px] shrink-0">
                                            <CategoryCard cat={cat} activeCategory={activeCategory} onCategoryClick={onCategoryClick} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Desktop: default = 2 rows of 9, Show All = full grid */}
                    <div className="hidden md:block relative w-full">
                        <div className="grid grid-cols-9 gap-x-3 gap-y-5 pb-4 px-4 md:px-[var(--container-padding)]">
                            {(isDesktopExpanded ? categories : categories.slice(0, 18)).map((cat) => (
                                <div key={cat.id} className="w-full">
                                    <CategoryCard cat={cat} activeCategory={activeCategory} onCategoryClick={onCategoryClick} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

interface CategoryCardProps {
    cat: Category & { bgColor: string };
    activeCategory?: string;
    onCategoryClick?: (categoryName: string) => void;
}

const CategoryCard = ({ cat, activeCategory, onCategoryClick }: CategoryCardProps) => {
    const isActive = activeCategory === `cat:${cat.name}`;
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
