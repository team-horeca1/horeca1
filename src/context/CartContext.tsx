'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import type { VendorProduct, CartItem, VendorCartGroup, BulkPriceTier, VendorPromoSummary } from '@/types';
import { dal } from '@/lib/dal';

// CartItem extended with API item ID (needed for PATCH/DELETE on server cart)
interface CartItemWithId extends CartItem {
    cartItemId?: string;   // DB id from server cart (for PATCH/DELETE)
    basePriceGross: number; // gross price at qty < first bulk tier (never mutated after first add)
                            // used to recalculate tier price live when qty changes in cart
}

interface CartContextType {
    cart: CartItemWithId[];
    groups: VendorCartGroup[];
    addToCart: (product: VendorProduct, quantity?: number) => void;
    removeFromCart: (productId: string) => void;
    updateQuantity: (productId: string, quantity: number) => void;
    clearCart: () => void;
    totalItems: number;
    subtotal: number;       // gross total (GST-inclusive)
    totalTaxable: number;   // taxable value (ex-GST)
    totalGST: number;       // GST portion = subtotal - totalTaxable
    totalAmount: number;
    vendorCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// ---- HELPERS ----

/**
 * Given a base gross price and sorted bulk tier array, find the correct gross
 * unit price for `qty`. Tiers must be gross prices (already × (1 + tax%)).
 *
 * Logic: the highest tier whose minQty ≤ qty wins.
 *   qty=9  → no tier matches → basePrice
 *   qty=10 → tier1 (minQty:10) matches → tier1.price
 *   qty=50 → tier2 (minQty:50) also matches → tier2.price wins (highest match)
 */
function getEffectiveGrossPrice(basePriceGross: number, bulkPrices: BulkPriceTier[], qty: number): number {
    let price = basePriceGross;
    // Iterate ascending — last match wins (highest qualifying tier)
    const sorted = [...(bulkPrices || [])].sort((a, b) => a.minQty - b.minQty);
    for (const tier of sorted) {
        if (qty >= tier.minQty) price = tier.price;
    }
    return price;
}

interface ApiGroupMeta {
    subtotal: number;
    meetsMinOrder: boolean;
    promoSummary?: VendorPromoSummary | null;
}

function buildGroups(cart: CartItemWithId[], apiGroupMeta: Record<string, ApiGroupMeta>): VendorCartGroup[] {
    const grouped: Record<string, VendorCartGroup> = {};
    cart.forEach(item => {
        if (!item.product) return;
        const vId = item.product.vendorId;
        if (!grouped[vId]) {
            const meta = apiGroupMeta[vId];
            grouped[vId] = {
                vendorId: vId,
                vendorName: item.product.vendorName,
                vendorLogo: item.product.vendorLogo,
                items: [],
                subtotal: meta?.subtotal ?? 0,
                subtotalTaxable: 0,
                totalGST: 0,
                minOrderValue: item.product.vendorMinOrderValue || 0,
                meetsMinOrder: meta?.meetsMinOrder ?? false,
                promoSummary: meta?.promoSummary ?? null,
            };
        }
        grouped[vId].items.push(item);

        if (item.isPromoFree) return;

        const gross = (item.product.price || 0) * item.quantity;
        const tax = item.product.taxPercent || 0;
        const taxable = tax > 0 ? gross / (1 + tax / 100) : gross;

        if (!apiGroupMeta[vId]) {
            grouped[vId].subtotal += gross;
            grouped[vId].subtotalTaxable += taxable;
            grouped[vId].totalGST += gross - taxable;
            grouped[vId].meetsMinOrder = grouped[vId].subtotal >= grouped[vId].minOrderValue;
        } else {
            grouped[vId].subtotalTaxable += taxable;
            grouped[vId].totalGST += gross - taxable;
        }
    });

    for (const g of Object.values(grouped)) {
        if (apiGroupMeta[g.vendorId]) {
            const meta = apiGroupMeta[g.vendorId];
            g.subtotal = meta.subtotal;
            g.meetsMinOrder = meta.meetsMinOrder;
            g.promoSummary = meta.promoSummary ?? null;
        }
    }
    return Object.values(grouped);
}

function parseApiCart(apiData: { vendorGroups: unknown[]; total: number }): {
    items: CartItemWithId[];
    groupMeta: Record<string, ApiGroupMeta>;
} {
    const items: CartItemWithId[] = [];
    const groupMeta: Record<string, ApiGroupMeta> = {};

    for (const group of (apiData.vendorGroups || []) as Array<Record<string, unknown>>) {
        const groupVendor = (group.vendor as Record<string, unknown>) || {};
        const vendorId = (groupVendor.id as string) || '';
        if (vendorId) {
            groupMeta[vendorId] = {
                subtotal: Number(group.subtotal) || 0,
                meetsMinOrder: Boolean(group.meetsMov),
                promoSummary: (group.promoSummary as VendorPromoSummary | null | undefined) ?? null,
            };
        }

        for (const raw of ((group.items || []) as Array<Record<string, unknown>>)) {
            const product = raw.product as Record<string, unknown> | null;
            if (!product) continue;

            // Each item also has a vendor relation for logo/name
            const itemVendor = (raw.vendor as Record<string, unknown>) || groupVendor;
            const priceSlabs = (product.priceSlabs as Array<Record<string, unknown>>) || [];
            const inventory = product.inventory as Record<string, unknown> | null;

            // unitPrice from DB is the taxable rate (ex-GST) — matches the active slab
            const unitPrice = Number(raw.unitPrice) || 0;
            const taxableRate = unitPrice > 0 ? unitPrice
                : priceSlabs.length > 0 ? Number(priceSlabs[0].price)
                : Number(product.basePrice) || 0;

            // Compute gross (GST-inclusive) price from taxable rate
            const taxPercent = Number(product.taxPercent) || 0;
            const grossPrice = Math.round(taxableRate * (1 + taxPercent / 100) * 100) / 100;

            // Customer-specific price (price list / per-customer override): the
            // server resolved a unitPrice that is neither the base price nor any
            // slab tier. The resolver OUTRANKS slabs for these, so local tier
            // recomputation must be disabled — otherwise changing quantity would
            // flip the display back to base/slab prices the customer won't pay.
            const baseTaxable = Number(product.basePrice) || 0;
            const matchesSlab = priceSlabs.some(s => Math.abs(Number(s.price) - unitPrice) < 0.005);
            const isCustomerPrice = unitPrice > 0
                && Math.abs(unitPrice - baseTaxable) > 0.005
                && !matchesSlab;

            // MRP: originalPrice from DB is also a taxable rate — compute gross MRP
            const originalTaxableRate = Number(product.originalPrice) || 0;
            const grossMRP = originalTaxableRate > 0
                ? Math.round(originalTaxableRate * (1 + taxPercent / 100) * 100) / 100
                : 0;

            const vp: VendorProduct = {
                id: product.id as string,
                name: (product.name as string) || '',
                description: '',
                price: grossPrice,                 // gross price shown to customer
                originalPrice: grossMRP || grossPrice,
                images: product.imageUrl ? [product.imageUrl as string] : [],
                category: '',
                packSize: (product.packSize as string) || '1 unit',
                unit: (product.unit as string) || 'unit',
                stock: inventory ? Number(inventory.qtyAvailable) || 0 : 0,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                vendorId: (raw.vendorId as string) || (itemVendor.id as string) || '',
                vendorName: (itemVendor.businessName as string) || '',
                vendorLogo: (itemVendor.logoUrl as string) || '',
                // Bulk price slabs: store gross prices for display. Hidden when a
                // customer price applies — the resolver ignores slabs for those.
                bulkPrices: isCustomerPrice ? [] : priceSlabs.map(s => ({
                    minQty: Number(s.minQty),
                    price: Math.round(Number(s.price) * (1 + taxPercent / 100) * 100) / 100,
                })),
                creditBadge: (product.creditEligible as boolean) || false,
                minOrderQuantity: Number(product.minOrderQty) || 1,
                taxPercent,
                taxableRate,
                vendorMinOrderValue: Number((itemVendor.minOrderValue as number) || 0),
                frequentlyOrdered: false,
                isDeal: false,
                customerPriceApplied: isCustomerPrice || undefined,
            };
            // basePriceGross = gross price at qty < first tier (single unit base price).
            // For customer-priced items the resolved gross IS the anchor — local
            // tier math must never recompute from the catalog base price.
            const basePriceGross = isCustomerPrice
                ? grossPrice
                : Math.round(Number(product.basePrice) * (1 + taxPercent / 100) * 100) / 100 || grossPrice;

            items.push({
                productId: vp.id,
                product: vp,
                quantity: Number(raw.quantity) || 1,
                cartItemId: raw.id as string,
                basePriceGross,
                isPromoFree: Boolean(raw.isPromoFree),
                bxgyFreeQty: Number(raw.bxgyFreeQty) || 0,
                bxgyPromotionName: (raw.bxgyPromotionName as string) || undefined,
            });
        }
    }
    return { items, groupMeta };
}

const STORAGE_KEY = 'horeca_cart';

function loadLocalCart(): CartItemWithId[] {
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        return s ? JSON.parse(s) : [];
    } catch { return []; }
}

