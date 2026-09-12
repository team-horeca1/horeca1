'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, Share2, ShoppingCart, Plus, Minus, Navigation, X, Loader2, Package, Trash2, ChevronDown, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { shareCard } from '@/lib/share-cards/shareClient';
import { useSession } from 'next-auth/react';
import { cn, formatPackSize } from '@/lib/utils';
import type { VendorProduct } from '@/types';
import { useCart } from '@/context/CartContext';

interface VendorProductCardProps {
    product: VendorProduct;
    /** Visual layout — `'grid'` is the default 2-up tile, `'list'` is a wide 1-up row. */
    variant?: 'grid' | 'list';
    distributorName?: string;
    distributorCount?: number;
    onDistributorClick?: (e: React.MouseEvent) => void;
    /** Override stock badge for brand-store browse mode (area / no distributor). */
    availabilityLabel?: 'out' | 'area' | 'none';
    /** Keep card visually in-stock when browsing catalog (e.g. wrong pincode). */
    forceInStockDisplay?: boolean;
}

export const VendorProductCard = React.memo(function VendorProductCard({ 
    product, 
    variant = 'grid',
    distributorName,
    distributorCount,
    onDistributorClick,
    availabilityLabel,
    forceInStockDisplay = false,
}: VendorProductCardProps) {
    const { addToCart, groups, updateQuantity, adjustQuantity, removeFromCart, purchaseAccess } = useCart();
    const { status: sessionStatus } = useSession();

    // ── Bulk pricing bottom-sheet state (opened from the mobile grid card's "Bulk ▾" chip) ──
    const [showBulkSheet, setShowBulkSheet] = useState(false);
    const [bulkCelebrate, setBulkCelebrate] = useState(false);
    const bulkCelebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flashBulkAdded = () => {
        setBulkCelebrate(true);
        if (bulkCelebrateTimer.current) clearTimeout(bulkCelebrateTimer.current);
        bulkCelebrateTimer.current = setTimeout(() => {
            setBulkCelebrate(false);
            bulkCelebrateTimer.current = null;
        }, 1800);
    };

    useEffect(() => () => {
        if (bulkCelebrateTimer.current) clearTimeout(bulkCelebrateTimer.current);
    }, []);

    // ── Desktop grid card inline bulk-tier stepper state ──
    const [openStepperIdx, setOpenStepperIdx] = useState<number | null>(null);
    const [stepperQty, setStepperQty] = useState(0);

    // ── OOS Alternate Vendors state ──
    const [showAlternates, setShowAlternates] = useState(false);
    const [alternateVendors, setAlternateVendors] = useState<Array<{
        id: string;
        name: string;
        vendor: { id: string; businessName: string; logoUrl?: string | null };
        inventory?: { qtyAvailable: number };
        imageUrl?: string | null;
        images?: string[];
        packSize?: string | null;
        unit?: string | null;
        basePrice?: number;
    }>>([]);
    const [alternatesLoading, setAlternatesLoading] = useState(false);

    const fetchAlternates = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowAlternates(true);
        setAlternatesLoading(true);
        try {
            const res = await fetch(`/api/v1/products/${product.id}/alternates`);
            const json = await res.json();
            const alternates = json?.data?.alternates || [];
            setAlternateVendors(alternates.map((a: Record<string, unknown>) => ({
                id: a.id as string,
                name: a.name as string,
                vendor: a.vendor as { id: string; businessName: string; logoUrl?: string | null },
                inventory: a.inventory as { qtyAvailable: number } | undefined,
                imageUrl: (a.imageUrl as string | null | undefined) ?? null,
                images: a.images as string[] | undefined,
                packSize: (a.packSize as string | null | undefined) ?? null,
                unit: (a.unit as string | null | undefined) ?? null,
                basePrice: a.basePrice != null ? Number(a.basePrice) : undefined,
            })));
        } catch {
            setAlternateVendors([]);
        } finally {
            setAlternatesLoading(false);
        }
    };

    const vendorGroup = groups.find(g => g.vendorId === product.vendorId);
    const cartItem = vendorGroup?.items.find(i => i.productId === product.id);
    const currentQty = cartItem?.quantity || 0;

    const handleAdd = (e: React.MouseEvent, qty: number = 1) => {
        e.preventDefault();
        e.stopPropagation();

        if (!purchaseAccess.allowed) {
            toast.error(purchaseAccess.message);
            return;
        }

        const minQty = product.minOrderQuantity || 1;
        const maxStock = typeof product.stock === 'number' && product.stock > 0 ? product.stock : undefined;

        if (currentQty > 0) {
            const next = currentQty + qty;
            if (maxStock != null && next > maxStock) {
                if (currentQty >= maxStock) {
                    toast.error(`Only ${maxStock} units available`);
                    return;
                }
                updateQuantity(product.id, maxStock);
                toast.success(`${product.name} — quantity set to ${maxStock} ${product.packSize || ''}`, { duration: 2000 });
                return;
            }
            adjustQuantity(product.id, qty);
        } else {
            // First add: respect minimum order quantity
            let firstAddQty = Math.max(qty, minQty);
            if (maxStock != null) firstAddQty = Math.min(firstAddQty, maxStock);
            if (firstAddQty <= 0) {
                toast.error('Out of stock');
                return;
            }
            const added = addToCart(product, firstAddQty);
            if (!added) return;
            qty = firstAddQty;
        }

        toast.success(`${product.name} added to cart!`, {
            description: product.storePromotion?.type === 'bxgy' || product.storePromotion?.type === 'bxgy_get'
                ? `${product.storePromotion.badgeLabel} — you'll get free item(s) in your cart`
                : `Quantity: ${currentQty + qty} ${product.packSize || ''}`,
            duration: 2500,
        });
    };

    // ── Bulk-tier pill tap: move the cart quantity TO the tapped tier.
    //    • Tapping a tier you're not in jumps the quantity to that tier's
    //      minimum — up OR down (so tapping a lower tier reduces it).
    //    • Tapping the tier you're already in buys another batch of it
    //      (e.g. 50 → tap 50+ → 100), so you keep climbing within a tier.
    //    The stepper +/- buttons still nudge by 1 via handleAdd / handleDecrement. ──
    const handleTierSelect = (e: React.MouseEvent, tierMinQty: number) => {
        e.preventDefault();
        e.stopPropagation();

        const minQty = product.minOrderQuantity || 1;
        const maxStock = typeof product.stock === 'number' && product.stock > 0 ? product.stock : undefined;

        if (currentQty === 0) {
            let target = Math.max(tierMinQty, minQty);
            if (maxStock != null) target = Math.min(target, maxStock);
            if (target <= 0) {
                toast.error('Out of stock');
                return;
            }
            addToCart(product, target);
            toast.success(`${product.name} — quantity set to ${target} ${product.packSize || ''}`, { duration: 2000 });
            flashBulkAdded();
            return;
        }

        // Highest tier whose minimum the cart already meets = the tier we're "in".
        const tiers = (product.bulkPrices ?? []).slice(0, 3);
        const activeMin = tiers.reduce((max, t) => (currentQty >= t.minQty && t.minQty > max ? t.minQty : max), -1);

        let target = tierMinQty === activeMin
            ? currentQty + tierMinQty      // re-tapping the current tier adds another batch
            : Math.max(tierMinQty, minQty); // a different tier — jump straight to it (up or down)

        if (maxStock != null) target = Math.min(target, maxStock);

        if (target === currentQty) {
            if (maxStock != null && currentQty >= maxStock) {
                toast.error(`Only ${maxStock} units available`);
            }
            return;
        }
        updateQuantity(product.id, target);
        toast.success(`${product.name} — quantity set to ${target} ${product.packSize || ''}`, { duration: 2000 });
        if (target > currentQty) flashBulkAdded();
    };

    const handleDecrement = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const minQty = product.minOrderQuantity || 1;
        if (currentQty <= minQty) {
            removeFromCart(product.id);
        } else {
            adjustQuantity(product.id, -1);
        }
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        removeFromCart(product.id);
    };

    const handleQtyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const raw = e.target.value.replace(/[^0-9]/g, '');
        if (raw === '') return;
        let parsed = parseInt(raw, 10);
        const maxStock = typeof product.stock === 'number' && product.stock > 0 ? product.stock : undefined;
        if (maxStock != null && parsed > maxStock) {
            parsed = maxStock;
            toast.error(`Only ${maxStock} units available`);
        }
        if (parsed === 0) {
            removeFromCart(product.id);
        } else {
            updateQuantity(product.id, parsed);
        }
    };

    const bulkTiers = (product.bulkPrices ?? []).slice(0, 3);
    const activeTierIdx = currentQty > 0
        ? bulkTiers
            .map((t, idx) => ({ ...t, originalIdx: idx }))
            .sort((a, b) => b.minQty - a.minQty)
            .find(t => currentQty >= t.minQty)
            ?.originalIdx
        : null;

    const isOutOfStock = forceInStockDisplay || availabilityLabel === 'area'
        ? false
        : (product.stock === 0 || product.isActive === false || availabilityLabel === 'none');

    // Spec list card: at most 2 slabs, starting from the first discounted tier.
    const savingsSlabs = bulkTiers.filter((t) => t.price < product.price).slice(0, 2);
    const nextSavingsSlab = savingsSlabs.find((t) => currentQty < t.minQty);
    const bestSavingsSlab = savingsSlabs[savingsSlabs.length - 1];
    const onBestPrice = !!bestSavingsSlab && currentQty >= bestSavingsSlab.minQty;
    const remainingToNext = nextSavingsSlab ? nextSavingsSlab.minQty - currentQty : 0;
    const currentSavingsSlab = [...savingsSlabs].reverse().find((t) => currentQty >= t.minQty);
    const savingPerPc = currentSavingsSlab ? product.price - currentSavingsSlab.price : 0;
    const hasRealMrp = product.customerPriceApplied === true
        && product.originalPrice != null
        && product.originalPrice > product.price;
    const mrpSaveAmount = hasRealMrp ? product.originalPrice! - product.price : 0;
    const mrpSavePct = hasRealMrp ? Math.round((mrpSaveAmount / product.originalPrice!) * 100) : 0;
    const listBadge = availabilityLabel === 'area'
        ? { label: 'Not in your area', className: 'bg-amber-500' }
        : availabilityLabel === 'none'
            ? { label: 'No distributor', className: 'bg-gray-600' }
            : isOutOfStock
                ? { label: 'Out of stock', className: 'bg-gray-800' }
                : product.storePromotion
                    ? { label: product.storePromotion.badgeLabel, className: 'bg-primary' }
                    : product.isDeal
                        ? { label: 'Deal', className: 'bg-primary' }
                        : product.creditBadge
                            ? { label: 'Credit', className: 'bg-primary' }
                            : product.customerPriceApplied
                                ? { label: 'Your price', className: 'bg-primary' }
                                : null;

    // ── Renders a single bulk-tier pill (used by the desktop grid card).
    //    Directly adds the tier's minimum quantity to the cart on click. ──
    const renderTier = (tier: { price: number; minQty: number }, i: number) => {
        // Find if this specific tier is currently active based on currentQty
        const isActive = !isOutOfStock && currentQty > 0 && (
            // It is the active tier if currentQty is within this tier's range:
            // currentQty >= tier.minQty AND (it is the last tier OR currentQty < next tier's minQty)
            currentQty >= tier.minQty && (i === bulkTiers.length - 1 || currentQty < bulkTiers[i + 1].minQty)
        );

        return (
            <div key={i} className={cn(
                "rounded-xl border px-2.5 py-1.5 flex items-center gap-1.5 transition-all duration-300 h-[40px] justify-between",
                isOutOfStock
                    ? "bg-gray-50 border-gray-100 text-gray-300"
                    : isActive
                        ? "bg-primary-light border-primary text-primary shadow-sm font-black"
                        : "bg-primary-light/70 border-primary/20 hover:border-primary/40 text-primary"
            )}>
                <span className="text-[13px] tracking-tight whitespace-nowrap flex-1 min-w-0">
                    ₹{tier.price} <span className="opacity-70 text-[11px] font-medium">({tier.minQty}+ pcs)</span>
                </span>
                {!isOutOfStock && (
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleTierSelect(e, tier.minQty);
                        }}
                        className={cn(
                            "text-[11px] font-bold transition-colors shrink-0",
                            isActive ? "text-primary hover:text-primary-dark underline underline-offset-2" : "text-primary hover:text-primary-dark"
                        )}
                    >
                        {isActive ? 'Added' : '+ Add'}
                    </button>
                )}
            </div>
        );
    };

    // ── Renders the OOS / first-add CTA / qty-stepper triplet (shared by both variants).
    //    `compact = true` is used wherever horizontal space is at a premium (mobile grid card
    //    at ~120px wide, mobile list-card image column at ~104px). It drops the icon, shortens
    //    the label to "ADD", shrinks the stepper, and folds the separate remove button into the
    //    trash that already appears when qty === 1. ──
    const renderPrimaryCTA = (compact = false, showRemoveButton = false) => {
        if (isOutOfStock) {
            return (
                <button
                    onClick={fetchAlternates}
                    className={cn(
                        "w-full rounded-xl font-bold flex items-center justify-center gap-1 transition-all duration-300 active:scale-[0.98] border bg-white text-primary border-primary hover:bg-[#f7fbf8] cursor-pointer",
                        compact ? "text-[10px] py-2 px-1.5" : "text-[11px] py-2.5 px-2"
                    )}
                >
                    {compact ? 'Find store' : <>Find at another store <Navigation size={12} strokeWidth={2.5} className="shrink-0" /></>}
                </button>
            );
        }
        if (currentQty === 0) {
            return (
                <button
                    onClick={(e) => handleAdd(e, 1)}
                    className={cn(
                        "w-full rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all duration-300 active:scale-[0.98] border bg-primary text-white border-primary hover:bg-primary-dark shadow-[0_6px_18px_-6px_rgba(107,29,46,0.45)] hover:shadow-[0_10px_24px_-6px_rgba(107,29,46,0.55)]",
                        compact ? "text-[12px] py-2" : "text-[13px] py-3 rounded-2xl"
                    )}
                >
                    {compact ? <><Plus size={14} strokeWidth={3} /> ADD</> : <><ShoppingCart size={15} strokeWidth={2.5} className="shrink-0" /> ADD TO CART</>}
                </button>
            );
        }
        // Qty stepper — compact variant has no separate remove pill (trash icon inside the stepper
        // covers that affordance when qty === 1, which matches the grid-card / list-card spaces).
        return (
            <div className={cn("w-full flex items-stretch gap-2", compact ? "h-9" : "h-[44px]")}>
                <div className={cn(
                    "flex-1 bg-primary flex items-stretch overflow-hidden shadow-[0_6px_18px_-6px_rgba(107,29,46,0.35)]",
                    compact ? "rounded-xl" : "rounded-2xl"
                )}>
                    <button
                        onClick={handleDecrement}
                        aria-label={currentQty === 1 ? 'Remove from cart' : 'Decrease quantity'}
                        className={cn(
                            "flex items-center justify-center text-white hover:bg-primary-dark active:scale-95 transition-all shrink-0",
                            compact ? "w-8" : "w-12"
                        )}
                    >
                        {currentQty === 1
                            ? <Trash2 size={compact ? 13 : 16} strokeWidth={2.5} />
                            : <Minus size={compact ? 14 : 18} strokeWidth={3} />}
                    </button>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={currentQty}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); (e.target as HTMLInputElement).select(); }}
                        onChange={handleQtyInput}
                        onKeyDown={(e) => e.stopPropagation()}
                        className={cn(
                            "flex-1 min-w-0 bg-white text-center font-extrabold text-[#181725] tabular-nums focus:outline-none focus:bg-[#f7fbf8] transition-colors",
                            compact ? "text-[13px] my-[2px]" : "text-[15px] my-[3px]"
                        )}
                    />
                    <button
                        onClick={(e) => handleAdd(e, 1)}
                        aria-label="Increase quantity"
                        className={cn(
                            "flex items-center justify-center text-white hover:bg-primary-dark active:scale-95 transition-all shrink-0",
                            compact ? "w-8" : "w-12"
                        )}
                    >
                        <Plus size={compact ? 14 : 18} strokeWidth={3} />
                    </button>
                </div>
                {(!compact || showRemoveButton) && (
                    <button
                        onClick={handleRemove}
                        aria-label="Remove from cart"
                        className={cn(
                            "border border-red-100 bg-[#FFF0F0] text-[#F44336] hover:text-[#D32F2F] hover:bg-[#FFE4E4] active:scale-95 transition-all shrink-0 flex items-center justify-center",
                            compact ? "w-9 h-9 rounded-xl" : "w-11 h-[44px] rounded-2xl"
                        )}
                    >
                        <X size={16} strokeWidth={2.5} />
                    </button>
                )}
            </div>
        );
    };

    // ── Hyperpure-style floating ADD control overlaid on the image corner.
    //    Compact "+" when nothing in cart; small stepper pill when qty > 0.
    //    Used by the grid variant to keep cards short — no giant bottom button. ──
    const renderFloatingCTA = () => {
        if (isOutOfStock) return null; // OOS uses the bottom "Find store" CTA instead
        if (currentQty === 0) {
            return (
                <button
                    onClick={(e) => handleAdd(e, 1)}
                    aria-label="Add to cart"
                    className="absolute top-2 right-2 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border-2 border-primary text-primary flex items-center justify-center shadow-[0_4px_12px_rgba(107,29,46,0.25)] hover:bg-primary hover:text-white active:scale-90 transition-all"
                >
                    <Plus size={16} strokeWidth={3} />
                </button>
            );
        }
        return (
            <div className="absolute top-2 right-2 z-20 flex items-stretch h-8 sm:h-9 bg-primary rounded-full shadow-[0_4px_14px_rgba(107,29,46,0.35)] overflow-hidden">
                <button
                    onClick={handleDecrement}
                    aria-label={currentQty === 1 ? 'Remove from cart' : 'Decrease quantity'}
                    className="w-7 sm:w-8 flex items-center justify-center text-white hover:bg-primary-dark active:scale-95 transition-colors"
                >
                    {currentQty === 1 ? <Trash2 size={12} strokeWidth={2.5} /> : <Minus size={13} strokeWidth={3} />}
                </button>
                <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={currentQty}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); (e.target as HTMLInputElement).select(); }}
                    onChange={handleQtyInput}
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-label="Quantity"
                    className="bg-transparent text-white text-[12px] sm:text-[13px] font-extrabold w-7 sm:w-8 text-center tabular-nums focus:outline-none focus:bg-white/10 placeholder:text-white/60"
                />
                <button
                    onClick={(e) => handleAdd(e, 1)}
                    aria-label="Increase quantity"
                    className="w-7 sm:w-8 flex items-center justify-center text-white hover:bg-primary-dark active:scale-95 transition-colors"
                >
                    <Plus size={13} strokeWidth={3} />
                </button>
            </div>
        );
    };

    // ── Image badges (Deal / Top / Out / Credit) shared by both variants. ──
    const imageBadges = (
        <>
            <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
                {availabilityLabel === 'area' ? (
                    <span className="bg-amber-500 text-white text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide leading-tight max-w-[110px] text-center">
                        Not in your area
                    </span>
                ) : availabilityLabel === 'none' ? (
                    <span className="bg-gray-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                        No distributor
                    </span>
                ) : isOutOfStock ? (
                    <span className="bg-gray-800 text-white text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded-full tracking-wide leading-tight max-w-[110px] text-center">
                        Out of stock
                    </span>
                ) : (
                    <>
                        {product.customerPriceApplied ? (
                            <span className="bg-primary text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md shadow-primary/20 tracking-wide">
                                Your price
                            </span>
                        ) : product.storePromotion ? (
                            <span className={cn(
                                'text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md tracking-wide max-w-[120px] truncate',
                                product.storePromotion.type === 'bxgy' || product.storePromotion.type === 'bxgy_get'
                                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] shadow-purple-500/20'
                                    : 'bg-gradient-to-r from-[#FF4D4D] to-[#FF6B6B] shadow-red-500/20',
                            )}>
                                {product.storePromotion.badgeLabel}
                            </span>
                        ) : product.isDeal && (
                            <span className="bg-gradient-to-r from-[#FF4D4D] to-[#FF6B6B] text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md shadow-red-500/20 tracking-wide">
                                Deal
                            </span>
                        )}
                        {product.frequentlyOrdered && (
                            <span className="bg-gradient-to-r from-[#FBC02D] to-[#FFD54F] text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md shadow-yellow-500/20 tracking-wide">
                                Top
                            </span>
                        )}
                    </>
                )}
            </div>
            {product.creditBadge && !isOutOfStock && (
                <div className="absolute bottom-1.5 left-1.5 sm:bottom-2.5 sm:left-2.5 flex items-center gap-0.5 sm:gap-1 bg-white/90 backdrop-blur-md text-[#7B1FA2] px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full border border-purple-100 shadow-sm">
                    <CreditCard size={9} className="sm:!w-3 sm:!h-3" strokeWidth={2.5} />
                    <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wide leading-none">Credit</span>
                </div>
            )}
        </>
    );

    const handleShare = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const shareUrl = `${window.location.origin}/product/${product.id}`;
        const result = await shareCard({
            title: product.displayName ?? product.name,
            text: `Check out ${product.displayName ?? product.name} from ${product.vendorName} on Horeca1`,
            url: shareUrl,
            imageUrl: `/api/og/product/${product.id}?format=square`,
        });
        if (result === 'copied') {
            toast.success('Link copied to clipboard!', { description: 'You can now share it with others.' });
        }
    };

    const shareButton = (
        <button
            type="button"
            className="p-2 rounded-full backdrop-blur-md bg-white/80 border border-white/60 shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:bg-primary/10 hover:text-primary transition-all"
            onClick={handleShare}
            aria-label="Share product"
        >
            <Share2 size={14} className="text-gray-500" strokeWidth={2} />
        </button>
    );

    const onCardClick = (e: React.MouseEvent) => {
        if (isOutOfStock) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    return (<>
        {variant === 'list' ? (
            <div
                className={cn(
                    "w-full bg-white rounded-xl border-[0.5px] border-primary overflow-hidden relative",
                    isOutOfStock ? "opacity-75" : ""
                )}
            >
                <div className="relative h-[168px] bg-ivory">
                    <Image
                        src={product.images[0] || '/images/recom-product/product-img10.png'}
                        alt={product.name}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        className={cn("object-contain p-4", isOutOfStock ? "grayscale" : "")}
                    />
                    {listBadge && (
                        <span className={cn(
                            "absolute top-2.5 left-2.5 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide",
                            listBadge.className
                        )}>
                            {listBadge.label}
                        </span>
                    )}
                    <div className="absolute top-2 right-2 z-20">
                        <button
                            type="button"
                            aria-label="Share product"
                            className="size-8 rounded-full bg-white border border-divider flex items-center justify-center"
                            onClick={handleShare}
                        >
                            <Share2 size={14} className="text-text-muted" strokeWidth={2} />
                        </button>
                    </div>
                </div>

                <div className="p-3">
                    {product.brandSlug && product.brandName ? (
                        <Link
                            href={`/brand/${product.brandSlug}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] font-medium text-text-muted hover:text-primary hover:underline"
                        >
                            {product.brandName}
                        </Link>
                    ) : distributorName ? (
                        <button
                            type="button"
                            onClick={onDistributorClick}
                            className="text-[11px] font-medium text-text-muted text-left truncate max-w-full"
                        >
                            {distributorName}
                        </button>
                    ) : null}

                    <h3 className={cn(
                        "mt-0.5 text-[15px] font-bold leading-[1.3] line-clamp-2 text-balance min-h-[2.6em]",
                        isOutOfStock ? "text-gray-400" : "text-text"
                    )}>
                        {product.displayName ?? product.name}
                    </h3>
                    <p className="mt-1 text-[12px] text-text-muted">
                        {product.packSize || product.unit || '1 unit'}
                    </p>

                    <div className="mt-3">
                        <div className="flex items-baseline gap-1.5">
                            <span className={cn(
                                "text-[22px] font-extrabold leading-none tabular-nums",
                                isOutOfStock ? "text-gray-300" : "text-primary"
                            )}>
                                ₹{product.price}
                            </span>
                            <span className="text-[12px] text-text-muted">/Pc</span>
                        </div>
                        {hasRealMrp && (
                            <p className="mt-1 text-[11px] text-text-muted">
                                <span className="line-through tabular-nums">MRP ₹{product.originalPrice}</span>
                                <span className="ml-1.5 font-semibold text-success">Save ₹{mrpSaveAmount} ({mrpSavePct}%)</span>
                            </p>
                        )}
                    </div>

                    <div className="mt-3 min-h-[108px] rounded-lg border border-divider bg-ivory/60 p-2">
                        {savingsSlabs.length > 0 && !isOutOfStock ? (
                            <>
                                <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-primary">
                                    {onBestPrice ? 'Best price unlocked' : 'Buy more · save more'}
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {savingsSlabs.map((tier, i) => {
                                        const isBest = i === savingsSlabs.length - 1;
                                        const isActive = currentQty >= tier.minQty
                                            && (i === savingsSlabs.length - 1 || currentQty < savingsSlabs[i + 1].minQty);
                                        const saveAmt = product.price - tier.price;
                                        return (
                                            <button
                                                key={`${tier.minQty}-${tier.price}`}
                                                type="button"
                                                onClick={(e) => handleTierSelect(e, tier.minQty)}
                                                className={cn(
                                                    "rounded-lg border bg-white px-2 py-1.5 text-center transition-colors",
                                                    isActive ? "border-primary" : "border-divider hover:border-primary/40"
                                                )}
                                            >
                                                <span className="block text-[10px] font-semibold text-text-muted whitespace-nowrap">
                                                    {tier.minQty}+ Qty{isBest ? ' · Best' : ''}
                                                </span>
                                                <span className="mt-0.5 block text-[13px] font-extrabold text-primary tabular-nums whitespace-nowrap">
                                                    ₹{tier.price}/Pc
                                                </span>
                                                {saveAmt > 0 && (
                                                    <span className="mt-0.5 block text-[10px] font-semibold text-success whitespace-nowrap">
                                                        Save ₹{saveAmt}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className={cn(
                                    "mt-1.5 min-h-[2.4em] text-center text-[11px] text-pretty",
                                    bulkCelebrate || onBestPrice || savingPerPc > 0
                                        ? "font-semibold text-success"
                                        : "font-medium text-text-secondary"
                                )}>
                                    {bulkCelebrate
                                        ? 'Bulk added to cart'
                                        : onBestPrice
                                            ? 'Smart buy · You unlocked maximum savings'
                                            : savingPerPc > 0
                                                ? `Great choice · You're saving ₹${savingPerPc}/Pc`
                                                : nextSavingsSlab
                                                    ? `Add ${remainingToNext} more to get ₹${nextSavingsSlab.price}/Pc`
                                                    : '\u00a0'}
                                </p>
                            </>
                        ) : (
                            <p className="flex h-full min-h-[92px] items-center justify-center text-[11px] font-medium text-text-muted">
                                {isOutOfStock ? 'Volume pricing unavailable' : 'No extra volume discount on this pack'}
                            </p>
                        )}
                    </div>

                    {product.frequentlyOrdered && (
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-text-secondary">
                            <CheckCircle size={12} className="text-success shrink-0" strokeWidth={2.5} />
                            Frequently ordered
                        </p>
                    )}

                    {distributorCount && distributorCount > 1 && onDistributorClick ? (
                        <button
                            type="button"
                            onClick={onDistributorClick}
                            className="mt-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                            Available from {distributorCount} distributors
                        </button>
                    ) : null}

                    <div className="mt-3">
                        {renderPrimaryCTA(false, true)}
                    </div>
                </div>
            </div>
        ) : (
            // ── GRID VARIANT — two breakpoint-specific layouts under one Link.
            //    Mobile (<sm): Hyperpure compact tile — floating ADD on image, bulk chip below price.
            //    Desktop (sm+): original full-size card — share icon top-right, inline bulk-tier pills,
            //    big "ADD TO CART" pill at the bottom. ──
            <>
                {/* ── MOBILE COMPACT TILE ── */}
                <div
                    className={cn(
                        "sm:hidden bg-white rounded-2xl border border-gray-100 overflow-hidden transition-all duration-300 group p-0 relative flex flex-col h-full",
                        isOutOfStock ? "opacity-75 cursor-default" : "hover:shadow-[0_12px_30px_-12px_rgba(107,29,46,0.18)] hover:-translate-y-0.5 hover:border-primary/30"
                    )}
                >
                    {/* Full-width Image Container */}
                    <div className="relative w-full aspect-square bg-gradient-to-br from-ivory via-white to-cream overflow-hidden">
                        {/* Image wrapper centered in the top area (excluding the bottom 30px bar) */}
                        <div className="absolute top-0 left-0 right-0 bottom-7 flex items-center justify-center p-2">
                            <div className="relative w-full h-full">
                                <Image
                                    src={product.images[0] || '/images/recom-product/product-img10.png'}
                                    alt={product.name}
                                    fill
                                    sizes="(max-width: 640px) 45vw, 320px"
                                    className={cn(
                                        "object-contain transition-transform duration-500 ease-out p-1 group-hover:scale-[1.04]",
                                        isOutOfStock ? "grayscale" : ""
                                    )}
                                />
                            </div>
                        </div>

                        {imageBadges}

                        {/* Bottom Overlay Bar: Dropdown or Pack Size */}
                        {distributorCount && distributorCount > 1 && onDistributorClick ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onDistributorClick(e);
                                }}
                                className="absolute bottom-0 left-0 right-0 h-7 bg-primary-light border-t border-primary/15 text-primary flex items-center justify-center gap-1 hover:bg-[#F0D4DC] transition-colors z-20"
                                aria-label="Show distributors list"
                            >
                                <span className="text-[10px] font-black truncate">
                                    {distributorCount} dist.
                                </span>
                                <ChevronDown size={11} strokeWidth={3} className="shrink-0" />
                            </button>
                        ) : bulkTiers.length > 0 && !isOutOfStock ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowBulkSheet(true);
                                }}
                                className="absolute bottom-0 left-0 right-0 h-7 bg-primary-light border-t border-primary/15 text-primary flex items-center justify-center gap-1 hover:bg-[#F0D4DC] transition-colors z-20"
                                aria-label="Show bulk price tiers"
                            >
                                <span className="text-[10px] font-black truncate">
                                    From ₹{bulkTiers[bulkTiers.length - 1].price}
                                </span>
                                <ChevronDown size={11} strokeWidth={3} className="shrink-0" />
                            </button>
                        ) : (
                            <div className={cn(
                                "absolute bottom-0 left-0 right-0 h-7 border-t flex items-center justify-center z-20",
                                isOutOfStock ? "bg-gray-100 border-gray-200 text-gray-400" : "bg-[#F4F4F4] border-gray-200 text-gray-600"
                            )}>
                                <span className="text-[10px] font-extrabold truncate">
                                    {product.packSize}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Text Details with padding */}
                    <div className="flex flex-col gap-1 p-2 flex-1 justify-between">
                        <div>
                            <h3 className={cn(
                                "text-[12px] font-bold leading-[1.25] line-clamp-2 min-h-[2.5em] text-pretty",
                                isOutOfStock ? "text-gray-400" : "text-[#181725]"
                            )}>
                                {product.displayName ?? product.name}
                            </h3>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                {product.brandSlug && product.brandName && (
                                    <Link
                                        href={`/brand/${product.brandSlug}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="relative z-20 text-[10px] font-semibold text-primary hover:underline shrink-0"
                                    >
                                        by {product.brandName}
                                    </Link>
                                )}
                                {(product.minOrderQuantity || 1) > 1 && (
                                    <span className="text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
                                        Min {product.minOrderQuantity}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="mt-1.5">
                            <div className="flex items-baseline gap-1 flex-wrap mb-1.5">
                                <span className={cn(
                                    "text-[15px] font-extrabold leading-none tabular-nums",
                                    isOutOfStock ? "text-gray-300" : "text-primary"
                                )}>
                                    ₹{product.price}
                                </span>
                                {product.customerPriceApplied && product.originalPrice != null && product.originalPrice > product.price && (
                                    <span className="text-[11px] font-semibold text-gray-400 line-through">₹{product.originalPrice}</span>
                                )}
                                <span className="text-[10px] font-medium text-gray-500">/ unit</span>
                            </div>

                            {/* ADD / Stepper Button at the end of the card */}
                            <div className="relative z-20">
                                {renderPrimaryCTA(true)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── DESKTOP ORIGINAL CARD (restored — share top-right, inline tier pills, bottom ADD) ── */}
                <div
                    className={cn(
                        "hidden sm:flex bg-white rounded-[22px] border border-gray-100 overflow-hidden transition-all duration-500 group p-4 md:p-5 relative flex-col gap-3 h-full",
                        isOutOfStock ? "opacity-75 cursor-default" : "hover:shadow-[0_18px_45px_-12px_rgba(107,29,46,0.18)] hover:-translate-y-1 hover:border-primary/30"
                    )}
                >
                    <div className="absolute top-4 right-4 z-20">{shareButton}</div>

                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-ivory via-white to-cream flex items-center justify-center">
                        <div className="relative w-[85%] h-[85%]">
                            <Image
                                src={product.images[0] || '/images/recom-product/product-img10.png'}
                                alt={product.name}
                                fill
                                sizes="(max-width: 1024px) 33vw, 320px"
                                className={cn(
                                    "object-contain transition-transform duration-500 ease-out p-1 group-hover:scale-[1.04]",
                                    isOutOfStock ? "grayscale" : ""
                                )}
                            />
                        </div>
                        {imageBadges}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <h3 className={cn(
                            "text-[15px] font-bold leading-[1.35] line-clamp-2 h-[2.7em]",
                            isOutOfStock ? "text-gray-400" : "text-[#181725]"
                        )}>
                            {product.displayName ?? product.name}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            {product.brandSlug && product.brandName ? (
                                <Link
                                    href={`/brand/${product.brandSlug}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="relative z-20 text-[11px] font-semibold text-primary hover:underline shrink-0"
                                >
                                    by {product.brandName}
                                </Link>
                            ) : distributorName ? (
                                <span className="text-[11px] text-gray-400 font-bold uppercase tracking-tight truncate">
                                    Via {distributorName}
                                </span>
                            ) : null}
                            <p className="text-[12px] text-gray-500 font-medium truncate">{product.packSize}</p>
                            {distributorCount && distributorCount > 1 && onDistributorClick && (
                                <button
                                    type="button"
                                    onClick={onDistributorClick}
                                    className="text-[11px] font-extrabold text-primary hover:underline ml-auto shrink-0 relative z-20"
                                >
                                    {distributorCount} dist.
                                </button>
                            )}
                            {(product.minOrderQuantity || 1) > 1 && (
                                <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                                    Min {product.minOrderQuantity}
                                </span>
                            )}
                        </div>

                        <div className="flex items-baseline gap-1.5 mt-1">
                            <span className={cn(
                                "text-[22px] md:text-[24px] font-extrabold tracking-tight leading-none tabular-nums",
                                isOutOfStock ? "text-gray-300" : "text-primary"
                            )}>
                                ₹{product.price}
                            </span>
                            {product.customerPriceApplied && product.originalPrice != null && product.originalPrice > product.price && (
                                <span className="text-[13px] font-semibold text-gray-400 line-through">₹{product.originalPrice}</span>
                            )}
                            <span className="text-[12px] font-medium text-gray-500">/ unit</span>
                        </div>
                    </div>

                    {bulkTiers.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-0.5 relative z-20">
                            {bulkTiers.map((tier, i) => renderTier(tier, i))}
                        </div>
                    )}

                    <div className="mt-auto pt-3 flex flex-col gap-3 relative z-20">
                        {renderPrimaryCTA(false)}
                    </div>
                </div>
            </>
        )}

        {/* ── BULK PRICING BOTTOM-SHEET (opens from the grid card's "Bulk ▾" chip) ──
              Slides up from the bottom of the viewport. Each row = one tier with its
              price-per-piece, quantity threshold, and an Add CTA that drops tier.minQty
              into the cart and closes the sheet. ── */}
        {showBulkSheet && (
            // z-[10001] sits above the mobile bottom-nav (z-[9999]) so the sheet and its
            // overlay cover it. The sheet itself has its own scroll + bottom safe area so
            // the last tier doesn't fall under the nav strip on small viewports.
            <div
                className="fixed inset-0 z-[10001] flex items-end justify-center animate-in fade-in duration-200"
                onClick={() => setShowBulkSheet(false)}
            >
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                <div
                    className="relative bg-white rounded-t-[28px] sm:rounded-[28px] sm:mb-auto sm:mt-auto w-full max-w-md z-10 shadow-[0_-12px_40px_rgba(0,0,0,0.18)] sm:shadow-[0_30px_80px_rgba(0,0,0,0.15)] max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Drag handle (mobile only) */}
                    <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
                        <span className="w-10 h-1 rounded-full bg-gray-200" />
                    </div>

                    <div className="px-5 pt-3 pb-4 flex items-start justify-between gap-3 shrink-0">
                        <div className="min-w-0">
                            <h3 className="text-[16px] font-black text-[#181725] line-clamp-2">{product.displayName ?? product.name}</h3>
                            <p className="text-[12px] text-gray-400 font-semibold mt-0.5">Buy more, save more</p>
                        </div>
                        <button
                            onClick={() => setShowBulkSheet(false)}
                            aria-label="Close"
                            className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                        >
                            <X size={16} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* Scrollable tier list. Bottom padding clears the safe-area inset
                        so the last "Add N" row stays tappable on phones with rounded corners. */}
                    <div className="flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),1rem)] flex flex-col gap-2">
                        {bulkTiers.map((tier, i) => {
                            const savings = product.price > tier.price ? Math.round(((product.price - tier.price) / product.price) * 100) : 0;
                            return (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 hover:border-primary/30 hover:bg-primary-light/40 transition-all"
                                >
                                    <div className="relative w-14 h-14 shrink-0">
                                        <div className="absolute inset-0 rounded-xl bg-gray-50 overflow-hidden">
                                            <Image
                                                src={product.images[0] || '/images/recom-product/product-img10.png'}
                                                alt=""
                                                fill
                                                sizes="56px"
                                                className="object-contain p-1"
                                            />
                                        </div>
                                        {savings > 0 && (
                                            <span className="absolute top-0 left-0 z-10 bg-primary text-white text-[9px] font-bold leading-none px-1.5 py-1 rounded-tl-xl rounded-br-md whitespace-nowrap">
                                                {savings}% OFF
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] font-black text-[#181725]">
                                            ₹{tier.price}
                                            <span className="text-[12px] text-gray-400 font-medium ml-1">/ pc</span>
                                        </p>
                                        <p className="text-[11px] font-bold text-gray-500 mt-0.5">For {tier.minQty}+ pcs</p>
                                    </div>
                                    {activeTierIdx === i ? (
                                        <div className="flex items-stretch h-9 bg-primary rounded-xl overflow-hidden shrink-0 w-28 shadow-[0_4px_14px_-4px_rgba(107,29,46,0.5)]">
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleDecrement(e);
                                                }}
                                                className="w-8 flex items-center justify-center text-white hover:bg-primary-dark active:scale-95 transition-all"
                                            >
                                                {currentQty === 1 ? <Trash2 size={12} strokeWidth={2.5} /> : <Minus size={13} strokeWidth={3} />}
                                            </button>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                value={currentQty}
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); (e.target as HTMLInputElement).select(); }}
                                                onChange={handleQtyInput}
                                                onKeyDown={(e) => e.stopPropagation()}
                                                className="w-12 bg-white text-center font-extrabold text-[#181725] text-[12px] focus:outline-none tabular-nums focus:bg-[#f7fbf8] transition-all"
                                            />
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleAdd(e, 1);
                                                }}
                                                className="w-8 flex items-center justify-center text-white hover:bg-primary-dark active:scale-95 transition-all"
                                            >
                                                <Plus size={13} strokeWidth={3} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => handleTierSelect(e, tier.minQty)}
                                            className="px-4 py-2.5 rounded-xl bg-primary text-white text-[12px] font-black shadow-[0_4px_14px_-4px_rgba(107,29,46,0.5)] hover:bg-primary-dark active:scale-95 transition-all shrink-0"
                                        >
                                            Add {tier.minQty}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}

        {/* ── OOS ALTERNATE VENDORS MODAL ── */}
        {showAlternates && (
            <div
                className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
                onClick={() => setShowAlternates(false)}
            >
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
                <div
                    className="relative bg-white rounded-[28px] border border-gray-100 shadow-[0_30px_80px_rgba(0,0,0,0.15)] w-full max-w-md p-6 z-10 max-h-[80vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-[18px] font-black text-[#181725]">Alternate Stores</h3>
                        <button onClick={() => setShowAlternates(false)}
                            className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                            <X size={18} strokeWidth={2.5} />
                        </button>
                    </div>
                    <p className="text-[13px] font-bold text-gray-500 mb-4">
                        &ldquo;{product.name}&rdquo; is available from these stores:
                    </p>
                    {alternatesLoading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 size={24} className="animate-spin text-primary" strokeWidth={3} />
                        </div>
                    ) : alternateVendors.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 font-bold text-[14px]">
                            No alternate stores found at this time.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {alternateVendors.map((alt) => {
                                // Resolve image with fallbacks: explicit images[] → imageUrl singular → vendor logo → none
                                const altImg = alt.images?.[0] || alt.imageUrl || alt.vendor.logoUrl || null;
                                return (
                                    <a key={alt.id} href={`/vendor/${alt.vendor.id}`}
                                        className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 hover:border-primary/30 hover:bg-[#f7fbf8] transition-all group"
                                        onClick={(e) => e.stopPropagation()}>
                                        <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden relative">
                                            {altImg ? (
                                                <Image src={altImg} alt={alt.name} fill sizes="56px" className="object-cover" />
                                            ) : (
                                                <Package size={20} className="text-gray-300" strokeWidth={2} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[14px] font-black text-[#181725] truncate">{alt.name}</p>
                                            <p className="text-[12px] font-bold text-primary truncate">
                                                {alt.vendor.businessName}
                                            </p>
                                            <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-0.5">
                                                {(alt.packSize || alt.unit) && (
                                                    <span className="text-[11px] font-semibold text-gray-500">{formatPackSize(alt.packSize, alt.unit)}</span>
                                                )}
                                                {alt.basePrice != null && (
                                                    <span className="text-[11px] font-bold text-[#181725]">₹{alt.basePrice}</span>
                                                )}
                                                {alt.inventory && (
                                                    <span className={cn(
                                                        'text-[10px] font-bold',
                                                        alt.inventory.qtyAvailable > 0 ? 'text-success' : 'text-red-500'
                                                    )}>
                                                        {alt.inventory.qtyAvailable > 0 ? `${alt.inventory.qtyAvailable} in stock` : 'Out of stock'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Navigation size={16} className="text-gray-300 group-hover:text-primary shrink-0 transition-colors -rotate-45" strokeWidth={2.5} />
                                    </a>
                                );
                            })}
                        </div>
                    )}
                    <button onClick={() => setShowAlternates(false)}
                        className="mt-5 w-full py-3 rounded-2xl bg-gray-50 border border-gray-100 text-gray-500 font-black text-[13px] uppercase tracking-wider hover:bg-gray-100 transition-colors">
                        Close
                    </button>
                </div>
            </div>
        )}
    </>
    );
});
