'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
    ArrowLeft,
    ChevronDown,
    ChevronUp,
    Plus,
    ShoppingCart,
    Share2,
    Info,
    ShieldCheck,
    Leaf,
    ArrowRight,
    Store,
    Loader2,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PromotionBanners } from '@/components/features/PromotionBanners';
import { DeliveryPoster } from '@/components/features/DeliveryPoster';
import { useCart } from '@/context/CartContext';
import { toast } from 'sonner';
import { dal } from '@/lib/dal';
import type { Vendor as DalVendor, VendorProduct } from '@/types';
import AlternateVendorsStrip from '@/components/features/product/AlternateVendorsStrip';

// --- API Product Type ---
interface ApiProduct {
    id: string;
    name: string;
    description: string | null;
    basePrice: number;
    originalPrice: number | null;
    promoPrice: number | null;
    imageUrl: string | null;
    images: string[];
    packSize: string | null;
    unit: string | null;
    brand: string | null;
    tags: string[];
    category: { id: string; name: string; slug: string } | null;
    vendor: { id: string; businessName: string; slug: string; logoUrl: string | null; rating: number; minOrderValue: number } | null;
    priceSlabs: { minQty: number; maxQty: number | null; price: number }[];
    inventory: { qtyAvailable: number } | null;
    brandMappings?: { brandMasterProduct: { name: string; brand: { name: string; slug: string } } }[];
    /** Server-resolved customer-specific price (price list / override) for the logged-in buyer. */
    customerPricing?: { unitPrice: number; source: string };
}

