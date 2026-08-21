'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import type { VendorProduct, CartItem, VendorCartGroup, BulkPriceTier, VendorPromoSummary } from '@/types';
import { dalClient as dal } from '@/lib/dalClient';
import { cartStorageKey, migrateLegacyKey } from '@/lib/userScopedStorage';
import {
    isAdminCustomerImpersonationActive,
    IMPERSONATION_CHANGED_EVENT,
} from '@/lib/clearImpersonation';
import { subscribeAuthTabEvents } from '@/lib/authTabSync';

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
    /** Set absolute quantity (typed input, tier jumps). */
    updateQuantity: (productId: string, quantity: number) => void;
    /** Nudge quantity by delta (+1 / -1). Prefer this for steppers — avoids stale-click races. */
    adjustQuantity: (productId: string, delta: number) => void;
    clearCart: () => void;
    totalItems: number;
    subtotal: number;       // gross total (GST-inclusive)
    totalTaxable: number;   // taxable value (ex-GST)
    totalGST: number;       // GST portion = subtotal - totalTaxable
    totalAmount: number;
    vendorCount: number;
    /** True during a full context-switch load (cart may be empty). False during silent revalidate. */
    isCartLoading: boolean;
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

            // Brand mapping → cart/checkout display overrides. `name` stays the raw
            // supplier name so orders and invoices keep GST traceability.
            const rawName = (product.name as string) || '';
            const brandMappings = (product.brandMappings as Array<Record<string, unknown>>) || [];
            const masterProduct = brandMappings[0]?.brandMasterProduct as Record<string, unknown> | undefined;
            const masterBrand = masterProduct?.brand as Record<string, unknown> | undefined;
            const brandName = (masterBrand?.name as string) || undefined;
            const brandSlug = (masterBrand?.slug as string) || undefined;
            const overrideFields: string[] = [];

            const masterName = typeof masterProduct?.name === 'string' ? masterProduct.name.trim() : '';
            if (masterName) overrideFields.push('name');

            const supplierImages = product.imageUrl ? [product.imageUrl as string] : [];
            const masterImageList = Array.isArray(masterProduct?.images)
                ? (masterProduct.images as string[]).filter((u): u is string => typeof u === 'string' && u.length > 0)
                : [];
            const masterImageUrl = typeof masterProduct?.imageUrl === 'string' ? masterProduct.imageUrl.trim() : '';
            const brandImages = masterImageList.length > 0
                ? masterImageList
                : masterImageUrl
                    ? [masterImageUrl]
                    : [];
            if (brandImages.length > 0) overrideFields.push('images');

            const vp: VendorProduct = {
                id: product.id as string,
                name: rawName,
                displayName: masterName || rawName,
                brandName,
                brandSlug,
                brandOverride: brandName && overrideFields.length > 0
                    ? { brandName, fields: overrideFields }
                    : undefined,
                description: '',
                price: grossPrice,                 // gross price shown to customer
                originalPrice: grossMRP || grossPrice,
                images: brandImages.length > 0 ? brandImages : supplierImages,
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
                schemeFreeQty: Number(raw.schemeFreeQty) || 0,
            });
        }
    }
    return { items, groupMeta };
}

function loadLocalCart(
    userId?: string | null,
    businessAccountId?: string | null,
    outletId?: string | null,
): CartItemWithId[] {
    try {
        migrateLegacyKey('horeca_cart', cartStorageKey(null));
        const s = localStorage.getItem(cartStorageKey(userId, businessAccountId, outletId));
        return s ? JSON.parse(s) : [];
    } catch { return []; }
}

