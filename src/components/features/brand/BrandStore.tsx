'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronLeft, MapPin, Store, ArrowLeft, Search, X, AlertCircle, Plus, Minus, ShoppingCart, Loader2, Check, LayoutGrid, LayoutList, ChevronRight, ChevronDown, Package, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatPackSize } from '@/lib/utils';
import { parseImageMeta, getDisplayStyle } from '@/lib/imageMeta';
import { buildCategoryTree, filterProductsByCatalogTab, slugifyCategory } from '@/lib/categoryTree';
import { useDeliveryPincode } from '@/hooks/useDeliveryPincode';
import { useCart } from '@/context/CartContext';
import type { VendorProduct } from '@/types';
import { VendorProductCard } from '@/components/features/vendor/VendorProductCard';

const PRODUCT_IMAGE_FALLBACK = '/images/recom-product/product-img10.png';

// Avatar that renders a clean logo if available, else a colored initial-letter tile.
// Used for vendor cards on the brand storefront where many vendors won't have logos uploaded yet.
const AVATAR_PALETTE = [
    { bg: '#FFEDD5', fg: '#C2410C' }, // orange
    { bg: '#DCFCE7', fg: '#15803D' }, // green
    { bg: '#DBEAFE', fg: '#1D4ED8' }, // blue
    { bg: '#FCE7F3', fg: '#BE185D' }, // pink
    { bg: '#F3E8FF', fg: '#7E22CE' }, // purple
    { bg: '#FEF3C7', fg: '#A16207' }, // amber
    { bg: '#CCFBF1', fg: '#0F766E' }, // teal
];

function paletteFor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function VendorAvatar({ name, logo, size = 64, rounded = '16px', fit = 'cover' }: { name: string; logo?: string | null; size?: number; rounded?: string; fit?: 'cover' | 'contain' }) {
    const [errored, setErrored] = React.useState(false);
    const showLogo = logo && !errored;
    const palette = paletteFor(name || '?');
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    return (
        <div
            className="flex items-center justify-center overflow-hidden shrink-0 border border-gray-100 shadow-sm"
            style={{ width: size, height: size, borderRadius: rounded, backgroundColor: showLogo ? '#fff' : palette.bg }}
        >
            {showLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={logo!}
                    alt={name}
                    className={cn("w-full h-full", fit === 'cover' ? 'object-cover' : 'object-contain p-1.5')}
                    onError={() => setErrored(true)}
                />
            ) : (
                <span
                    className="font-extrabold leading-none select-none"
                    style={{ color: palette.fg, fontSize: Math.round(size * 0.42) }}
                >
                    {initial}
                </span>
            )}
        </div>
    );
}

interface BrandDistributor {
    vendorId: string;
    vendorName: string;
    price: number;
    basePrice: number;
    taxPercent: number;
    inStock: boolean;
    stock: number;
    distributorProductId: string;
    distributorProductName: string;
    packSize: string;
    unit: string;
    imageUrl: string | null;
    priceSlabs: Array<{ minQty: number; maxQty: number | null; price: number }>;
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
    distributors: BrandDistributor[];
}

interface BrandVendor {
    id: string;
    name: string;
    logo: string;
    location: string;
    productIds: string[];
    prices: Record<string, string>;
    servicesPincode?: boolean;
}

interface BrandStoreData {
    id: string;
    slug: string;
    name: string;
    bannerImage: string;
    logoImage: string;
    tagline: string;
    products: BrandProduct[];
    vendors: BrandVendor[];
    coverage?: { pincode: string | null; servicedVendorCount: number; totalVendorCount: number };
}

interface BrandStoreProps {
    brandId: string;
    initialCatSlug?: string;
}

// Mock BRAND_DATA (Kitchen Smith / Kissan / etc.) removed 2026-04-29 — the
// component now always fetches /api/v1/brands/[id] so storefronts show real
// products + vendor mappings instead of seeded fakes.

type ActiveTab = 'items' | 'vendors';

const TABS = [
    { key: 'items' as ActiveTab, label: 'All Items' },
    { key: 'vendors' as ActiveTab, label: 'Vendors' },
];

function TabBar({
    activeTab,
    brand,
    onTabChange,
}: {
    activeTab: ActiveTab;
    brand: BrandStoreData;
    onTabChange: (tab: ActiveTab) => void;
}) {
    const counts: Record<ActiveTab, number> = {
        items: brand.products.length,
        vendors: brand.vendors.length,
    };
    return (
        <div className="flex items-center gap-8 border-b border-gray-100">
            {TABS.map((tab) => (
                <button
                    key={tab.key}
                    onClick={() => onTabChange(tab.key)}
                    className={cn(
                        'pb-3 pt-3 text-[15px] font-bold transition-all relative flex items-center gap-2',
                        activeTab === tab.key ? 'text-primary' : 'text-gray-400 hover:text-gray-700'
                    )}
                >
                    {tab.label}
                    <span className={cn(
                        'text-[11px] font-black px-2 py-0.5 rounded-full',
                        activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'
                    )}>
                        {counts[tab.key]}
                    </span>
                    {activeTab === tab.key && (
                        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-full" />
                    )}
                </button>
            ))}
        </div>
    );
}