function saveLocalCart(cart: CartItemWithId[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
    const { data: session, status: sessionStatus } = useSession();
    const isLoggedIn = sessionStatus === 'authenticated';
    const sessionUser = (session?.user ?? {}) as Record<string, unknown>;
    const activeBAId = sessionUser.activeBusinessAccountId as string | undefined;
    const activeOutletId = sessionUser.activeOutletId as string | undefined;
    const [cart, setCart] = useState<CartItemWithId[]>([]);
    const [apiGroupMeta, setApiGroupMeta] = useState<Record<string, ApiGroupMeta>>({});
    const [isInitialized, setIsInitialized] = useState(false);

    const applyApiCart = useCallback((apiData: { vendorGroups: unknown[]; total: number }) => {
        const { items, groupMeta } = parseApiCart(apiData);
        setCart(items);
        setApiGroupMeta(groupMeta);
    }, []);

    // On mount or context switch: load cart (API if logged in, localStorage if guest).
    // On guest→login transition: merge localStorage items into the server cart
    // first, then load — otherwise items added while logged-out vanish.
    useEffect(() => {
        if (sessionStatus === 'loading') return;
        // Block the localStorage-mirror effect below until THIS context finishes
        // loading/merging. Critical on the guest→login transition: signIn briefly
        // flips status to "authenticated" on the login page (before the redirect
        // navigates away), which runs this effect and setCart([]). Without this
        // guard the mirror would persist that empty array over the guest cart in
        // localStorage, and the navigation aborts the merge before it can restore
        // it — so the guest cart (and the items the user came to buy) vanish.
        setIsInitialized(false);
        setCart([]); // Clear immediately on account/outlet/session change so UI doesn't flicker old data
        if (isLoggedIn) {
            const guestItems = loadLocalCart();
            const mergePayload = guestItems
                .map(it => ({
                    productId: it.productId,
                    vendorId: (it.product as { vendorId?: string })?.vendorId ?? '',
                    quantity: it.quantity,
                }))
                .filter(p => p.productId && p.vendorId && p.quantity > 0);

            const mergeFirst = mergePayload.length > 0
                ? fetch('/api/v1/cart/merge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: mergePayload }),
                  })
                    .then(() => { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } })
                    .catch(() => { /* server merge failed — keep localStorage so we can retry on next login */ })
                : Promise.resolve();

            mergeFirst
                .then(() => dal.cart.get())
                .then(apiData => {
                    applyApiCart(apiData as { vendorGroups: unknown[]; total: number });
                })
                .catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : '';
                    const noDelivery =
                        isLoggedIn &&
                        (msg.toLowerCase().includes('delivery address') ||
                            msg.toLowerCase().includes('no active outlet'));
                    if (noDelivery) {
                        setCart([]);
                        return;
                    }
                    setCart(loadLocalCart());
                })
                .finally(() => setIsInitialized(true));
        } else {
            setCart(loadLocalCart());
            setIsInitialized(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionStatus, activeBAId, activeOutletId]);

    // Persist to localStorage for both guest and logged-in users so guest session preserves it on logout
    useEffect(() => {
        if (!isInitialized) return;
        saveLocalCart(cart);
    }, [cart, isInitialized]);

    const addToCart = useCallback((product: VendorProduct, quantity: number = 1) => {
        // product.price = base gross price (below any bulk tier)
        // Compute the correct tier price for the quantity being added
        const basePriceGross = product.price;
        const effectiveGross = getEffectiveGrossPrice(basePriceGross, product.bulkPrices || [], quantity);
        const tax = product.taxPercent || 0;
        const effectiveTaxableRate = tax > 0 ? effectiveGross / (1 + tax / 100) : effectiveGross;
        const productWithEffectivePrice: VendorProduct = { ...product, price: effectiveGross, taxableRate: effectiveTaxableRate };

        if (isLoggedIn) {
            dal.cart.addItem(product.id, product.vendorId, quantity)
                .then(async () => {
                    // Refresh cart from API to get cartItemId and server-computed prices
                    const apiData = await dal.cart.get();
                    applyApiCart(apiData as { vendorGroups: unknown[]; total: number });
                })
                .catch(() => {
                    // Optimistic update on API failure — use locally-computed effective price
                    setCart(prev => {
                        const existing = prev.find(i => i.productId === product.id);
                        if (existing) {
                            const newQty = existing.quantity + quantity;
                            const newGross = getEffectiveGrossPrice(existing.basePriceGross, existing.product.bulkPrices || [], newQty);
                            const newTaxable = tax > 0 ? newGross / (1 + tax / 100) : newGross;
                            return prev.map(i => i.productId === product.id
                                ? { ...i, quantity: newQty, product: { ...i.product, price: newGross, taxableRate: newTaxable } }
                                : i);
                        }
                        return [...prev, { productId: product.id, product: productWithEffectivePrice, quantity, basePriceGross }];
                    });
                });
        } else {
            setCart(prev => {
                const existing = prev.find(i => i.productId === product.id);
                if (existing) {
                    const newQty = existing.quantity + quantity;
                    const newGross = getEffectiveGrossPrice(existing.basePriceGross, existing.product.bulkPrices || [], newQty);
                    const newTaxable = tax > 0 ? newGross / (1 + tax / 100) : newGross;
                    return prev.map(i => i.productId === product.id
                        ? { ...i, quantity: newQty, product: { ...i.product, price: newGross, taxableRate: newTaxable } }
                        : i);
                }
                return [...prev, { productId: product.id, product: productWithEffectivePrice, quantity, basePriceGross }];
            });
        }
    }, [isLoggedIn]);

    // Side effects (API calls) must run OUTSIDE setCart's updater function —
    // React 19 strict mode invokes the updater twice, which would fire the
    // DELETE/PATCH twice and the second call would 404/P2025.
    const removeFromCart = useCallback((productId: string) => {
        const item = cart.find(i => i.productId === productId);
        if (isLoggedIn && item?.cartItemId) {
            dal.cart.removeItem(item.cartItemId)
                .then(() => dal.cart.get())
                .then(apiData => applyApiCart(apiData as { vendorGroups: unknown[]; total: number }))
                .catch(() => {});
        }
        setCart(prev => prev.filter(i => i.productId !== productId));
    }, [isLoggedIn, cart, applyApiCart]);

    const updateQuantity = useCallback((productId: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(productId);
            return;
        }

        const item = cart.find(i => i.productId === productId);
        if (!item || item.isPromoFree) return;

        // Enforce minOrderQuantity — silently block; UI must show the toast
        const minQty = item.product?.minOrderQuantity || 1;
        if (quantity < minQty) return;

        // Sync with server cart (server also recalculates slab price).
        // For customer-priced items the server is the only price authority
        // (scheme prices change with quantity) — refresh after the PATCH so
        // the UI always shows exactly what checkout will charge.
        if (isLoggedIn && item.cartItemId) {
            const patch = dal.cart.updateItem(item.cartItemId, quantity);
            patch
                .then(() => dal.cart.get())
                .then(apiData => applyApiCart(apiData as { vendorGroups: unknown[]; total: number }))
                .catch(() => {});
        }

        setCart(prev => prev.map(i => {
            if (i.productId !== productId) return i;
            // ── LIVE TIER PRICE RECALCULATION ──────────────────────────────
            // Use the immutable basePriceGross (set at first add) to find the
            // correct tier price for the new quantity.
            //
            //   qty=9  → below tier1 (minQty:10) → basePriceGross (₹100)
            //   qty=10 → tier1 matches            → tier1.price    (₹90)
            //   qty=50 → tier2 also matches        → tier2.price    (₹80)
            const basePriceGross = i.basePriceGross || i.product?.price || 0;
            const newGrossPrice = getEffectiveGrossPrice(basePriceGross, i.product?.bulkPrices || [], quantity);
            const tax = i.product?.taxPercent || 0;
            const newTaxableRate = tax > 0 ? newGrossPrice / (1 + tax / 100) : newGrossPrice;
            return {
                ...i,
                quantity,
                product: { ...i.product, price: newGrossPrice, taxableRate: newTaxableRate },
            };
        }));
    }, [isLoggedIn, cart, removeFromCart, applyApiCart]);

    const clearCart = useCallback(() => {
        if (isLoggedIn) {
            dal.cart.clear().catch(() => {});
        }
        setCart([]);
        setApiGroupMeta({});
    }, [isLoggedIn]);

    const groups = useMemo(() => buildGroups(cart, apiGroupMeta), [cart, apiGroupMeta]);
    const totalItems = useMemo(() => cart.reduce((sum, i) => sum + (i.quantity || 0), 0), [cart]);

    const subtotal = useMemo(() => {
        if (Object.keys(apiGroupMeta).length > 0) {
            return Object.values(apiGroupMeta).reduce((s, m) => s + m.subtotal, 0);
        }
        return cart.reduce((sum, i) => {
            if (i.isPromoFree) return sum;
            return sum + ((i.product?.price || 0) * i.quantity);
        }, 0);
    }, [cart, apiGroupMeta]);

    const totalTaxable = useMemo(() => cart.reduce((sum, i) => {
        if (i.isPromoFree) return sum;
        const tax = i.product?.taxPercent || 0;
        const gross = (i.product?.price || 0) * i.quantity;
        return sum + (tax > 0 ? gross / (1 + tax / 100) : gross);
    }, 0), [cart]);

    // totalGST = GST portion extracted from inclusive gross price
    const totalGST = useMemo(() => subtotal - totalTaxable, [subtotal, totalTaxable]);

    const totalAmount = subtotal;
    const vendorCount = groups.length;

    const value = useMemo(() => ({
        cart,
        groups,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        subtotal,
        totalTaxable,
        totalGST,
        totalAmount,
        vendorCount,
    }), [cart, groups, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, subtotal, totalTaxable, totalGST, totalAmount, vendorCount]);

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
