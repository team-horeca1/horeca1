'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Search, Store, X, BadgeCheck, ShoppingBag, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseImageMeta, getDisplayStyle } from '@/lib/imageMeta';
import { buildCategoryTree, filterProductsByCatalogTab, slugifyCategory } from '@/lib/categoryTree';
import { useDeliveryPincode } from '@/hooks/useDeliveryPincode';
import { VendorCategoryRail } from '@/components/features/vendor/VendorCategoryRail';
import { BrandProductCard } from '@/components/features/brand/BrandProductCard';
import { BrandAttributeFilters, matchesBrandAttrFilters, type BrandAttrFilter } from '@/components/features/brand/BrandAttributeFilters';
import { BrandSuppliersPanel, type BrandSupplier } from '@/components/features/brand/BrandSuppliersPanel';
import { ShareButton } from '@/components/features/share/ShareButton';
import { brandShareContent } from '@/lib/share-cards/types';
import { Hero, type HeroContent } from '@/components/features/Hero';

const PRODUCT_IMAGE_FALLBACK = '/images/placeholders/no-product.svg';

interface BrandDistributor {
    vendorId: string;
    vendorSlug?: string;
    vendorName: string;
    price: number;
    inStock: boolean;
    stock: number;
    distributorProductId: string;
    imageUrl?: string | null;
    servicesPincode?: boolean;
}

interface BrandCategoryLink {
    id: string;
    name: string;
    slug?: string;
    imageUrl?: string | null;
    parentId?: string | null;
    parentName?: string | null;
    parentImageUrl?: string | null;
}

interface BrandProduct {
    id: string;
    name: string;
    image: string;
    category: string;
    categories: BrandCategoryLink[];
    packSize?: string;
    unit?: string;
    vegNonVeg?: string | null;
    storageType?: string | null;
    shelfLifeDays?: number | null;
    tags?: string[] | null;
    fssaiRef?: string | null;
    distributors: BrandDistributor[];
}

interface BrandHeroSlide {
    id: string;
    desktopImageUrl?: string | null;
    mobileImageUrl?: string | null;
    eyebrow?: string;
    headline?: string;
    ctaLabel?: string;
    ctaHref?: string;
    showText?: boolean;
    showCta?: boolean;
    copyAlignX?: 'left' | 'center' | 'right';
    copyAlignY?: 'top' | 'center' | 'bottom';
    copyOffsetX?: number;
    copyOffsetY?: number;
    showTextMobile?: boolean;
    showCtaMobile?: boolean;
    copyAlignXMobile?: 'left' | 'center' | 'right';
    copyAlignYMobile?: 'top' | 'center' | 'bottom';
    copyOffsetXMobile?: number;
    copyOffsetYMobile?: number;
}

interface BrandStoreData {
    id: string;
    slug: string;
    name: string;
    bannerImage: string;
    heroSlides: BrandHeroSlide[];
    logoImage: string;
    tagline: string;
    products: BrandProduct[];
    vendors: BrandSupplier[];
    coverage?: { pincode: string | null; servicedVendorCount: number; totalVendorCount: number };
}

interface BrandStoreProps {
    brandId: string;
    initialCatSlug?: string;
    initialSkuId?: string;
}

type StoreTab = 'catalogue' | 'suppliers';