type ProductAvailState = 'serviceable' | 'area' | 'out' | 'none';

function pickCheapestDistributor(product: BrandProduct): BrandDistributor | null {
    const inStock = product.distributors.filter((d) => d.inStock);
    const pool = inStock.length > 0 ? inStock : product.distributors;
    if (pool.length === 0) return null;
    return pool.slice().sort((a, b) => a.price - b.price)[0];
}

function resolveProductImage(product: BrandProduct, dist?: BrandDistributor | null): string {
    if (product.image?.trim()) return product.image;
    if (dist?.imageUrl) return dist.imageUrl;
    const inStockImg = product.distributors.find((d) => d.inStock && d.imageUrl);
    if (inStockImg?.imageUrl) return inStockImg.imageUrl;
    const anyImg = product.distributors.find((d) => d.imageUrl);
    if (anyImg?.imageUrl) return anyImg.imageUrl;
    return PRODUCT_IMAGE_FALLBACK;
}

function getProductAvailState(
    product: BrandProduct,
    best: BrandDistributor | null,
    pincode?: string,
): ProductAvailState {
    if (product.distributors.length === 0) return 'none';
    const inStock = product.distributors.filter((d) => d.inStock);
    if (inStock.length === 0) return 'out';
    if (best) return 'serviceable';
    if (pincode) return 'area';
    return 'out';
}

