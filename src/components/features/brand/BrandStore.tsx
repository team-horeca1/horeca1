'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, Share2, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { shareCard } from '@/lib/share-cards/shareClient';
import { cn } from '@/lib/utils';
import { parseImageMeta, getDisplayStyle } from '@/lib/imageMeta';
import { buildCategoryTree, filterProductsByCatalogTab, slugifyCategory } from '@/lib/categoryTree';
import { useDeliveryPincode } from '@/hooks/useDeliveryPincode';
import { VendorCategoryRail } from '@/components/features/vendor/VendorCategoryRail';
import { BrandProductCard } from '@/components/features/brand/BrandProductCard';
import { BrandAttributeFilters, matchesBrandAttrFilters, type BrandAttrFilter } from '@/components/features/brand/BrandAttributeFilters';
import { BrandSuppliersPanel, type BrandSupplier } from '@/components/features/brand/BrandSuppliersPanel';

const PRODUCT_IMAGE_FALLBACK = '/images/recom-product/product-img10.png';

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

interface BrandStoreData {
    id: string;
    slug: string;
    name: string;
    bannerImage: string;
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
    const bannerStyle = getDisplayStyle(bannerParsed.meta);
    const logoParsed = parseImageMeta(brand.logoImage || brand.bannerImage);
    const logoStyle = getDisplayStyle(logoParsed.meta);
    const supplierCount = pincode && brand.coverage
        ? brand.coverage.servicedVendorCount
        : brand.vendors.length;

    const openSku = (product: BrandProduct) => {
        setSelectedSkuId(product.id);
        setActiveTab('suppliers');
    };

    const handleShareBrand = async () => {
        const result = await shareCard({
            title: brand.name,
            text: `Find ${brand.name} on Horeca1`,
            url: `${window.location.origin}/brand/${brand.slug}`,
            imageUrl: `/api/og/brand/${brand.slug}?format=square`,
        });
        if (result === 'copied') toast.success('Link copied');
    };

    return (
        <div className="min-h-dvh bg-page pb-20 md:pb-24">
            <div className="relative">
                <div className="h-[120px] md:h-[200px] bg-primary overflow-hidden">
                    {bannerParsed.src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bannerParsed.src} alt="" className="w-full h-full object-cover" style={bannerStyle} />
                    ) : (
                        <div className="w-full h-full bg-primary" />
                    )}
                    <div className="absolute inset-x-0 top-0 h-[120px] md:h-[200px] bg-black/20 pointer-events-none" />
                </div>

                <div className="relative max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] -mt-8">
                    <div className="size-16 md:size-20 rounded-2xl bg-white border border-divider overflow-hidden flex items-center justify-center">
                        {logoParsed.src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={logoParsed.src}
                                alt={brand.name}
                                className="size-full object-contain p-1.5"
                                style={logoStyle}
                            />
                        ) : (
                            <span className="text-[22px] font-semibold text-primary">{brand.name[0]}</span>
                        )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <h1 className="text-[22px] md:text-[28px] font-semibold text-text text-balance truncate">
                            {brand.name}
                        </h1>
                        <button
                            type="button"
                            onClick={() => void handleShareBrand()}
                            aria-label="Share brand"
                            className="size-9 rounded-full bg-white border border-divider flex items-center justify-center text-primary shrink-0"
                        >
                            <Share2 size={15} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)] mt-4">
                <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                        type="search"
                        placeholder={`Search ${brand.name} products`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-11 pl-10 pr-10 rounded-xl bg-white border border-divider text-[13px] font-medium text-text placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear search"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="mt-4 flex border-b border-divider">
                    {([
                        { key: 'catalogue' as const, label: 'Catalogue', count: brand.products.length },
                        { key: 'suppliers' as const, label: 'Suppliers', count: supplierCount },
                    ]).map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => {
                                setActiveTab(tab.key);
                                if (tab.key === 'catalogue') setSelectedSkuId('');
                            }}
                            className={cn(
                                'flex-1 pb-2.5 text-[14px] font-semibold',
                                activeTab === tab.key ? 'text-primary border-b-2 border-primary' : 'text-text-muted',
                            )}
                        >
                            {tab.label}
                            <span className="ml-1 tabular-nums">· {tab.count}</span>
                        </button>
                    ))}
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