function BrandBannerIdentity({
    name,
    logoSrc,
    logoStyle,
    tagline,
    supplierCount,
    productCount,
    scrim,
}: {
    name: string;
    logoSrc: string;
    logoStyle?: CSSProperties;
    tagline: string;
    supplierCount: number;
    productCount?: number;
    scrim: boolean;
}) {
    return (
        <div
            className={cn(
                'pointer-events-none absolute inset-0 z-10 hidden items-center gap-5 rounded-[20px] px-6 md:flex',
                scrim
                    ? 'bg-gradient-to-r from-black/85 via-black/45 to-transparent'
                    : 'bg-gradient-to-r from-black/75 via-black/35 to-transparent',
            )}
        >
            <div className="flex size-[80px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-cdl-2 ring-2 ring-white/20">
                {logoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoSrc} alt="" className="size-full object-contain" style={logoStyle} />
                ) : (
                    <span className="text-[24px] font-black text-primary">{name[0]}</span>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    {typeof productCount === 'number' && productCount > 0 ? (
                        <span className="flex items-center gap-1 rounded-full border border-white/30 bg-white/20 backdrop-blur-xs px-2.5 py-0.5 text-xs font-bold text-white">
                            <ShoppingBag size={11} /> {productCount} products
                        </span>
                    ) : null}
                    {supplierCount > 0 ? (
                        <span className="flex items-center gap-1 rounded-full border border-white/30 bg-white/20 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold text-white">
                            <Store size={11} /> {supplierCount} authorized supplier{supplierCount === 1 ? '' : 's'}
                        </span>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <h1 className="line-clamp-1 text-[clamp(1.5rem,2.2vw,2.25rem)] font-extrabold leading-tight text-white tracking-tight drop-shadow-sm">
                        {name}
                    </h1>
                    <span className="inline-flex items-center text-blue-400 shrink-0" title="Verified Brand">
                        <BadgeCheck size={22} className="fill-blue-500 text-white" />
                    </span>
                </div>
                {tagline ? (
                    <p className="mt-1 line-clamp-1 text-sm font-medium text-white/85">{tagline}</p>
                ) : null}
            </div>
        </div>
    );
}

function resolveProductImage(product: BrandProduct): string {
    if (product.image?.trim()) return product.image;
    return product.distributors.find((d) => d.imageUrl)?.imageUrl || PRODUCT_IMAGE_FALLBACK;
}

export function BrandStore({ brandId, initialCatSlug = '', initialSkuId = '' }: BrandStoreProps) {
    const pincode = useDeliveryPincode();
    const [activeTab, setActiveTab] = useState<StoreTab>(initialSkuId ? 'suppliers' : 'catalogue');
    const [brand, setBrand] = useState<BrandStoreData | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [catalogTab, setCatalogTab] = useState(initialCatSlug ? `cat:${initialCatSlug}` : 'all');
    const [attrFilters, setAttrFilters] = useState<BrandAttrFilter[]>([]);
    const [selectedSkuId, setSelectedSkuId] = useState(initialSkuId);

    useEffect(() => {
        Promise.resolve().then(() => setLoading(true));
        const url = pincode
            ? `/api/v1/brands/${brandId}?pincode=${encodeURIComponent(pincode)}`
            : `/api/v1/brands/${brandId}`;
        fetch(url)
            .then((r) => r.json())
            .then((json) => {
                if (!json.success || !json.data) return;
                const d = json.data;
                setBrand({
                    id: d.id,
                    slug: d.slug,
                    name: d.name,
                    bannerImage: d.banner ?? '',
                    heroSlides: Array.isArray(d.heroSlides) ? d.heroSlides as BrandHeroSlide[] : [],
                    logoImage: d.logo ?? '',
                    tagline: d.tagline ?? '',
                    coverage: d.coverage ?? undefined,
                    products: (d.products ?? []).map((p: Record<string, unknown>) => ({
                        id: p.id as string,
                        name: p.name as string,
                        image: (p.image as string) ?? '',
                        category: p.category as string,
                        categories: (p.categories as BrandCategoryLink[]) ?? [],
                        packSize: (p.packSize as string) ?? '',
                        unit: (p.unit as string) ?? '',
                        vegNonVeg: (p.vegNonVeg as string) ?? null,
                        storageType: (p.storageType as string) ?? null,
                        shelfLifeDays: typeof p.shelfLifeDays === 'number' ? p.shelfLifeDays : null,
                        tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
                        fssaiRef: (p.fssaiRef as string) ?? null,
                        distributors: (p.distributors as BrandDistributor[]) ?? [],
                    })),
                    vendors: (d.vendors ?? []).map((v: Record<string, unknown>) => ({
                        id: v.id as string,
                        name: v.name as string,
                        slug: (v.slug as string) ?? '',
                        logo: (v.logo as string) ?? '',
                        location: Array.isArray(v.pincodes) ? String((v.pincodes as string[])[0] ?? 'India') : 'India',
                        productIds: (v.productIds as string[]) ?? [],
                        prices: (v.prices as Record<string, number>) ?? {},
                        servicesPincode: v.servicesPincode as boolean | undefined,
                        rating: Number(v.rating) || 0,
                        creditEnabled: !!v.creditEnabled,
                    })),
                });
            })
            .catch(() => { /* stay null */ })
            .finally(() => setLoading(false));
    }, [brandId, pincode]);

    const catalogProductsForTree = useMemo(() => {
        if (!brand) return [];
        return brand.products.map((p) => ({
            id: p.id,
            image: p.image,
            categoryId: p.categories[0]?.id,
            category: p.category,
            categoryImage: p.categories[0]?.imageUrl,
            categoryParentId: p.categories[0]?.parentId,
            categoryParentName: p.categories[0]?.parentName,
            categoryParentImage: p.categories[0]?.parentImageUrl,
            subCategories: p.categories.map((c) => ({
                id: c.id,
                name: c.name,
                image: c.imageUrl,
                parentId: c.parentId,
                parentName: c.parentName,
                parentImage: c.parentImageUrl,
            })),
        }));
    }, [brand]);

    const brandCategoryTree = useMemo(
        () => buildCategoryTree(catalogProductsForTree),
        [catalogProductsForTree],
    );

    useEffect(() => {
        if (!initialCatSlug || !brand) return;
        if (!catalogTab.startsWith('cat:')) return;
        const current = catalogTab.slice(4);
        const allNames = brand.products.flatMap((p) =>
            p.categories.flatMap((c) => [c.name, c.parentName].filter(Boolean) as string[]),
        );
        if (allNames.includes(current)) return;
        const slug = slugifyCategory(initialCatSlug);
        const subMatch = brand.products.find((p) =>
            p.categories.some((c) => slugifyCategory(c.name) === slug),
        );
        if (subMatch) {
            const cat = subMatch.categories.find((c) => slugifyCategory(c.name) === slug);
            if (cat) setCatalogTab(`cat:${cat.name}`);
            return;
        }
        const parentName = brand.products
            .flatMap((p) => p.categories)
            .find((c) => c.parentName && slugifyCategory(c.parentName) === slug)?.parentName;
        if (parentName) setCatalogTab(`cat:${parentName}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brand, initialCatSlug]);

    const filteredProducts = useMemo(() => {
        if (!brand) return [];
        const allowed = new Set(
            filterProductsByCatalogTab(catalogProductsForTree, catalogTab).map((p) => p.id),
        );
        let items = brand.products.filter((p) => allowed.has(p.id));
        items = items.filter((p) => matchesBrandAttrFilters(p, attrFilters));
        if (searchQuery.trim() && activeTab === 'catalogue') {
            const q = searchQuery.toLowerCase();
            items = items.filter((p) =>
                p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
            );
        }
        return items;
    }, [brand, catalogProductsForTree, catalogTab, attrFilters, searchQuery, activeTab]);

    const selectedSku = useMemo(
        () => brand?.products.find((p) => p.id === selectedSkuId) ?? null,
        [brand, selectedSkuId],
    );

    const suppliersForPanel = useMemo(() => {
        if (!brand) return [];
        let list = brand.vendors;
        if (selectedSku) {
            list = list.filter((v) => v.productIds.includes(selectedSku.id));
        }
        if (searchQuery.trim() && activeTab === 'suppliers') {
            const q = searchQuery.toLowerCase();
            list = list.filter((v) => v.name.toLowerCase().includes(q));
        }
        return list;
    }, [brand, selectedSku, searchQuery, activeTab]);

    const brandWideUnavailable = !!(
        pincode &&
        brand?.coverage &&
        brand.coverage.servicedVendorCount === 0
    );

    const activeCatName = catalogTab.startsWith('cat:') ? catalogTab.slice(4) : '';
    const parentOfActiveSub = brandCategoryTree.find((p) => p.children.some((c) => c.name === activeCatName));

    if (loading) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-page">
                <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!brand) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-page">
                <div className="text-center px-6">
                    <p className="text-[20px] font-semibold text-text mb-2">Brand not found</p>
                    <p className="text-[14px] text-text-muted mb-6">This brand store is not available yet.</p>
                    <Link href="/" className="inline-flex min-h-12 px-6 items-center bg-primary text-white rounded-xl text-[14px] font-semibold">
                        Back to home
                    </Link>
                </div>
            </div>
        );
    }

    const bannerParsed = parseImageMeta(brand.bannerImage);
    const logoParsed = parseImageMeta(brand.logoImage || brand.bannerImage);
    const logoStyle = getDisplayStyle(logoParsed.meta);
    const supplierCount = pincode && brand.coverage
        ? brand.coverage.servicedVendorCount
        : brand.vendors.length;

    const openSku = (product: BrandProduct) => {
        setSelectedSkuId(product.id);
        setActiveTab('suppliers');
    };

    const shareContent = brandShareContent({
        slug: brand.slug,
        name: brand.name,
        image: logoParsed.src || bannerParsed.src || null,
    });

    const heroSlides: HeroContent[] = (brand.heroSlides.length > 0
        ? brand.heroSlides
        : brand.bannerImage
            ? [{
                id: 'banner',
                desktopImageUrl: brand.bannerImage,
                mobileImageUrl: brand.bannerImage,
                showText: false,
                showCta: false,
                showTextMobile: false,
                showCtaMobile: false,
            }]
            : []
    ).filter((slide) => slide.desktopImageUrl || slide.mobileImageUrl).map((slide) => ({
        ...slide,
        desktopImageUrl: slide.desktopImageUrl || slide.mobileImageUrl || undefined,
        mobileImageUrl: slide.mobileImageUrl || slide.desktopImageUrl || undefined,
    }));

    return (
        <div className="min-h-dvh bg-page pb-20 md:pb-24">
            {heroSlides.length > 0 ? (
                <Hero
                    slides={heroSlides}
                    chrome="page"
                    heading="h2"
                    overlay={(
                        <BrandBannerIdentity
                            name={brand.name}
                            logoSrc={logoParsed.src}
                            logoStyle={logoStyle}
                            tagline={brand.tagline}
                            supplierCount={supplierCount}
                            productCount={brand.products.length}
                            scrim
                        />
                    )}
                />
            ) : (
                <section className="w-full pt-2 pb-2 md:pt-3 md:pb-4">
                    <div className="mx-auto max-w-[var(--container-max)] px-3 md:px-[var(--container-padding)]">
                        <div className="relative h-[160px] sm:h-[190px] md:h-[240px] overflow-hidden rounded-2xl md:rounded-[20px] bg-[#4A141F] shadow-cdl-1 md:shadow-cdl-2">
                            {bannerParsed.src ? (
                                <Image
                                    src={bannerParsed.src}
                                    alt={brand.name}
                                    fill
                                    priority
                                    className="object-cover"
                                />
                            ) : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent md:hidden" />
                            <BrandBannerIdentity
                                name={brand.name}
                                logoSrc={logoParsed.src}
                                logoStyle={logoStyle}
                                tagline={brand.tagline}
                                supplierCount={supplierCount}
                                productCount={brand.products.length}
                                scrim={false}
                            />
                        </div>
                    </div>
                </section>
            )}

            {/* Mobile Brand Card - elevated over the banner for depth and luxury feel */}
            <div className="md:hidden relative z-20 px-3 -mt-6">
                <div className="rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(37,24,0,0.07)] border border-divider/70">
                    {/* Top: Avatar, Name, Verified, Actions */}
                    <div className="flex items-start gap-3">
                        <div className="relative size-14 shrink-0 rounded-xl overflow-hidden bg-white p-1 border border-divider shadow-xs ring-2 ring-white flex items-center justify-center">
                            {logoParsed.src ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={logoParsed.src}
                                    alt={brand.name}
                                    className="size-full object-contain"
                                    style={logoStyle}
                                />
                            ) : (
                                <span className="text-[20px] font-black text-primary">{brand.name[0]}</span>
                            )}
                        </div>

                        <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-center gap-1.5">
                                <h1 className="text-[16px] font-bold text-text tracking-tight leading-snug line-clamp-1">
                                    {brand.name}
                                </h1>
                                <span className="inline-flex items-center text-blue-500 shrink-0" title="Verified Brand">
                                    <BadgeCheck size={16} className="fill-blue-500 text-white" />
                                </span>
                            </div>
                            <p className="text-[11px] font-medium text-text-secondary truncate mt-0.5">
                                {brand.tagline || (catalogProductsForTree.length > 0
                                    ? brandCategoryTree.slice(0, 3).map((c) => c.name).join(' • ')
                                    : 'Verified Direct Brand Store')}
                            </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            <ShareButton
                                content={shareContent}
                                variant="icon"
                                className="size-8 rounded-full bg-[#FAF7F2] hover:bg-gray-100 border border-divider text-text-secondary flex items-center justify-center transition-all active:scale-90 shadow-2xs"
                            />
                        </div>
                    </div>

                    {/* Middle: Brand Trust & Micro-Stats Row */}
                    <div className="mt-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FAF7F2] border border-divider px-2.5 py-0.5 text-[10.5px] font-medium text-text-secondary">
                            <ShoppingBag size={10.5} className="text-text-muted" />
                            <span>{brand.products.length} {brand.products.length === 1 ? 'item' : 'items'}</span>
                        </span>

                        {supplierCount > 0 ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50/80 border border-blue-200/60 px-2.5 py-0.5 text-[10.5px] font-medium text-blue-900">
                                <Store size={10.5} className="text-blue-600" />
                                <span>{supplierCount} authorized {supplierCount === 1 ? 'supplier' : 'suppliers'}</span>
                            </span>
                        ) : null}

                        {pincode && brand.coverage ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/70 px-2.5 py-0.5 text-[10.5px] font-medium text-emerald-800">
                                <MapPin size={10.5} className="text-emerald-600" />
                                <span>Pincode {pincode}</span>
                            </span>
                        ) : null}
                    </div>

                    {/* Bottom: Modern Segmented Navigation Tabs */}
                    <div className="mt-3 pt-2.5 border-t border-divider/70">
                        <div className="grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-[#F6F3EE] border border-divider/60">
                            {[
                                { key: 'catalogue' as const, label: 'Catalogue', count: brand.products.length },
                                { key: 'suppliers' as const, label: 'Suppliers', count: supplierCount },
                            ].map((tab) => {
                                const isActive = activeTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => {
                                            setActiveTab(tab.key);
                                            if (tab.key === 'catalogue') setSelectedSkuId('');
                                        }}
                                        className={cn(
                                            'h-8.5 rounded-lg text-[12px] font-semibold transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-98',
                                            isActive
                                                ? 'bg-primary text-white shadow-xs font-bold'
                                                : 'text-text-muted hover:text-text hover:bg-white/60'
                                        )}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={cn('text-[11px] tabular-nums', isActive ? 'text-white/80' : 'text-text-muted')}>
                                            · {tab.count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Search and Filter Controls */}
            <div className="w-full bg-white/95 backdrop-blur-md sticky top-0 z-30 border-b border-divider shadow-[0_2px_8px_rgba(37,24,0,0.04)] mt-2 md:mt-4">
                <div className="max-w-[var(--container-max)] mx-auto px-3 md:px-[var(--container-padding)] py-2 md:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="relative flex-1 md:max-w-[450px] lg:max-w-[600px]">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary" strokeWidth={2.25} />
                        <input
                            type="search"
                            placeholder={`Search in ${brand.name}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 md:h-11 pl-10 pr-9 rounded-full md:rounded-xl bg-white border-[1.5px] border-[#BFAFA3] hover:border-primary/80 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/15 text-[13px] md:text-sm font-medium text-text placeholder:text-[#8C7A6F] shadow-[0_2px_8px_rgba(40,20,10,0.05)] focus:shadow-[0_4px_16px_rgba(107,29,46,0.12)] transition-all"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                aria-label="Clear search"
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-gray-100 text-text-muted hover:text-text hover:bg-gray-200 transition-all active:scale-90"
                            >
                                <X size={13} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>

                    {/* Desktop Segmented Navigation Tabs */}
                    <div className="hidden md:flex items-center gap-2 shrink-0">
                        {[
                            { key: 'catalogue' as const, label: 'Catalogue', count: brand.products.length },
                            { key: 'suppliers' as const, label: 'Suppliers', count: supplierCount },
                        ].map((tab) => {
                            const isActive = activeTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => {
                                        setActiveTab(tab.key);
                                        if (tab.key === 'catalogue') setSelectedSkuId('');
                                    }}
                                    className={cn(
                                        'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border',
                                        isActive
                                            ? 'bg-primary text-white border-primary shadow-xs'
                                            : 'bg-white border-divider text-text-secondary hover:text-primary hover:border-primary/40'
                                    )}
                                >
                                    <span>{tab.label}</span>
                                    <span className={cn('tabular-nums', isActive ? 'text-white/80' : 'text-text-muted')}>
                                        ({tab.count})
                                    </span>
                                </button>
                            );
                        })}
                        <div className="ml-2">
                            <ShareButton content={shareContent} variant="icon" className="size-9 rounded-xl border border-divider bg-white hover:bg-ivory text-text" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[var(--container-max)] mx-auto px-3 md:px-[var(--container-padding)] py-4">
                {activeTab === 'catalogue' && (
                    <div className="flex gap-2 md:gap-4 items-start">
                        <VendorCategoryRail
                            tree={brandCategoryTree}
                            activeTab={catalogTab}
                            productCount={brand.products.length}
                            onSelect={setCatalogTab}
                            showYourItems={false}
                        />

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                {parentOfActiveSub ? (
                                    <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                                        <button
                                            type="button"
                                            onClick={() => setCatalogTab(`cat:${parentOfActiveSub.name}`)}
                                            className="text-text-muted hover:text-primary"
                                        >
                                            {parentOfActiveSub.name}
                                        </button>
                                        <ChevronRight size={13} className="text-text-muted" strokeWidth={2.5} />
                                        <span className="text-text">{activeCatName}</span>
                                    </div>
                                ) : null}
                                <span className="ml-auto text-[12px] text-text-muted tabular-nums shrink-0">
                                    {filteredProducts.length} items
                                </span>
                            </div>

                            <div className="mb-3">
                                <BrandAttributeFilters
                                    products={brand.products}
                                    value={attrFilters}
                                    onChange={setAttrFilters}
                                />
                            </div>

                            {filteredProducts.length > 0 ? (
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                    {filteredProducts.map((product) => (
                                        <BrandProductCard
                                            key={product.id}
                                            product={product}
                                            brandSlug={brand.slug}
                                            brandName={brand.name}
                                            image={resolveProductImage(product)}
                                            onOpenSuppliers={() => openSku(product)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="py-16 text-center">
                                    <Store size={36} className="mx-auto text-text-muted mb-3" strokeWidth={1.5} />
                                    <p className="text-[16px] font-semibold text-text">No items found</p>
                                    <p className="text-[13px] text-text-muted mt-1">Try another category or filter</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'suppliers' && (
                    <BrandSuppliersPanel
                        brandName={brand.name}
                        brandSlug={brand.slug}
                        pincode={pincode}
                        vendors={suppliersForPanel}
                        sku={selectedSku ? {
                            id: selectedSku.id,
                            name: selectedSku.name,
                            image: resolveProductImage(selectedSku),
                            distributors: selectedSku.distributors,
                        } : null}
                        brandWideUnavailable={brandWideUnavailable}
                        onClearSku={() => setSelectedSkuId('')}
                        onBrowseCatalogue={() => {
                            setSelectedSkuId('');
                            setActiveTab('catalogue');
                        }}
                    />
                )}
            </div>
        </div>
    );
}