export function BrandStore({ brandId, initialCatSlug = '' }: BrandStoreProps) {
    const router = useRouter();
    const pincode = useDeliveryPincode();
    const { addToCart, groups } = useCart();
    const [activeTab, setActiveTab] = useState<ActiveTab>('items');
    const [selectedProduct, setSelectedProduct] = useState<BrandProduct | null>(null);
    const [brand, setBrand] = useState<BrandStoreData | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAllVendors, setShowAllVendors] = useState(false);
    const [vendorPickerProduct, setVendorPickerProduct] = useState<BrandProduct | null>(null);
    const [adding, setAdding] = useState<string | null>(null); // distributorProductId currently being added
    const [catalogTab, setCatalogTab] = useState(initialCatSlug ? `cat:${initialCatSlug}` : 'all');
    const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');

    useEffect(() => {
        const saved = localStorage.getItem('horeca_brand_layout');
        if (saved === 'grid' || saved === 'list') setLayoutMode(saved);
    }, []);

    const updateLayoutMode = (mode: 'grid' | 'list') => {
        setLayoutMode(mode);
        try { localStorage.setItem('horeca_brand_layout', mode); } catch {}
    };

    // Always fetch from the API — no client-side mock data anymore.
    // Pass pincode so the API can flag servicesPincode per vendor + return coverage stats.
    useEffect(() => {
        Promise.resolve().then(() => setLoading(true));
        const url = pincode && !showAllVendors
            ? `/api/v1/brands/${brandId}?pincode=${encodeURIComponent(pincode)}`
            : `/api/v1/brands/${brandId}`;
        fetch(url)
            .then(r => r.json())
            .then(json => {
                if (json.success && json.data) {
                    const d = json.data;
                    setBrand({
                        id: d.id,
                        slug: d.slug,
                        name: d.name,
                        bannerImage: d.banner ?? '',
                        logoImage: d.logo ?? '',
                        tagline: d.tagline ?? '',
                        coverage: d.coverage ?? undefined,
                        products: d.products.map((p: {
                            id: string;
                            name: string;
                            image?: string;
                            category: string;
                            categories?: BrandCategoryLink[];
                            packSize?: string;
                            unit?: string;
                            distributors?: BrandDistributor[];
                        }) => ({
                            id: p.id,
                            name: p.name,
                            image: p.image ?? '',
                            category: p.category,
                            categories: p.categories ?? [],
                            packSize: p.packSize ?? '',
                            unit: p.unit ?? '',
                            distributors: p.distributors ?? [],
                        })),
                        vendors: d.vendors.map((v: { id: string; name: string; logo?: string; pincodes?: string[]; productIds: string[]; prices: Record<string, string>; servicesPincode?: boolean }) => ({
                            id: v.id,
                            name: v.name,
                            logo: v.logo ?? '',
                            location: v.pincodes?.[0] ?? 'India',
                            productIds: v.productIds,
                            prices: v.prices,
                            servicesPincode: v.servicesPincode,
                        })),
                    });
                }
            })
            .catch(() => {/* stay null, show not-found */})
            .finally(() => setLoading(false));
    }, [brandId, pincode, showAllVendors]);

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

    // Convert ?cat=<slug> to category name once products load.
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
        const parentMatch = brand.products.find((p) =>
            p.categories.some((c) => c.parentName && slugifyCategory(c.parentName) === slug),
        );
        const parentName = parentMatch?.categories.find(
            (c) => c.parentName && slugifyCategory(c.parentName) === slug,
        )?.parentName;
        if (parentName) setCatalogTab(`cat:${parentName}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brand, initialCatSlug]);

    const activeCatName = catalogTab.startsWith('cat:') ? catalogTab.slice(4) : '';
    const activeParentNode = useMemo(
        () => brandCategoryTree.find((p) => p.name === activeCatName && p.children.length > 0),
        [brandCategoryTree, activeCatName],
    );
    const showSubcategoryTiles = !searchQuery.trim() && !!activeParentNode;

    // Must be before early returns (hook rules)
    const filteredProducts = useMemo(() => {
        if (!brand) return [];
        let items = filterProductsByCatalogTab(brand.products, catalogTab);
        if (!searchQuery.trim()) return items;
        const q = searchQuery.toLowerCase();
        return items.filter(
            (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
        );
    }, [brand, catalogTab, searchQuery]);

    // Pick the cheapest in-stock serviceable distributor for a brand product.
    //
    // ── No-silent-fallback rule (2026-05-19) ──
    // When the customer has a pincode set AND no in-stock distributor services that
    // pincode, we deliberately return `null` instead of silently falling back to the
    // cheapest non-serviceable vendor. The previous behaviour was a UX trap: the card
    // would "Add" successfully, toast "Added X from Y", and then the customer would
    // hit a delivery-area wall at checkout. Instead, callers should detect the null
    // result and open the vendor picker modal, where every distributor is listed with
    // a clear "Doesn't deliver to {pincode}" warning so the customer can make an
    // informed choice (or pick a different brand).
    //
    // When the customer has NO pincode, we keep the old behaviour (cheapest in-stock)
    // because there's no delivery-area to violate.
    const pickBestDistributor = (product: BrandProduct): BrandDistributor | null => {
        const inStock = product.distributors.filter(d => d.inStock);
        if (inStock.length === 0) return null;
        const serviceable = inStock.filter(d => d.servicesPincode !== false);
        if (pincode && serviceable.length === 0) return null;
        const pool = serviceable.length > 0 ? serviceable : inStock;
        return pool.slice().sort((a, b) => a.price - b.price)[0];
    };

    const addBrandProductToCart = (product: BrandProduct, dist: BrandDistributor) => {
        // Construct minimal VendorProduct shape needed by CartContext.addToCart
        const vp: VendorProduct = {
            id: dist.distributorProductId,
            name: dist.distributorProductName,
            // displayName = brand canonical (so cart sticky bar / product card UIs show brand wording).
            // The cart page itself ignores displayName per Phase 1 decision (transactional integrity).
            displayName: product.name,
            brandName: brand?.name,
            brandSlug: brand?.slug,
            description: '',
            price: dist.basePrice * (1 + dist.taxPercent / 100),
            images: dist.imageUrl ? [dist.imageUrl] : (product.image ? [product.image] : []),
            category: product.category,
            packSize: dist.packSize || product.packSize || '',
            unit: dist.unit || '',
            stock: dist.stock,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            vendorId: dist.vendorId,
            vendorName: dist.vendorName,
            taxPercent: dist.taxPercent,
            bulkPrices: dist.priceSlabs.map(s => ({ minQty: s.minQty, price: s.price })),
            creditBadge: false,
            minOrderQuantity: dist.priceSlabs[0]?.minQty ?? 1,
        };

        setAdding(dist.distributorProductId);
        try {
            addToCart(vp, vp.minOrderQuantity);
            toast.success(`Added ${product.name} from ${dist.vendorName}`);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to add');
        } finally {
            setTimeout(() => setAdding(null), 600);
        }
    };

    // Resolve current cart qty for a given distributor product (so card shows +/- stepper after add)
    const cartQtyFor = (distributorProductId: string): number => {
        for (const g of groups) {
            const item = g.items.find(i => i.productId === distributorProductId);
            if (item) return item.quantity;
        }
        return 0;
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!brand) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <p className="text-[20px] font-black text-[#181725] mb-2">Brand not found</p>
                    <p className="text-[14px] text-gray-400 font-bold mb-6">
                        This brand store is not available yet.
                    </p>
                    <Link href="/" className="px-6 py-3 bg-primary text-white rounded-2xl font-black text-[14px]">
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    const handleProductClick = (product: BrandProduct) => {
        setSelectedProduct(product);
        setActiveTab('vendors');
    };

    const handleTabChange = (tab: ActiveTab) => {
        setActiveTab(tab);
        if (tab === 'items') setSelectedProduct(null);
    };

    const vendorsForProduct = selectedProduct
        ? brand.vendors.filter((v) => v.productIds.includes(selectedProduct.id))
        : brand.vendors;

    const fallbackSvg = (size: number) =>
        `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"%3E%3Crect fill="%23f5f5f5" width="${size}" height="${size}"/%3E%3C/svg%3E`;

    return (
        <div className="min-h-screen bg-[#F6FBF7] pb-24">

            {/* ══════════════════════════════════════════
                BRAND STOREFRONT HERO
                Full-bleed banner image (the actual product photo / lifestyle shot)
                with a clean info card overlapping the bottom edge. The brand
                logo bubble bridges the two — same pattern as Spotify artist /
                Zomato restaurant pages, polished for B2B feel.
            ══════════════════════════════════════════ */}
            {(() => {
                const bannerParsed = parseImageMeta(brand.bannerImage);
                const bannerStyle = getDisplayStyle(bannerParsed.meta);
                const logoParsed = parseImageMeta(brand.logoImage || brand.bannerImage);
                const logoStyle = getDisplayStyle(logoParsed.meta);
                const hasRealLogo = !!brand.logoImage;
                return (
                    <div>
                        <div className="max-w-[var(--container-max)] mx-auto md:px-[var(--container-padding)] md:pt-6">
                            {/* ─── Banner image — full-bleed hero ─── */}
                            <div className="relative w-full h-[200px] sm:h-[260px] md:h-[280px] lg:h-[320px] md:rounded-t-[28px] overflow-hidden bg-gradient-to-br from-primary-light to-[#d9efe1] md:border md:border-b-0 md:border-primary/20">
                                {bannerParsed.src ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                        src={bannerParsed.src}
                                        alt={brand.name}
                                        className="w-full h-full object-cover"
                                        style={bannerStyle}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Store size={48} className="text-primary/40" />
                                    </div>
                                )}
                                {/* Brand-color tint at bottom for clean transition into the info card */}
                                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/35 via-black/10 to-transparent pointer-events-none" />

                                {/* Back button */}
                                <button
                                    onClick={() => router.back()}
                                    className="absolute top-3 left-3 md:top-4 md:left-4 z-20 p-2 md:p-2.5 bg-white/90 backdrop-blur-md rounded-full shadow-md hover:bg-white transition"
                                    aria-label="Back"
                                >
                                    <ChevronLeft size={18} strokeWidth={3} className="text-[#181725]" />
                                </button>

                                {/* Brand-store ribbon — green for site theme */}
                                <div className="absolute top-3 right-3 md:top-4 md:right-4 z-20">
                                    <span className="inline-flex items-center gap-1.5 bg-primary text-white text-[10px] md:text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-md">
                                        <Store size={11} /> Brand Store
                                    </span>
                                </div>
                            </div>

                            {/* ─── Info card — overlaps the banner with a green accent bar ─── */}
                            <div className="relative px-4 md:px-0 -mt-10 md:-mt-12">
                                {/* Logo bubble — absolute, breaks out above the card so it isn't clipped by overflow-hidden */}
                                <div className="absolute z-20 -top-12 md:-top-16 left-9 md:left-8">
                                    <div className="w-[72px] h-[72px] md:w-[100px] md:h-[100px] rounded-2xl overflow-hidden bg-white border-4 border-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] ring-2 ring-primary/20 flex items-center justify-center">
                                        {logoParsed.src ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                                src={logoParsed.src}
                                                alt={brand.name}
                                                className={cn('w-full h-full', hasRealLogo ? 'object-contain p-2' : 'object-cover')}
                                                style={logoStyle}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-light to-[#d9efe1]">
                                                <span className="text-[30px] md:text-[42px] font-black text-primary">{brand.name[0]}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl md:rounded-b-[28px] md:rounded-t-none border border-primary/20 md:border-t-0 shadow-[0_10px_30px_rgba(107, 29, 46, )] overflow-hidden">
                                    {/* Thin green accent line at top — ties to site theme */}
                                    <div className="h-1 bg-gradient-to-r from-primary via-primary-dark to-primary" />

                                    {/* Content padded on left to clear the absolute logo */}
                                    <div className="pl-[110px] md:pl-[150px] pr-5 md:pr-8 py-5 md:py-6">
                                        <div className="flex items-start gap-4 md:gap-5">
                                            {/* Name + tagline + meta */}
                                            <div className="flex-1 min-w-0 pt-1 md:pt-2">
                                                <h1 className="text-[22px] md:text-[30px] lg:text-[34px] font-[900] text-[#181725] leading-tight tracking-tight truncate">
                                                    {brand.name}
                                                </h1>
                                                {brand.tagline && (
                                                    <p className="text-[12px] md:text-[14px] text-gray-500 font-medium mt-0.5 line-clamp-2">
                                                        {brand.tagline}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-2 md:gap-3 mt-3 flex-wrap">
                                                    <span className="inline-flex items-center gap-1.5 bg-primary-light border border-primary/20 px-2.5 py-1 rounded-full text-[11px] md:text-[12px] font-bold">
                                                        <Store size={11} className="text-primary" />
                                                        <span className="text-[#181725] font-[900]">{brand.products.length}</span>
                                                        <span className="text-primary">products</span>
                                                    </span>
                                                    <span className="inline-flex items-center gap-1.5 bg-primary-light border border-primary/20 px-2.5 py-1 rounded-full text-[11px] md:text-[12px] font-bold">
                                                        <MapPin size={11} className="text-primary" />
                                                        <span className="text-[#181725] font-[900]">{brand.vendors.length}</span>
                                                        <span className="text-primary">distributors</span>
                                                    </span>
                                                    {pincode && brand.coverage && brand.coverage.servicedVendorCount > 0 && (
                                                        <span className="inline-flex items-center gap-1.5 bg-primary text-white px-2.5 py-1 rounded-full text-[11px] md:text-[12px] font-bold">
                                                            <Check size={11} strokeWidth={3} />
                                                            <span className="font-[900]">{brand.coverage.servicedVendorCount}</span>
                                                            <span className="hidden md:inline">in {pincode}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* CTA — site green theme */}
                                            <div className="hidden md:block shrink-0">
                                                <button
                                                    onClick={() => handleTabChange('items')}
                                                    className="bg-primary text-white px-5 lg:px-7 py-2.5 lg:py-3 rounded-xl flex items-center gap-1.5 text-[13px] lg:text-[14px] font-bold hover:bg-primary-dark hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_8px_20px_rgba(107,29,46,0.35)]"
                                                >
                                                    Explore Items
                                                    <ChevronLeft size={16} strokeWidth={3} className="rotate-180" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Mobile CTA — full width below */}
                                        <button
                                            onClick={() => handleTabChange('items')}
                                            className="md:hidden mt-4 w-full bg-primary text-white py-3 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-bold active:scale-[0.98] transition-transform shadow-[0_6px_16px_rgba(107,29,46,0.35)]"
                                        >
                                            Explore Items
                                            <ChevronLeft size={14} strokeWidth={3} className="rotate-180" />
                                        </button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className="mt-4 md:mt-6">
                                    <TabBar activeTab={activeTab} brand={brand} onTabChange={handleTabChange} />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ══════════════════════════════════════════
                TAB CONTENT
            ══════════════════════════════════════════ */}
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-6">

                {/* Pincode coverage banner */}
                {pincode && brand.coverage && !showAllVendors && (
                    brand.coverage.servicedVendorCount === 0 ? (
                        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-[13px] font-bold text-amber-900">
                                    No distributors in {pincode} yet
                                </p>
                                <p className="text-[12px] text-amber-700 mt-0.5">
                                    Browse {brand.name}&rsquo;s catalog below — we&rsquo;ll let you know when a distributor in your pincode stocks these products.
                                </p>
                                {brand.coverage.totalVendorCount > 0 && (
                                    <button
                                        onClick={() => setShowAllVendors(true)}
                                        className="mt-2 text-[12px] font-bold text-amber-900 underline hover:text-amber-700"
                                    >
                                        Show all {brand.coverage.totalVendorCount} distributors anyway
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mb-5 px-4 py-2.5 bg-primary-light border border-primary/20 rounded-2xl flex items-center gap-2">
                            <span className="text-[12px] text-primary font-semibold">
                                Showing {brand.coverage.servicedVendorCount} distributor{brand.coverage.servicedVendorCount !== 1 ? 's' : ''} delivering to {pincode}
                            </span>
                            {brand.coverage.totalVendorCount > brand.coverage.servicedVendorCount && (
                                <button
                                    onClick={() => setShowAllVendors(true)}
                                    className="ml-auto text-[12px] font-bold text-primary hover:underline"
                                >
                                    Show all {brand.coverage.totalVendorCount}
                                </button>
                            )}
                        </div>
                    )
                )}
                {showAllVendors && pincode && (
                    <div className="mb-5 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-between gap-2">
                        <span className="text-[12px] text-gray-600 font-semibold">
                            Showing all distributors (some may not deliver to {pincode})
                        </span>
                        <button
                            onClick={() => setShowAllVendors(false)}
                            className="text-[12px] font-bold text-primary hover:underline"
                        >
                            Filter to my pincode
                        </button>
                    </div>
                )}

                {/* ALL ITEMS TAB */}
                {activeTab === 'items' && (
                    <>
                    {/* Search & Toggle Bar */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div className="relative flex-1 md:max-w-[450px] lg:max-w-[600px] flex items-center gap-2 md:gap-3">
                            <div className="relative flex-1">
                                <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 focus-within:text-primary transition-colors" strokeWidth={3} />
                                <input
                                    type="text"
                                    placeholder={`Search in ${brand.name}...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-10 py-3 bg-white border border-gray-100 rounded-2xl text-[14px] font-bold text-gray-800 placeholder:text-gray-400 placeholder:font-bold focus:outline-none focus:border-primary/50 focus:bg-white focus:ring-8 focus:ring-primary/5 transition-all duration-300 shadow-sm"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl bg-gray-100 text-gray-400 hover:bg-gray-200 transition">
                                        <X size={13} strokeWidth={3} />
                                    </button>
                                )}
                            </div>
                            
                            {/* Grid/List Toggle */}
                            <div className="flex items-center bg-white border border-gray-100 rounded-2xl p-0.5 shrink-0 shadow-sm">
                                <button
                                    onClick={() => updateLayoutMode('grid')}
                                    aria-label="Grid view"
                                    className={cn(
                                        'p-2 rounded-xl transition-all',
                                        layoutMode === 'grid' ? 'bg-primary text-white shadow-sm' : 'text-gray-400 hover:text-primary'
                                    )}
                                >
                                    <LayoutGrid size={16} strokeWidth={2.5} />
                                </button>
                                <button
                                    onClick={() => updateLayoutMode('list')}
                                    aria-label="List view"
                                    className={cn(
                                        'p-2 rounded-xl transition-all',
                                        layoutMode === 'list' ? 'bg-primary text-white shadow-sm' : 'text-gray-400 hover:text-primary'
                                    )}
                                >
                                    <LayoutList size={16} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 md:gap-4 lg:gap-6 items-start">
                        {/* LEFT: CATEGORIES SIDEBAR */}
                        <aside className="w-[76px] md:w-[200px] lg:w-[260px] shrink-0 sticky top-24 z-30">
                            <div className="bg-white rounded-2xl border border-gray-100 p-1 md:p-3 shadow-sm">
                                {/* All Products option */}
                                <button
                                    type="button"
                                    onClick={() => setCatalogTab('all')}
                                    className={cn(
                                        "w-full rounded-xl transition-all text-left flex flex-col items-center md:flex-row md:items-center md:justify-between px-1 md:px-3 py-2 md:py-2.5",
                                        catalogTab === 'all' ? "bg-primary/10" : "hover:bg-gray-50"
                                    )}
                                >
                                    <div className="flex flex-col items-center md:flex-row md:items-center md:gap-3 min-w-0 w-full">
                                        <div className={cn(
                                            "w-12 h-12 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition-all shrink-0",
                                            catalogTab === 'all' ? "bg-white border border-primary/30 shadow-sm" : "bg-gray-50"
                                        )}>
                                            <LayoutGrid className={cn('w-5 h-5 md:w-4 md:h-4', catalogTab === 'all' ? 'text-primary' : 'text-gray-400')} strokeWidth={2} />
                                        </div>
                                        <span className={cn(
                                            "text-[10px] md:text-[13px] font-semibold md:font-bold leading-tight text-center md:text-left mt-1 md:mt-0 line-clamp-2 md:line-clamp-none md:truncate w-full md:flex-1",
                                            catalogTab === 'all' ? "text-primary" : "text-[#181725]"
                                        )}>
                                            All Products
                                        </span>
                                    </div>
                                    <span className="hidden md:inline text-[11px] font-bold text-gray-400 shrink-0 ml-2">{brand.products.length}</span>
                                </button>

                                {brandCategoryTree.map((parent) => {
                                    const isParentActive = catalogTab === `cat:${parent.name}` || parent.children.some((c) => catalogTab === `cat:${c.name}`);
                                    return (
                                        <button
                                            key={parent.id}
                                            type="button"
                                            onClick={() => setCatalogTab(`cat:${parent.name}`)}
                                            className={cn(
                                                "w-full mt-1 rounded-xl transition-all text-left flex flex-col items-center md:flex-row md:items-center md:gap-3 px-1 md:px-3 py-2 md:py-2.5 min-w-0",
                                                isParentActive ? "bg-primary/10" : "hover:bg-gray-50"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-12 h-12 md:w-9 md:h-9 rounded-lg flex items-center justify-center overflow-hidden relative transition-all shrink-0",
                                                isParentActive ? "bg-white border border-primary/30 shadow-sm" : "bg-gray-50"
                                            )}>
                                                {parent.image ? (
                                                    <Image src={parent.image} alt={parent.name} width={36} height={36} className="object-contain w-full h-full p-1" />
                                                ) : (
                                                    <Package size={16} className="text-gray-300" strokeWidth={1.5} />
                                                )}
                                            </div>
                                            <span className={cn(
                                                "text-[10px] md:text-[13px] font-semibold md:font-bold leading-tight text-center md:text-left mt-1 md:mt-0 line-clamp-2 md:line-clamp-none md:truncate w-full md:flex-1",
                                                isParentActive ? "text-primary" : "text-[#181725]"
                                            )}>
                                                {parent.name}
                                            </span>
                                            <span className="hidden md:inline text-[11px] font-bold text-gray-400 shrink-0">{parent.count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        {/* RIGHT: SUB-CATEGORY TILES or PRODUCTS */}
                        <div className="flex-1 min-w-0">
                            {showSubcategoryTiles && activeParentNode ? (
                                <div>
                                    <h2 className="text-[clamp(1.1rem,2vw+0.5rem,1.6rem)] font-black text-[#181725] mb-4">{activeParentNode.name}</h2>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                                        {activeParentNode.children.map((child) => (
                                            <button
                                                key={child.id}
                                                type="button"
                                                onClick={() => setCatalogTab(`cat:${child.name}`)}
                                                className="group bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all flex flex-col items-center text-center"
                                            >
                                                <div className="w-20 h-20 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden mb-3">
                                                    {child.image ? (
                                                        <Image src={child.image} alt={child.name} width={80} height={80} className="object-contain w-full h-full p-2" />
                                                    ) : (
                                                        <Package size={28} className="text-gray-300" strokeWidth={1.5} />
                                                    )}
                                                </div>
                                                <span className="text-[13px] font-bold text-[#181725] group-hover:text-primary transition-colors line-clamp-2">{child.name}</span>
                                                <span className="text-[11px] font-bold text-gray-400 mt-1">{child.count} items</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : filteredProducts.length > 0 ? (
                                <div className={cn(
                                    layoutMode === 'grid'
                                        ? 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4'
                                        : 'flex flex-col gap-3 md:gap-4'
                                )}>
                                    {filteredProducts.map((product) => {
                                        const best = pickBestDistributor(product);
                                        const cheapest = pickCheapestDistributor(product);
                                        const displayDist = best ?? cheapest;
                                        const avail = getProductAvailState(product, best, pincode);
                                        const distCount = product.distributors.filter((d) => d.inStock).length;
                                        const packDisplay = formatPackSize(product.packSize, product.unit) || '—';

                                        const mappedProduct: VendorProduct = {
                                            id: best ? best.distributorProductId : product.id,
                                            name: product.name,
                                            displayName: product.name,
                                            description: '',
                                            price: displayDist?.price ?? 0,
                                            images: [resolveProductImage(product, displayDist)],
                                            category: product.category,
                                            packSize: packDisplay,
                                            unit: displayDist?.unit || product.unit || '',
                                            stock: avail === 'serviceable' ? (best!.stock || 999) : avail === 'area' ? 1 : 0,
                                            isActive: avail === 'serviceable',
                                            createdAt: new Date(),
                                            updatedAt: new Date(),
                                            vendorId: best?.vendorId ?? '',
                                            vendorName: avail === 'serviceable'
                                                ? best!.vendorName
                                                : avail === 'area'
                                                    ? 'View distributors'
                                                    : 'No distributor',
                                            bulkPrices: displayDist?.priceSlabs.map((s) => ({ minQty: s.minQty, price: s.price })) ?? [],
                                            creditBadge: false,
                                            minOrderQuantity: displayDist?.priceSlabs[0]?.minQty ?? 1,
                                        };

                                        const availabilityLabel = avail === 'area'
                                            ? 'area' as const
                                            : avail === 'none'
                                                ? 'none' as const
                                                : avail === 'out'
                                                    ? 'out' as const
                                                    : undefined;

                                        const card = (
                                            <VendorProductCard
                                                product={mappedProduct}
                                                variant={layoutMode}
                                                distributorName={best?.vendorName}
                                                distributorCount={distCount}
                                                availabilityLabel={availabilityLabel}
                                                forceInStockDisplay={avail === 'area'}
                                                onDistributorClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setVendorPickerProduct(product);
                                                }}
                                            />
                                        );

                                        if (avail === 'area') {
                                            return (
                                                <div key={product.id} className="relative">
                                                    {card}
                                                    <button
                                                        type="button"
                                                        aria-label={`View distributors for ${product.name}`}
                                                        onClick={() => setVendorPickerProduct(product)}
                                                        className="absolute inset-0 z-10 w-full h-full rounded-2xl cursor-pointer bg-transparent"
                                                    />
                                                </div>
                                            );
                                        }

                                        return <React.Fragment key={product.id}>{card}</React.Fragment>;
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-24 text-center">
                                    <div className="p-6 bg-gray-50 rounded-full mb-4">
                                        <Package className="text-gray-300" size={48} strokeWidth={1.5} />
                                    </div>
                                    <h3 className="text-[20px] font-black text-[#181725]">No items found</h3>
                                    <p className="text-gray-400 font-bold mt-1">Try adjusting your search or filters</p>
                                </div>
                            )}
                        </div>
                    </div>
                    </>
                )}

                {/* VENDORS TAB */}
                {activeTab === 'vendors' && (
                    <div>
                        {/* Selected product context bar */}
                        {selectedProduct && (
                            <div className="flex items-center gap-3 mb-5 p-4 bg-white rounded-[16px] border border-primary/20">
                                <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
                                    <img
                                        src={resolveProductImage(selectedProduct)}
                                        alt={selectedProduct.name}
                                        className="w-full h-full object-contain p-1.5"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackSvg(40); }}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Showing vendors for</p>
                                    <p className="text-[14px] font-black text-[#181725] truncate">{selectedProduct.name}</p>
                                </div>
                                <button
                                    onClick={() => handleTabChange('items')}
                                    className="flex items-center gap-1.5 text-[12px] font-black text-primary shrink-0 hover:underline"
                                >
                                    <ArrowLeft size={13} strokeWidth={3} />
                                    All Items
                                </button>
                            </div>
                        )}

                        {/* Vendor cards */}
                        {vendorsForProduct.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <Store size={40} className="text-gray-200 mb-3" strokeWidth={1.5} />
                                <p className="text-[16px] font-black text-gray-400">No distributors available</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {vendorsForProduct.map((vendor) => (
                                    <Link
                                        key={vendor.id}
                                        href={`/vendor/${vendor.id}`}
                                        className="flex items-center gap-4 p-5 bg-white rounded-[20px] border border-gray-100 hover:border-primary/30 hover:shadow-lg hover:shadow-gray-100 transition-all duration-200 group"
                                    >
                                        <VendorAvatar name={vendor.name} logo={vendor.logo} size={80} rounded="18px" fit="cover" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[16px] font-black text-[#181725] group-hover:text-primary transition-colors truncate">
                                                {vendor.name}
                                            </p>
                                            <p className="text-[12px] text-gray-400 font-bold flex items-center gap-1 mt-1">
                                                <MapPin size={12} strokeWidth={2.5} />
                                                {vendor.location}
                                            </p>
                                            {selectedProduct && vendor.prices[selectedProduct.id] ? (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className="text-[18px] font-[1000] text-primary">
                                                        ₹{vendor.prices[selectedProduct.id]}
                                                    </span>
                                                    <span className="flex items-center gap-1 text-[11px] font-black text-success">
                                                        <span className="w-1.5 h-1.5 bg-success-light0 rounded-full" />
                                                        In Stock
                                                    </span>
                                                </div>
                                            ) : (
                                                <p className="text-[12px] font-bold text-gray-400 mt-1.5">
                                                    {vendor.productIds.length} products available
                                                </p>
                                            )}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Vendor picker modal — pick a distributor to ADD from */}
            {vendorPickerProduct && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setVendorPickerProduct(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-[15px] font-bold text-[#181725]">{vendorPickerProduct.name}</h3>
                                <p className="text-[12px] text-gray-500 mt-0.5">Pick a distributor to order from</p>
                            </div>
                            <button onClick={() => setVendorPickerProduct(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                            {vendorPickerProduct.distributors
                                .slice()
                                .sort((a, b) => Number(b.servicesPincode !== false) - Number(a.servicesPincode !== false) || a.price - b.price)
                                .map((dist) => {
                                    const isAdding = adding === dist.distributorProductId;
                                    // A distributor counts as "non-serviceable" only when the customer
                                    // has a pincode selected AND the API marked the vendor as not
                                    // covering it. Without a pincode we have no way to verify and the
                                    // Add button stays enabled (customer can still proceed; the cart
                                    // page gates on pincode selection elsewhere).
                                    const nonServiceable = !!pincode && dist.servicesPincode === false;
                                    const addDisabled = !dist.inStock || isAdding || nonServiceable;
                                    return (
                                        <div key={dist.distributorProductId} className="p-4 flex items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-bold text-[#181725] truncate">{dist.vendorName}</p>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <span className="text-[16px] font-[1000] text-primary">₹{dist.price}</span>
                                                    {!dist.inStock && <span className="text-[10px] font-bold text-red-500">Out of stock</span>}
                                                    {nonServiceable && (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                                                            <AlertCircle size={11} strokeWidth={2.5} />
                                                            Doesn&rsquo;t deliver to {pincode}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {nonServiceable ? (
                                                <Link
                                                    href={`/vendor/${dist.vendorId}`}
                                                    onClick={() => setVendorPickerProduct(null)}
                                                    className="px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1 bg-white border border-primary/30 text-primary hover:bg-primary-light shrink-0"
                                                >
                                                    View vendor
                                                    <ChevronRight size={12} strokeWidth={3} />
                                                </Link>
                                            ) : (
                                                <button
                                                    onClick={() => { addBrandProductToCart(vendorPickerProduct, dist); setVendorPickerProduct(null); }}
                                                    disabled={addDisabled}
                                                    className={cn(
                                                        'px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1 transition-colors shrink-0',
                                                        dist.inStock ? 'bg-primary text-white hover:bg-primary-dark' : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                                                        isAdding && 'opacity-60'
                                                    )}
                                                >
                                                    {isAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={3} />}
                                                    Add
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