export default function ProductDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [apiProduct, setApiProduct] = useState<ApiProduct | null>(null);
    const [pageLoading, setPageLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
    const { addToCart, groups, updateQuantity } = useCart();

    useEffect(() => {
        fetch(`/api/v1/products/${id}`)
            .then(r => r.json())
            .then(json => { if (json.success) setApiProduct(json.data); else setLoadError(true); })
            .catch(() => setLoadError(true))
            .finally(() => setPageLoading(false));
    }, [id]);

    // Derived display values
    const rawProductName = apiProduct?.name || '';
    const brandMapping = apiProduct?.brandMappings?.[0]?.brandMasterProduct;
    const productName = brandMapping?.name || rawProductName; // brand canonical name on PDP if mapped
    const brandName = brandMapping?.brand?.name as string | undefined;
    const brandSlug = brandMapping?.brand?.slug as string | undefined;
    const vendorName = apiProduct?.vendor?.businessName || '';
    // Customer-specific price (price list / override) outranks slabs — it's
    // what the cart will charge, so it's what the page must show.
    const customerPrice = apiProduct?.customerPricing?.unitPrice;
    const hasCustomerPrice = customerPrice != null && Number.isFinite(Number(customerPrice));
    const productPrice = hasCustomerPrice
        ? Number(customerPrice)
        : apiProduct?.priceSlabs?.[0]?.price ?? apiProduct?.basePrice ?? 0;
    const customerStrikePrice = hasCustomerPrice && Number(apiProduct?.basePrice ?? 0) > productPrice
        ? Number(apiProduct?.basePrice)
        : null;
    const productImage = apiProduct?.imageUrl || apiProduct?.images?.[0] || '/images/product/product-img3.png';
    const productCategory = apiProduct?.category?.name || '';
    const productUnit = apiProduct?.packSize || '1 unit';
    const productDescription = apiProduct?.description || 'Premium quality product sourced for professional kitchens.';
    // Slab tiers are outranked (and ignored by the cart) when a customer price applies — hide them.
    const apiPriceSlabs = apiProduct?.priceSlabs;
    const bulkPrices = useMemo(
        () => (hasCustomerPrice ? [] : (apiPriceSlabs || [])),
        [hasCustomerPrice, apiPriceSlabs],
    );
    const stockQty = apiProduct?.inventory?.qtyAvailable ?? 0;

    // Derive product object matching old UI shape
    const product = useMemo(() => ({
        id: 0,
        name: productName,
        category: productCategory,
        image: productImage,
        description: productDescription,
        vendors: [],
        weight: productUnit,
        price: productPrice,
    }), [productName, productCategory, productImage, productDescription, productUnit, productPrice]);

    const vendorProductForContext: VendorProduct = useMemo(() => ({
        id: apiProduct?.id || id,
        vendorId: apiProduct?.vendor?.id || '',
        vendorName: apiProduct?.vendor?.businessName || '',
        vendorLogo: apiProduct?.vendor?.logoUrl || '',
        name: productName,
        description: productDescription,
        category: productCategory,
        price: productPrice,
        originalPrice: apiProduct?.originalPrice ?? productPrice,
        images: [productImage],
        packSize: productUnit,
        unit: apiProduct?.unit || productUnit,
        stock: stockQty,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        bulkPrices: bulkPrices.map(s => ({ minQty: s.minQty, price: s.price })),
        creditBadge: false,
        minOrderQuantity: bulkPrices[0]?.minQty || 1,
        customerPriceApplied: hasCustomerPrice || undefined,
    }), [apiProduct, id, productName, productDescription, productCategory, productPrice, productImage, productUnit, stockQty, bulkPrices, hasCustomerPrice]);

    // Track recently viewed vendor for "Continue Ordering" section
    const [dalVendors, setDalVendors] = useState<DalVendor[]>([]);
    useEffect(() => {
        dal.vendors.list().then(({ vendors }) => setDalVendors(vendors)).catch(() => {});
    }, []);

    useEffect(() => {
        if (!apiProduct || !vendorName) return;
        try {
            const matched = dalVendors.find(v => v.id === apiProduct.vendor?.id);
            const vId = apiProduct.vendor?.id || `product-vendor-${vendorName}`;
            const vName = apiProduct.vendor?.businessName || vendorName;
            const vLogo = matched?.logo || apiProduct.vendor?.logoUrl || '';

            type ViewedProduct = { id: string; name: string; image: string; price: number; unit: string };
            type ViewedEntry = { vendorId: string; vendorName: string; vendorLogo: string; viewedProducts: ViewedProduct[]; viewedAt: number };
            const KEY = 'horeca_recently_viewed';
            const saved = localStorage.getItem(KEY);
            let entries: ViewedEntry[] = [];
            if (saved) entries = JSON.parse(saved);

            const existing = entries.find((e) => e.vendorId === vId);
            const existingProducts: ViewedProduct[] = existing?.viewedProducts || [];
            const currentProduct: ViewedProduct = { id: apiProduct.id, name: productName, image: productImage, price: productPrice, unit: productUnit };

            const seenIds = new Set<string>();
            const mergedProducts: ViewedProduct[] = [];
            [currentProduct, ...existingProducts].forEach((p) => {
                if (!seenIds.has(p.id)) { seenIds.add(p.id); mergedProducts.push(p); }
            });

            entries = entries.filter((e) => e.vendorId !== vId);
            entries.unshift({ vendorId: vId, vendorName: vName, vendorLogo: vLogo, viewedProducts: mergedProducts.slice(0, 20), viewedAt: Date.now() });
            if (entries.length > 20) entries = entries.slice(0, 20);
            localStorage.setItem(KEY, JSON.stringify(entries));
        } catch (e) { console.error('Failed to save recently viewed:', e); }
    }, [apiProduct, vendorName, dalVendors, productName, productImage, productPrice, productUnit]);

    const handleAdd = (qty: number = 1) => {
        if (!apiProduct) return;
        const vendorGroup = groups.find(g => g.vendorId === apiProduct.vendor?.id);
        const cartItem = vendorGroup?.items.find(i => i.productId === apiProduct.id);
        const currentQty = cartItem?.quantity || 0;

        if (currentQty > 0) {
            updateQuantity(apiProduct.id, currentQty + qty);
        } else {
            addToCart(vendorProductForContext, qty);
        }

        toast.success(`${productName} added to cart!`, {
            description: `Quantity: ${currentQty + qty} ${productUnit}`,
            duration: 2000,
        });
    };

    const similarItemsList: { id: string; originalId?: string; name: string; image: string; vendorCount?: number }[] = []; // Similar items loaded from API in a future iteration

    const handleShare = async () => {
        const shareData = {
            title: product.name,
            text: `Check out ${product.name} from ${vendorName} on Horeca1`,
            url: window.location.href,
        };

        try {
            if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                toast.success('Link copied to clipboard!', {
                    description: 'You can now share it with others.',
                });
            }
        } catch (err) {
            // Only show error if it's not a user cancellation
            if (err instanceof Error && err.name !== 'AbortError') {
                toast.error('Failed to share link');
            }
        }
    };

    if (pageLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 size={36} className="animate-spin text-[#53B175]" />
            </div>
        );
    }

    if (loadError || !apiProduct) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="text-center p-8">
                    <p className="text-[18px] font-bold text-gray-800 mb-2">Product not found</p>
                    <button onClick={() => router.back()} className="text-[#53B175] font-bold">Go Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#FFFFFF] min-h-screen">
            {/* Top Green Bar (Mobile Only) */}
            <div className="w-full h-[5px] bg-[#53B175] md:hidden" />

            {/* Mobile Header */}
            <header className="md:hidden bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-[100] border-b border-gray-50">
                <button onClick={() => router.back()} className="p-1">
                    <ArrowLeft size={22} className="text-[#181725]" strokeWidth={2} />
                </button>
                <div className="absolute left-1/2 -translate-x-1/2 text-[18px] font-extrabold text-[#181725] tracking-tight whitespace-nowrap">
                    {vendorName}
                </div>
                <div className="w-8" />
            </header>

            {/* --- MOBILE VIEW (Simplified Layout) --- */}
            <div className="md:hidden bg-[#F8F9FB]/30">
                <main className="mx-0 bg-white pt-2 pb-8 px-5 rounded-b-[30px] shadow-sm">
                    {/* Image Section */}
                    <div className="relative flex flex-col items-center pt-4">
                        <div className="relative w-[240px] h-[240px] flex items-center justify-center p-4">
                            <Image
                                src={product.image}
                                alt={product.name}
                                fill
                                sizes="240px"
                                priority
                                className="object-contain p-4"
                            />
                        </div>
                        <div className="flex gap-1.5 mt-4">
                            <div className="w-[18px] h-[6px] bg-[#7C7C7C] rounded-full" />
                            <div className="w-[6px] h-[6px] bg-[#E2E2E2] rounded-full" />
                            <div className="w-[6px] h-[6px] bg-[#E2E2E2] rounded-full" />
                            <div className="w-[6px] h-[6px] bg-[#E2E2E2] rounded-full" />
                        </div>
                    </div>

                    <div className="pt-8">
                        <span className="inline-block px-2 py-1 rounded-[6px] bg-[#EAF6EF] text-[#53B175] text-[11px] font-bold mb-3 uppercase tracking-wider">{product.category}</span>
                        <div className="flex items-start justify-between gap-4 mb-1">
                            <div className="flex-1">
                                <h1 className="text-[24px] font-extrabold text-[#181725] leading-tight tracking-tight">{product.name}</h1>
                                {brandSlug && brandName && (
                                    <Link href={`/brand/${brandSlug}`} className="inline-block mt-1 text-[12px] font-bold text-[#53B175] hover:underline">
                                        by {brandName}
                                    </Link>
                                )}
                            </div>
                            <div className="flex items-center gap-2 pt-1.5">
                                <button onClick={handleShare} className="text-[#181725] active:scale-90 transition-transform">
                                    <Share2 size={21} />
                                </button>
                            </div>
                        </div>
                        <p className="text-[15px] font-medium text-[#7C7C7C] mb-6">{product.weight || '1 kg'}</p>

                        {/* Mobile Tiered Pricing Box */}
                        {bulkPrices.length > 0 && (
                        <div className="bg-[#F1FBF4]/40 border border-[#53B175]/15 rounded-[22px] overflow-hidden mb-6">
                            {bulkPrices.map((slab, i) => (
                                <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#53B175]/10 last:border-b-0">
                                    <span className="text-[15px] font-bold text-[#53B175]">₹ {slab.price}/{productUnit} for {slab.minQty}+</span>
                                    <button onClick={() => handleAdd(slab.minQty)} className="bg-white border border-gray-100 rounded-full px-4 py-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#53B175] active:scale-95 shadow-sm">
                                        <Plus size={16} strokeWidth={3} /> ADD
                                    </button>
                                </div>
                            ))}
                        </div>
                        )}

                        <div className="flex items-baseline gap-2 mb-6 flex-wrap">
                            <span className="text-[22px] font-black text-[#181725]">₹ {productPrice}</span>
                            {customerStrikePrice != null && (
                                <span className="text-[15px] font-semibold text-gray-400 line-through">₹ {customerStrikePrice}</span>
                            )}
                            <span className="text-[15px] text-[#7C7C7C] font-semibold"> /kg</span>
                            {hasCustomerPrice && (
                                <span className="text-[10px] font-bold bg-[#EEF8F1] text-[#299E60] px-2 py-0.5 rounded-full uppercase tracking-wide">Your price</span>
                            )}
                        </div>

                        <button onClick={() => handleAdd(1)} className="w-full py-4 bg-[#EAF7EF] rounded-[20px] border border-[#53B175]/30 flex items-center justify-center gap-3 text-[#53B175] text-[16px] font-bold transition-all active:scale-95 hover:bg-[#E2F2E8]">
                            <span>Add To Cart</span>
                            <ShoppingCart size={20} />
                        </button>
                    </div>
                </main>

                {/* OOS alternates strip — only when current vendor has 0 stock */}
                {stockQty === 0 && (
                    <AlternateVendorsStrip productId={apiProduct.id} />
                )}

                {/* Mobile Product details Section */}
                <div className="mt-4 mx-4 bg-white rounded-[18px] p-5 shadow-sm border border-gray-50">
                    <h2 className="text-[18px] font-extrabold text-[#181725] mb-3">Product details</h2>
                    <p className="text-[14px] text-[#4C4C4C] leading-[1.6] font-medium opacity-80">{product.description}</p>
                </div>

                {/* Mobile Similar items */}
                <div className="mt-6 px-4">
                    <h2 className="text-[18px] font-bold text-[#181725] mb-4">Similar items</h2>
                    <div className="flex gap-3 overflow-x-auto pb-6 no-scrollbar -mx-4 px-4 snap-x">
                        {similarItemsList.map((item) => (
                            <Link key={item.id} href={`/product/${item.originalId || item.id}`} className="min-w-[150px] bg-white border border-gray-100 rounded-[18px] p-3 flex flex-col snap-start shadow-sm">
                                <div className="w-full aspect-[4/3] relative mb-3">
                                    <Image src={item.image || '/placeholder.png'} alt={item.name} fill className="object-contain" sizes="150px" />
                                </div>
                                <h3 className="text-[13px] font-bold text-[#181725] leading-tight line-clamp-1 mb-1">{item.name}</h3>
                                <p className="text-[10px] text-[#7C7C7C] font-medium">Sold by {item.vendorCount || 3} vendors</p>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- DESKTOP & TABLET VIEW (Professional Layout) --- */}
            <div className="hidden md:block">
                <main className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pb-24 pt-14">
                    {/* Upper Professional Section */}
                    <div className="grid grid-cols-12 gap-12 lg:gap-20">
                        {/* Left: Professional Showcase */}
                        <div className="col-span-12 lg:col-span-5">
                            <div className="w-full aspect-square bg-[#F8F9FB]/50 rounded-[48px] flex items-center justify-center p-12 relative overflow-hidden group border border-gray-50/50 shadow-[0_15px_60px_-15px_rgba(0,0,0,0.03)]">
                                <Image
                                    src={product.image}
                                    alt={product.name}
                                    fill
                                    sizes="(max-width: 1024px) 100vw, 40vw"
                                    priority
                                    className="object-contain p-12 transition-all duration-700 group-hover:scale-110"
                                />
                                <div className="absolute bottom-10 flex gap-2.5">
                                    <div className="w-8 h-1.5 bg-[#53B175] rounded-full" />
                                    <div className="w-2 h-1.5 bg-[#E2E2E2] rounded-full" />
                                    <div className="w-2 h-1.5 bg-[#E2E2E2] rounded-full" />
                                </div>
                                <div className="absolute top-8 left-8 flex items-center gap-2 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-2xl border border-green-50 shadow-sm">
                                    <ShieldCheck size={16} className="text-[#53B175]" />
                                    <span className="text-[12px] font-black text-[#181725] uppercase tracking-widest">Quality Verified</span>
                                </div>
                            </div>
                        </div>

                        {/* Right: Professional Actions */}
                        <div className="col-span-12 lg:col-span-7 flex flex-col pt-4">
                            <div className="flex items-center gap-2 text-[12px] font-black text-[#7C7C7C] mb-8 uppercase tracking-[0.2em] opacity-50">
                                <Link href="/" className="hover:text-[#53B175]">Home</Link>
                                <span>/</span>
                                <span className="text-[#53B175]">{product.category}</span>
                            </div>

                            <div className="flex items-start justify-between gap-10 mb-4">
                                <h1 className="text-[44px] lg:text-[54px] font-black text-[#181725] leading-[1.02] tracking-tighter">
                                    {product.name}
                                </h1>
                                <div className="flex items-center gap-4 pt-4 shrink-0">
                                    <button onClick={handleShare} className="w-14 h-14 rounded-full bg-white border border-gray-100 flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90 transition-transform">
                                        <Share2 size={26} className="text-[#181725]" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-5 mb-12">
                                <span className="text-[24px] font-bold text-[#7C7C7C]">{product.weight || '1 kg'}</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                                <span className="text-[17px] font-medium text-gray-500">Procured by <span className="text-[#181725] font-black underline decoration-[#53B175]/30 underline-offset-4">{vendorName}</span></span>
                            </div>

                            {/* Desktop Professional Pricing Cards */}
                            {bulkPrices.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
                                {bulkPrices.slice(0, 2).map((slab, i) => (
                                <div key={i} className="bg-[#F1FBF4]/40 border border-[#53B175]/15 rounded-[32px] p-7 transition-all hover:bg-[#F1FBF4]/60">
                                    <div className="flex items-center justify-between mb-5">
                                        <span className="text-[13px] font-black text-[#53B175] uppercase tracking-widest">
                                            {i === 0 ? 'Standard Bulk' : 'Institutional'}
                                        </span>
                                        <span className="bg-[#53B175] text-white px-3 py-1 rounded-lg text-[10px] font-black tracking-wide">
                                            {slab.minQty}+ {productUnit.toUpperCase()} MIN
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[24px] font-black text-[#181725]">₹ {slab.price}<span className="text-[15px] text-gray-400">/{productUnit}</span></span>
                                            <span className="text-[12px] text-[#53B175] font-bold">{i === 0 ? 'Recommended' : 'Best Value'}</span>
                                        </div>
                                        <button onClick={() => handleAdd(slab.minQty)} className="bg-[#53B175] text-white rounded-full px-7 py-3 flex items-center gap-2 text-[13px] font-black active:scale-95 transition-all shadow-lg shadow-green-200">
                                            <Plus size={16} strokeWidth={3} /> ADD
                                        </button>
                                    </div>
                                </div>
                                ))}
                            </div>
                            )}

                            {/* Desktop Action Summary */}
                            <div className="flex items-center gap-8 pt-2">
                                <div className="flex flex-col min-w-[160px]">
                                    {hasCustomerPrice && (
                                        <span className="text-[11px] font-bold bg-[#EEF8F1] text-[#299E60] px-2 py-0.5 rounded-full uppercase tracking-wide w-fit mb-1">Your price</span>
                                    )}
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[48px] font-black text-[#181725]">₹ {productPrice}</span>
                                        {customerStrikePrice != null && (
                                            <span className="text-[22px] font-semibold text-gray-400 line-through">₹ {customerStrikePrice}</span>
                                        )}
                                        <span className="text-[20px] text-[#7C7C7C] font-bold">/kg</span>
                                    </div>
                                </div>
                                <button onClick={() => handleAdd(1)} className="flex-1 h-[72px] bg-[#53B175] text-white rounded-[28px] flex items-center justify-center gap-4 text-[20px] font-black transition-all active:scale-[0.98] hover:bg-[#489e67] shadow-2xl shadow-green-100">
                                    <span>Add To Cart</span>
                                    <ShoppingCart size={24} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* OOS alternates strip — only when current vendor has 0 stock */}
                    {stockQty === 0 && (
                        <div className="mt-16">
                            <AlternateVendorsStrip productId={apiProduct.id} />
                        </div>
                    )}

                    {/* Information Sections (Desktop/Tab Specific) */}
                    <div className="mt-32 grid grid-cols-12 gap-16 lg:gap-24">
                        <div className="col-span-12 lg:col-span-8 space-y-20">
                            <div>
                                <h3 className="text-[28px] font-black text-[#181725] mb-10 flex items-center gap-4">
                                    <Info size={28} className="text-[#53B175]" />
                                    Product Overview
                                </h3>
                                <p className="text-[18px] text-[#4C4C4C] leading-[1.8] font-medium opacity-90 border-l-[6px] border-[#53B175]/40 pl-10 mb-12 italic bg-[#F1FBF4]/20 py-10 rounded-r-3xl">
                                    {product.description}
                                    {" Certified as commercial-grade produce, ideal for high-volume kitchen operations. Our sourcing methodology guarantees uniform size metrics and consistent density across every delivery batch."}
                                </p>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 mt-10">
                                    <div className="bg-white rounded-[32px] p-10 border border-gray-100 shadow-sm">
                                        <h4 className="text-[18px] font-black text-[#181725] mb-8 border-b border-gray-50 pb-5 uppercase tracking-wide">Technical Specs</h4>
                                        <div className="space-y-4">
                                            {[
                                                { l: 'Origin', v: 'Verified Local Farms' },
                                                { l: 'Grade', v: 'Procurement Choice' },
                                                { l: 'Storage', v: 'Cool & Dry Profile' },
                                                { l: 'Standard', v: 'Horeca Certified' }
                                            ].map((s, i) => (
                                                <div key={i} className="flex justify-between items-center py-1">
                                                    <span className="text-[13px] font-bold text-gray-400 mb-0.5 uppercase tracking-wider">{s.l}</span>
                                                    <span className="text-[15px] font-black text-[#181725]">{s.v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-[#F8F9FB] rounded-[32px] p-10">
                                        <h4 className="text-[18px] font-black text-[#181725] mb-6 uppercase tracking-wide">Commercial Advice</h4>
                                        <p className="text-[15px] text-gray-500 leading-relaxed font-semibold">
                                            Optimized for recipe standardization. Minimal waste percentage ensured through 12-point grading check at our fulfillment center.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="col-span-12 lg:col-span-4 flex flex-col gap-10">
                            <h3 className="text-[22px] font-black text-[#181725] mb-2">Quality Trust</h3>
                            {[
                                { t: 'Farm-Direct Network', d: 'Eliminating middle-men for freshness.', i: Leaf, c: 'bg-emerald-50 text-emerald-600' },
                                { t: 'Batch Verification', d: 'Verified by certified specialists.', i: ShieldCheck, c: 'bg-blue-50 text-blue-600' },
                                { t: 'Commercial Sourcing', d: 'Uniform metrics for professionals.', i: Store, c: 'bg-orange-50 text-orange-600' }
                            ].map((p, i) => {
                                const Icon = p.i;
                                return (
                                    <div key={i} className="flex gap-6 p-2 group transition-all">
                                        <div className={cn("w-16 h-16 rounded-3xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500 shadow-sm", p.c)}>
                                            <Icon size={28} />
                                        </div>
                                        <div className="flex flex-col pt-1">
                                            <h4 className="text-[17px] font-black text-[#181725] mb-1">{p.t}</h4>
                                            <p className="text-[14px] text-gray-400 font-bold leading-snug">{p.d}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Market Alternatives (Desktop Similar) */}
                    <div className="mt-40 pt-24 border-t border-gray-100">
                        <div className="flex items-end justify-between mb-16 px-2">
                            <div>
                                <h2 className="text-[44px] font-black text-[#181725] tracking-tighter">Market Alternatives</h2>
                                <p className="text-gray-400 font-bold mt-2 text-[17px]">Complete your procurement with these verified alternatives</p>
                            </div>
                            <div className="flex gap-3">
                                <button className="w-14 h-14 rounded-full border border-gray-100 flex items-center justify-center hover:bg-[#53B175] hover:text-white transition-all bg-white shadow-sm"><ArrowLeft size={22} /></button>
                                <button className="w-14 h-14 rounded-full border border-gray-100 flex items-center justify-center hover:bg-[#53B175] hover:text-white transition-all bg-white shadow-sm"><ArrowRight size={22} /></button>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-10">
                            {similarItemsList.map((item) => (
                                <Link key={item.id} href={`/product/${item.originalId || item.id}`} className="bg-white border border-gray-100 rounded-[48px] p-7 flex flex-col hover:shadow-[0_30px_70px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-3 transition-all group relative overflow-hidden">
                                    <div className="w-full aspect-square relative mb-8 bg-[#F8F9FB]/50 rounded-[38px] overflow-hidden group-hover:bg-[#F1FBF4]/50 transition-colors duration-500">
                                        <Image src={item.image || '/placeholder.png'} alt={item.name} fill className="object-contain group-hover:scale-110 transition-transform duration-700" sizes="25vw" />
                                    </div>
                                    <h3 className="text-[18px] font-black text-[#181725] leading-tight line-clamp-2 mb-4 group-hover:text-[#53B175] transition-colors">{item.name}</h3>
                                    <div className="mt-auto flex items-center justify-between border-t border-gray-50 pt-6">
                                        <span className="text-[14px] text-[#7C7C7C] font-bold">Sold by {item.vendorCount || 3} vendors</span>
                                        <div className="w-11 h-11 rounded-2xl bg-[#EAF6EF] flex items-center justify-center text-[#53B175] group-hover:bg-[#53B175] group-hover:text-white transition-all shadow-sm">
                                            <Plus size={22} strokeWidth={3} />
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </main>
            </div>

            {/* Global Promotion/Footer Banners */}
            <div className="w-full">
                <PromotionBanners />
                <DeliveryPoster />
            </div>
        </div>
    );
}