function saveLocalCart(
    cart: CartItemWithId[],
    userId?: string | null,
    businessAccountId?: string | null,
    outletId?: string | null,
) {
    try {
        localStorage.setItem(cartStorageKey(userId, businessAccountId, outletId), JSON.stringify(cart));
    } catch { /* ignore */ }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
    const { data: session, status: sessionStatus } = useSession();
    const isLoggedIn = sessionStatus === 'authenticated';
    const sessionUser = (session?.user ?? {}) as Record<string, unknown>;
    const userId = (session?.user?.id as string | undefined) ?? null;
    const userRole = (session?.user as { role?: string } | undefined)?.role;
    const activeBAId = sessionUser.activeBusinessAccountId as string | undefined;
    const activeOutletId = sessionUser.activeOutletId as string | undefined;
    const activeBAType = sessionUser.activeBusinessAccountType as
        | { isCustomer?: boolean; isVendor?: boolean; isBrand?: boolean }
        | undefined;
    const [cart, setCart] = useState<CartItemWithId[]>([]);
    const [apiGroupMeta, setApiGroupMeta] = useState<Record<string, ApiGroupMeta>>({});
    const [isInitialized, setIsInitialized] = useState(false);
    const [customerImpersonating, setCustomerImpersonating] = useState(false);
    // Last identity we finished loading for — session blips reuse this for silent revalidate.
    const lastContextKeyRef = useRef<string | null>(null);

    // Align with requireStorefrontAccess: customer role OR active BA isCustomer
    // (vendor JWT shopping on a customer BA must use server cart, not fragile local-only).
    const shouldUseServerCart =
        !isLoggedIn ||
        customerImpersonating ||
        userRole === 'customer' ||
        activeBAType?.isCustomer === true;

    const applyApiCart = useCallback((apiData: { vendorGroups: unknown[]; total: number }) => {
        const { items, groupMeta } = parseApiCart(apiData);
        setCart(items);
        setApiGroupMeta(groupMeta);
    }, []);

    // Admin View: JWT stays admin while cookies switch the API to the customer.
    // Reload cart when impersonation starts/stops (same pattern as AddressContext).
    useEffect(() => {
        const sync = () => setCustomerImpersonating(isAdminCustomerImpersonationActive());
        sync();
        const onSameTab = () => sync();
        window.addEventListener(IMPERSONATION_CHANGED_EVENT, onSameTab);
        const unsub = subscribeAuthTabEvents((event) => {
            if (event.type === 'impersonation-changed' || event.type === 'session-changed') {
                sync();
            }
        });
        return () => {
            window.removeEventListener(IMPERSONATION_CHANGED_EVENT, onSameTab);
            unsub();
        };
    }, []);

    // On mount or context switch: load cart (API if logged in, localStorage if guest).
    // On guest→login transition: merge localStorage items into the server cart
    // first, then load — otherwise items added while logged-out vanish.
    // Session refresh blips (same user/BA/outlet) do a silent background revalidate
    // without setCart([]) so the badge and line items never flash to zero.
    useEffect(() => {
        if (sessionStatus === 'loading') return;

        let alive = true;
        const contextKey = `${userId ?? ''}|${activeBAId ?? ''}|${activeOutletId ?? ''}|${customerImpersonating}`;
        const silent = lastContextKeyRef.current === contextKey;

        if (!silent) {
            // Block the localStorage-mirror effect below until THIS context finishes
            // loading/merging. Critical on the guest→login transition: signIn briefly
            // flips status to "authenticated" on the login page (before the redirect
            // navigates away), which runs this effect and setCart([]). Without this
            // guard the mirror would persist that empty array over the guest cart in
            // localStorage, and the navigation aborts the merge before it can restore
            // it — so the guest cart (and the items the user came to buy) vanish.
            setIsInitialized(false);
            setCart([]); // Clear only on real account/outlet/login change
        }

        if (isLoggedIn && !shouldUseServerCart) {
            // Vendor/brand/admin without a customer BA — local cart only (no /api/v1/cart).
            // Must reload from localStorage after remount (Dashboard → storefront), otherwise
            // the earlier setCart([]) + mirror effect permanently wipes the cart.
            setApiGroupMeta({});
            if (!silent) {
                setCart(loadLocalCart(userId, activeBAId, activeOutletId));
            }
            lastContextKeyRef.current = contextKey;
            setIsInitialized(true);
            return;
        }
        if (isLoggedIn) {
            // Never merge guest/admin local lines into an impersonated customer cart.
            // Skip merge on silent revalidate — already done on the initial login load.
            const guestItems = (silent || customerImpersonating) ? [] : loadLocalCart(null);
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
                    .then(() => { try { localStorage.removeItem(cartStorageKey(null)); } catch { /* ignore */ } })
                    .catch(() => { /* server merge failed — keep localStorage so we can retry on next login */ })
                : Promise.resolve();

            mergeFirst
                .then(() => {
                    if (!alive) return undefined;
                    return dal.cart.get();
                })
                .then(apiData => {
                    if (!alive || apiData == null) return;
                    applyApiCart(apiData as { vendorGroups: unknown[]; total: number });
                })
                .catch((err: unknown) => {
                    if (!alive) return;
                    // Silent revalidate must keep items already on screen — never clear.
                    if (silent) return;
                    const msg = err instanceof Error ? err.message : '';
                    const noDelivery =
                        isLoggedIn &&
                        (msg.toLowerCase().includes('delivery address') ||
                            msg.toLowerCase().includes('no active outlet'));
                    if (noDelivery || customerImpersonating) {
                        // Impersonation must not fall back to the admin's local cart.
                        setCart([]);
                        return;
                    }
                    setCart(loadLocalCart(userId, activeBAId, activeOutletId));
                })
                .finally(() => {
                    if (!alive) return;
                    lastContextKeyRef.current = contextKey;
                    setIsInitialized(true);
                });
        } else {
            if (!silent) {
                setCart(loadLocalCart(null));
            }
            lastContextKeyRef.current = contextKey;
            setIsInitialized(true);
        }

        return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionStatus, userId, activeBAId, activeOutletId, customerImpersonating, shouldUseServerCart]);

    // Persist to localStorage for both guest and logged-in users so guest session preserves it on logout.
    // Skip while Admin View is on — otherwise the customer's cart overwrites the admin mirror key.
    useEffect(() => {
        if (!isInitialized || customerImpersonating) return;
        saveLocalCart(cart, isLoggedIn ? userId : null, activeBAId, activeOutletId);
    }, [cart, isInitialized, isLoggedIn, userId, activeBAId, activeOutletId, customerImpersonating]);

    const addToCart = useCallback((product: VendorProduct, quantity: number = 1) => {
        // Cap to fulfillment-aware stock when known (stock > 0). stock === 0 means OOS.
        const maxStock = typeof product.stock === 'number' && product.stock > 0 ? product.stock : undefined;
        if (typeof product.stock === 'number' && product.stock <= 0) {
            return;
        }
        if (maxStock != null && quantity > maxStock) {
            quantity = maxStock;
        }

        // product.price = base gross price (below any bulk tier)
        // Compute the correct tier price for the quantity being added
        const basePriceGross = product.price;
        const effectiveGross = getEffectiveGrossPrice(basePriceGross, product.bulkPrices || [], quantity);
        const tax = product.taxPercent || 0;
        const effectiveTaxableRate = tax > 0 ? effectiveGross / (1 + tax / 100) : effectiveGross;
        const productWithEffectivePrice: VendorProduct = { ...product, price: effectiveGross, taxableRate: effectiveTaxableRate };

        if (isLoggedIn && shouldUseServerCart) {
            dal.cart.addItem(product.id, product.vendorId, quantity)
                .then(async () => {
                    // Refresh cart from API to get cartItemId and server-computed prices
                    const apiData = await dal.cart.get();
                    applyApiCart(apiData as { vendorGroups: unknown[]; total: number });
                })
                .catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : '';
                    if (msg.includes('units available') || msg.includes('OUT_OF_STOCK')) {
                        // Server rejected oversell — refresh cart, do not optimistic-add
                        dal.cart.get()
                          .then(apiData => applyApiCart(apiData as { vendorGroups: unknown[]; total: number }))
                          .catch(() => {});
                        return;
                    }
                    // Optimistic update on other API failures — use locally-computed effective price
                    setCart(prev => {
                        const existing = prev.find(i => i.productId === product.id);
                        if (existing) {
                            let newQty = existing.quantity + quantity;
                            if (maxStock != null) newQty = Math.min(newQty, maxStock);
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
                    let newQty = existing.quantity + quantity;
                    if (maxStock != null) newQty = Math.min(newQty, maxStock);
                    const newGross = getEffectiveGrossPrice(existing.basePriceGross, existing.product.bulkPrices || [], newQty);
                    const newTaxable = tax > 0 ? newGross / (1 + tax / 100) : newGross;
                    return prev.map(i => i.productId === product.id
                        ? { ...i, quantity: newQty, product: { ...i.product, price: newGross, taxableRate: newTaxable } }
                        : i);
                }
                return [...prev, { productId: product.id, product: productWithEffectivePrice, quantity, basePriceGross }];
            });
        }
    }, [isLoggedIn, shouldUseServerCart, applyApiCart]);

    // Side effects (API calls) must run OUTSIDE setCart's updater function —
    // React 19 strict mode invokes the updater twice, which would fire the
    // DELETE/PATCH twice and the second call would 404/P2025.
    const cartRef = useRef<CartItemWithId[]>([]);
    useEffect(() => { cartRef.current = cart; }, [cart]);

    // Coalesce rapid qty PATCH+GET so older responses can't snap the UI back.
    const qtySyncGenRef = useRef<Map<string, number>>(new Map());
    const qtySyncTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const scheduleServerQtySync = useCallback((productId: string, cartItemId: string, quantity: number) => {
        if (!isLoggedIn || !shouldUseServerCart) return;
        const prevTimer = qtySyncTimerRef.current.get(productId);
        if (prevTimer) clearTimeout(prevTimer);
        const gen = (qtySyncGenRef.current.get(productId) ?? 0) + 1;
        qtySyncGenRef.current.set(productId, gen);

        const timer = setTimeout(() => {
            qtySyncTimerRef.current.delete(productId);
            void (async () => {
                try {
                    await dal.cart.updateItem(cartItemId, quantity);
                    if (qtySyncGenRef.current.get(productId) !== gen) return;
                    // Another item still debouncing — let the last flush refresh the cart.
                    if (qtySyncTimerRef.current.size > 0) return;
                    const apiData = await dal.cart.get();
                    if (qtySyncGenRef.current.get(productId) !== gen) return;
                    if (qtySyncTimerRef.current.size > 0) return;
                    applyApiCart(apiData as { vendorGroups: unknown[]; total: number });
                } catch {
                    // Keep optimistic client cart; next successful sync will reconcile.
                }
            })();
        }, 280);
        qtySyncTimerRef.current.set(productId, timer);
    }, [isLoggedIn, shouldUseServerCart, applyApiCart]);

    useEffect(() => {
        const timers = qtySyncTimerRef.current;
        return () => {
            timers.forEach((t) => clearTimeout(t));
            timers.clear();
        };
    }, []);

    const removeFromCart = useCallback((productId: string) => {
        const item = cartRef.current.find(i => i.productId === productId);
        const syncTimer = qtySyncTimerRef.current.get(productId);
        if (syncTimer) {
            clearTimeout(syncTimer);
            qtySyncTimerRef.current.delete(productId);
        }
        qtySyncGenRef.current.set(productId, (qtySyncGenRef.current.get(productId) ?? 0) + 1);

        if (isLoggedIn && shouldUseServerCart && item?.cartItemId) {
            dal.cart.removeItem(item.cartItemId)
                .then(() => dal.cart.get())
                .then(apiData => applyApiCart(apiData as { vendorGroups: unknown[]; total: number }))
                .catch(() => {});
        }
        setCart(prev => {
            const next = prev.filter(i => i.productId !== productId);
            cartRef.current = next;
            return next;
        });
        if (item?.product?.vendorId) {
            const vendorId = item.product.vendorId;
            setApiGroupMeta(prev => {
                if (!(vendorId in prev)) return prev;
                const next = { ...prev };
                delete next[vendorId];
                return next;
            });
        }
    }, [isLoggedIn, shouldUseServerCart, applyApiCart]);

    const commitQuantity = useCallback((productId: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(productId);
            return;
        }

        const item = cartRef.current.find(i => i.productId === productId);
        if (!item || item.isPromoFree) return;

        const minQty = item.product?.minOrderQuantity || 1;
        if (quantity < minQty) return;

        let nextQty = quantity;
        const maxStock = typeof item.product?.stock === 'number' && item.product.stock > 0
            ? item.product.stock
            : undefined;
        if (maxStock != null && nextQty > maxStock) nextQty = maxStock;
        if (nextQty === item.quantity) return;

        const vendorId = item.product?.vendorId;
        if (vendorId) {
            setApiGroupMeta(meta => {
                if (!(vendorId in meta)) return meta;
                const nextMeta = { ...meta };
                delete nextMeta[vendorId];
                return nextMeta;
            });
        }

        if (isLoggedIn && item.cartItemId) {
            scheduleServerQtySync(productId, item.cartItemId, nextQty);
        }

        const keepServerUnitPrice = !!item.product?.customerPriceApplied;
        const basePriceGross = item.basePriceGross || item.product?.price || 0;
        const newGrossPrice = getEffectiveGrossPrice(basePriceGross, item.product?.bulkPrices || [], nextQty);
        const tax = item.product?.taxPercent || 0;
        const newTaxableRate = tax > 0 ? newGrossPrice / (1 + tax / 100) : newGrossPrice;

        const next = cartRef.current.map(i => {
            if (i.productId !== productId) return i;
            return {
                ...i,
                quantity: nextQty,
                product: keepServerUnitPrice
                    ? i.product
                    : { ...i.product, price: newGrossPrice, taxableRate: newTaxableRate },
            };
        });
        // Sync ref before setState so rapid +/- clicks see the latest qty immediately.
        cartRef.current = next;
        setCart(next);
    }, [isLoggedIn, removeFromCart, scheduleServerQtySync]);

    const updateQuantity = useCallback((productId: string, quantity: number) => {
        commitQuantity(productId, quantity);
    }, [commitQuantity]);

    const adjustQuantity = useCallback((productId: string, delta: number) => {
        if (!delta) return;
        const item = cartRef.current.find(i => i.productId === productId);
        if (!item || item.isPromoFree) return;
        commitQuantity(productId, item.quantity + delta);
    }, [commitQuantity]);

    const clearCart = useCallback(() => {
        qtySyncTimerRef.current.forEach((t) => clearTimeout(t));
        qtySyncTimerRef.current.clear();
        if (isLoggedIn && shouldUseServerCart) {
            dal.cart.clear().catch(() => {});
        }
        setCart([]);
        cartRef.current = [];
        setApiGroupMeta({});
    }, [isLoggedIn, shouldUseServerCart]);

    const groups = useMemo(() => buildGroups(cart, apiGroupMeta), [cart, apiGroupMeta]);
    const totalItems = useMemo(() => cart.reduce((sum, i) => sum + (i.quantity || 0), 0), [cart]);

    // Always derive money totals from groups so optimistic qty edits aren't stuck
    // behind a stale apiGroupMeta.subtotal while line prices already moved.
    const subtotal = useMemo(() => groups.reduce((s, g) => s + g.subtotal, 0), [groups]);
    const totalTaxable = useMemo(() => groups.reduce((s, g) => s + g.subtotalTaxable, 0), [groups]);
    const totalGST = useMemo(() => groups.reduce((s, g) => s + g.totalGST, 0), [groups]);

    const totalAmount = subtotal;
    const vendorCount = groups.length;
    const isCartLoading = !isInitialized;

    const value = useMemo(() => ({
        cart,
        groups,
        addToCart,
        removeFromCart,
        updateQuantity,
        adjustQuantity,
        clearCart,
        totalItems,
        subtotal,
        totalTaxable,
        totalGST,
        totalAmount,
        vendorCount,
        isCartLoading,
    }), [cart, groups, addToCart, removeFromCart, updateQuantity, adjustQuantity, clearCart, totalItems, subtotal, totalTaxable, totalGST, totalAmount, vendorCount, isCartLoading]);

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

/** Safe outside storefront (admin/vendor portals have no CartProvider). */
export function useOptionalCart() {
    return useContext(CartContext);
}
