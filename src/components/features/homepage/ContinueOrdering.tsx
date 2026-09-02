'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useStableSession } from '@/hooks/useStableSession';
import { dal } from '@/lib/dal';
import type { Vendor } from '@/types';
import { useCart } from '@/context/CartContext';
import { SectionHeader } from '@/components/ui/SectionHeader';

/* ====================================================================
   OLD_CODE_START — Previous implementation (Quick Order Lists only)
   ====================================================================

export function ContinueOrdering() {
    const [isMounted, setIsMounted] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [activeOrderLists, setActiveOrderLists] = useState<any[]>([]);

    useEffect(() => {
        setIsMounted(true);
        setIsLoggedIn(localStorage.getItem('isLoggedIn') === 'true');
        
        const loadAndSync = () => {
            const savedLists = localStorage.getItem('horeca_order_lists_all');
            if (savedLists) {
                try {
                    const parsed = JSON.parse(savedLists);
                    if (parsed.length < MOCK_ORDER_LISTS.length) {
                        const merged = [...parsed];
                        MOCK_ORDER_LISTS.forEach(mockList => {
                            if (!merged.find(l => l.id === mockList.id)) {
                                merged.push(mockList);
                            }
                        });
                        setActiveOrderLists(merged);
                        localStorage.setItem('horeca_order_lists_all', JSON.stringify(merged));
                    } else {
                        setActiveOrderLists(parsed);
                    }
                } catch (e) {
                    setActiveOrderLists(MOCK_ORDER_LISTS);
                }
            } else {
                setActiveOrderLists(MOCK_ORDER_LISTS);
                localStorage.setItem('horeca_order_lists_all', JSON.stringify(MOCK_ORDER_LISTS));
            }
        };

        loadAndSync();

        window.addEventListener('storage', loadAndSync);
        window.addEventListener('focus', loadAndSync);

        return () => {
            window.removeEventListener('storage', loadAndSync);
            window.removeEventListener('focus', loadAndSync);
        };
    }, []);

    const recentVendors = MOCK_VENDORS.slice(0, 7);

    if (!isMounted || !isLoggedIn) return null;

    return (
        <section className="w-full py-4 bg-white">
            <div className="max-w-[var(--container-max)] mx-auto overflow-hidden">
                <div className="flex items-center justify-between mb-4 md:mb-6 px-6 md:px-[var(--container-padding)]">
                    <h2 className="text-[16px] md:text-[20px] lg:text-[22px] font-bold text-[#181725]">Continue Ordering</h2>
                    <Link href="/order-lists" className="text-[13px] md:text-[15px] font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer">View all</Link>
                </div>

                <div className="overflow-x-auto no-scrollbar scroll-smooth">
                    <div className="flex flex-nowrap gap-3 md:gap-4 py-3 px-6 md:px-[var(--container-padding)] w-max">
                    {activeOrderLists
                        .filter(list => !!list.lastUsed)
                        .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
                        .map((vendorList) => {
                            const vendor = MOCK_VENDORS.find(v => v.id === vendorList.vendorId) || MOCK_VENDORS[0];
                            const targetUrl = `/order-lists/${vendorList.id}`;
                            const vendorIds = vendorList 
                                ? [...new Set(vendorList.items.map((item: any) => item.product?.vendorId || item.vendorId).filter(Boolean))]
                                : [vendor.id];
                            
                            const listLogos = vendorIds.map(vid => {
                                const v = MOCK_VENDORS.find(v => v.id === vid);
                                return v ? v.logo : null;
                            }).filter(Boolean);

                            const listTitle = listLogos.length > 1 
                                ? `${vendor.name} +${listLogos.length - 1} more` 
                                : vendor.name;

                            return (
                                <Link
                                    key={vendorList.id}
                                    href={targetUrl}
                                    className="flex items-center gap-3 md:gap-4 min-w-[260px] md:min-w-[320px] bg-white rounded-2xl p-3 md:p-4 border border-gray-200 shadow-sm hover:shadow-xl hover:shadow-gray-200/40 hover:border-primary/40 transition-all group shrink-0"
                                >
                                    <div className="w-12 h-12 md:w-16 md:h-16 shrink-0 relative flex items-center justify-center">
                                        {listLogos.length > 1 ? (
                                            <div className="relative w-full h-full">
                                                {listLogos.slice(0, 4).map((logoUrl: any, i) => (
                                                    <div 
                                                        key={i} 
                                                        className="absolute rounded-full overflow-hidden aspect-square bg-transparent"
                                                        style={{ 
                                                            width: '60%',
                                                            height: '60%',
                                                            left: (i === 1 || i === 3) ? '40%' : '0%',
                                                            top: (i === 2 || i === 3) ? '40%' : '0%',
                                                            zIndex: 4 - i 
                                                        }}
                                                    >
                                                        <img src={logoUrl} alt="vendor" className="w-full h-full object-cover rounded-full" />
                                                    </div>
                                                ))}
                                                {listLogos.length > 4 && (
                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 rounded-full bg-primary text-white text-[8px] md:text-[9px] font-bold flex items-center justify-center border border-white z-20">
                                                        +{listLogos.length - 4}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-transparent overflow-hidden shrink-0 transition-transform group-hover:scale-95 duration-300">
                                                <img src={vendor.logo} alt={vendor.name} className="w-full h-full object-cover transition-transform group-hover:scale-125 duration-700" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] md:text-[16px] font-bold text-[#181725] line-clamp-1 transition-colors group-hover:text-primary">
                                            {listTitle}
                                        </p>
                                        
                                        <div className="flex flex-col mt-0.5">
                                            <div className="flex items-center gap-1.5 text-[10px] md:text-[12px] text-gray-400 font-semibold whitespace-nowrap">
                                                {vendorList ? (
                                                    <>
                                                        <span className="flex items-center gap-1">
                                                            {vendorList.items.length} items
                                                        </span>
                                                        <span className="flex items-center gap-1.5 ml-1">
                                                            {vendorList.lastUsed ? (
                                                                <span className="flex items-center gap-0.5 text-[#299e60] font-bold">
                                                                    <Clock size={10} className="md:w-3 md:h-3" />
                                                                    <span>Used {new Date(vendorList.lastUsed).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-0.5 text-gray-400 font-bold px-1.5 py-0.5 bg-gray-50 rounded-full border border-gray-100">
                                                                    <AlertCircle size={10} className="md:w-3 md:h-3" />
                                                                    <span>Never used</span>
                                                                </span>
                                                            )}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <Clock size={10} className="md:w-[13px] md:h-[13px]" />
                                                        <span>{vendor.deliverySchedule || 'Tomorrow 7:00 AM'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-7 h-7 md:w-9 md:h-9 rounded-full bg-white flex items-center justify-center border border-gray-200 text-gray-400 group-hover:text-primary group-hover:border-primary/30 transition-all group-hover:translate-x-1 shadow-sm">
                                        <ChevronRight className="w-4 h-4 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}

   OLD_CODE_END
   ==================================================================== */


// =============================================================================
// NEW IMPLEMENTATION — Matches UI/UX Notes Section 3
// "Continue Ordering" = Recent vendors / products / abandoned cart or POs
// Priority: 1) Active Cart  2) Past Orders  3) Quick Order Lists  4) Recently Viewed
// =============================================================================

interface ContinueCard {
    id: string;
    vendorId: string;
    vendorName: string;
    vendorLogo: string;
    vendorLogos?: string[]; // Multiple logos for multi-vendor lists
    coverImage?: string;
    subtitle: string;
    subtitle2?: string; // Second line (for time/meta)
    subtitleIcon: 'cart' | 'order' | 'list' | 'viewed';
    href: string;
    priority: number; // 1 = cart, 2 = past order, 3 = order list, 4 = recently viewed
    timestamp: number; // for sorting within same priority
}

export function ContinueOrdering() {
    const { isAuthenticated } = useStableSession();
    const isLoggedIn = isAuthenticated;
    const [isMounted, setIsMounted] = useState(false);
    const [cards, setCards] = useState<ContinueCard[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [orderLists, setOrderLists] = useState<Record<string, unknown>[]>([]);
    const { groups: cartGroups } = useCart();
    const pathname = usePathname(); // Re-runs buildCards on every route change

    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 5);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
        }
    };

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const amount = 350;
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -amount : amount,
                behavior: 'smooth'
            });
            setTimeout(checkScroll, 350);
        }
    };

    useEffect(() => {
        Promise.resolve().then(() => setIsMounted(true));
    }, []);

    // Fetch vendors and order lists from the DAL
    useEffect(() => {
        if (!isMounted || !isLoggedIn) return;

        dal.vendors.list()
            .then((res) => setVendors(res.vendors))
            .catch(() => setVendors([]));

        dal.lists.getAll()
            .then((res) => setOrderLists(res as unknown as Record<string, unknown>[]))
            .catch(() => setOrderLists([]));
    }, [isMounted, isLoggedIn]);

    const getRelativeTime = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    // Build merged cards from all 4 sources
    useEffect(() => {
        if (!isMounted || !isLoggedIn) return;

        const buildCards = () => {
            const seenVendors = new Set<string>();
            const allCards: ContinueCard[] = [];

            // ── SOURCE 1: Active Cart (abandoned cart) ──
            cartGroups.forEach(group => {
                if (seenVendors.has(group.vendorId)) return;
                seenVendors.add(group.vendorId);

                const itemCount = group.items.reduce((sum, item) => sum + item.quantity, 0);
                const total = group.subtotal;

                const vendor = vendors.find(v => v.id === group.vendorId);
                allCards.push({
                    id: `cart-${group.vendorId}`,
                    vendorId: group.vendorId,
                    vendorName: group.vendorName,
                    vendorLogo: group.vendorLogo || vendor?.logo || '',
                    coverImage: group.items[0]?.product?.images?.[0] || vendor?.coverImage,
                    subtitle: `${itemCount} ${itemCount === 1 ? 'item' : 'items'} in cart • ₹${total.toLocaleString('en-IN')}`,
                    subtitleIcon: 'cart',
                    href: '/cart',
                    priority: 1,
                    timestamp: Date.now(),
                });
            });

            // ── SOURCE 2: Past Orders (from localStorage) ──
            try {
                const savedOrders = localStorage.getItem('horeca_orders');
                if (savedOrders) {
                    type ParsedOrder = { id: string; vendorId: string; vendorName?: string; vendorLogo?: string; createdAt: string };
                    const orders: ParsedOrder[] = JSON.parse(savedOrders);
                    // Sort by createdAt desc
                    orders
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .forEach((order) => {
                            const vendorId = order.vendorId;
                            if (!vendorId || seenVendors.has(vendorId)) return;
                            seenVendors.add(vendorId);

                            const vendor = vendors.find(v => v.id === vendorId);

                            allCards.push({
                                id: `order-${order.id}`,
                                vendorId,
                                vendorName: order.vendorName || vendor?.name || 'Vendor',
                                vendorLogo: order.vendorLogo || vendor?.logo || '',
                                coverImage: vendor?.coverImage,
                                subtitle: `Ordered`,
                                subtitle2: getRelativeTime(new Date(order.createdAt).getTime()),
                                subtitleIcon: 'order',
                                href: '/orders',
                                priority: 2,
                                timestamp: new Date(order.createdAt).getTime(),
                            });
                        });
                }
            } catch (e) {
                console.error('Failed to parse past orders:', e);
            }

            // ── SOURCE 3: Quick Order Lists ──
            try {
                // Merge DAL-fetched lists with any saved in localStorage
                const savedLists = localStorage.getItem('horeca_order_lists_all');
                const mergedLists: Record<string, unknown>[] = [...orderLists];

                if (savedLists) {
                    const parsed: Record<string, unknown>[] = JSON.parse(savedLists);
                    parsed.forEach((localList) => {
                        if (!mergedLists.find((l) => l.id === localList.id)) {
                            mergedLists.push(localList);
                        }
                    });
                }

                if (mergedLists.length > 0) {
                    localStorage.setItem('horeca_order_lists_all', JSON.stringify(mergedLists));
                }

                type ParsedList = { id: string; lastUsed?: string; vendorId?: string; vendorName?: string; vendorLogo?: string; name?: string; items: Array<{ product?: { vendorId?: string } }> };
                (mergedLists as ParsedList[])
                    .filter((list) => !!list.lastUsed)
                    .sort((a, b) => new Date(b.lastUsed!).getTime() - new Date(a.lastUsed!).getTime())
                    .forEach((list) => {
                        const vendorId = list.vendorId;
                        if (!vendorId || seenVendors.has(vendorId)) return;
                        seenVendors.add(vendorId);

                        const vendor = vendors.find(v => v.id === vendorId);

                        // Check if list has products from multiple vendors
                        const listVendorIds = new Set<string>();
                        if (list.items) {
                            list.items.forEach((item) => {
                                const vid = item.product?.vendorId || list.vendorId || vendorId;
                                if (vid) listVendorIds.add(vid);
                            });
                        }

                        const logos = Array.from(listVendorIds).map(vid => vendors.find(v => v.id === vid)?.logo).filter(Boolean) as string[];

                        // Get base vendor name to avoid double "+ N more"
                        // Regex strips any existing " + N more" pattern
                        const rawName = list.vendorName || vendor?.name || 'Vendor';
                        const baseVendorName = rawName.replace(/\s\+\s\d+\smore.*/, '');
                        let displayVendorName = baseVendorName;
                        if (listVendorIds.size > 1) {
                            displayVendorName = `${displayVendorName} + ${listVendorIds.size - 1} more`;
                        }

                        allCards.push({
                            id: `list-${list.id}`,
                            vendorId,
                            vendorName: displayVendorName,
                            vendorLogo: list.vendorLogo || vendor?.logo || '',
                            vendorLogos: logos.length > 1 ? logos : undefined,
                            coverImage: vendor?.coverImage,
                            subtitle: `${list.name} • ${list.items.length} items`,
                            subtitle2: `Used ${getRelativeTime(new Date(list.lastUsed!).getTime())}`,
                            subtitleIcon: 'list',
                            href: `/order-lists/${list.id}`,
                            priority: 3,
                            timestamp: new Date(list.lastUsed!).getTime(),
                        });
                    });
            } catch (e) {
                console.error('Failed to parse order lists:', e);
            }

            // ── SOURCE 4: Recently Viewed Vendors (browsing history) ──
            // If vendor already exists from a higher-priority source, BOOST its timestamp
            // so it appears at the front. If vendor is new, add as a "viewed" card.
            try {
                const savedViewed = localStorage.getItem('horeca_recently_viewed');
                if (savedViewed) {
                    type ViewedEntry = { vendorId?: string; vendorName?: string; vendorLogo?: string; viewedAt?: number; viewedProducts?: Array<{ name: string }> };
                    const viewedEntries: ViewedEntry[] = JSON.parse(savedViewed);
                    viewedEntries.forEach((entry) => {
                        const vendorId = entry.vendorId;
                        if (!vendorId) return;

                        // Build the "Recently Viewed" label from viewed products
                        const products = entry.viewedProducts || [];
                        let productLabel = 'Recently Viewed';
                        if (products.length === 1) {
                            productLabel = `Recently Viewed • ${products[0].name}`;
                        } else if (products.length > 1) {
                            productLabel = `Recently Viewed • ${products[0].name} + ${products.length - 1} more`;
                        }
                        
                        // Always include the relative time in subtitle2
                        const finalSubtitle2 = getRelativeTime(entry.viewedAt || 0);

                        if (seenVendors.has(vendorId)) {
                            // Vendor already has a card from another source —
                            // OVERRIDE it with "Recently Viewed" info since user just browsed
                            const existing = allCards.find(c => c.vendorId === vendorId);
                            if (existing) {
                                existing.subtitle = productLabel;
                                existing.subtitle2 = finalSubtitle2;
                                existing.subtitleIcon = 'viewed';
                                existing.href = products.length > 0 
                                    ? `/recently-viewed/${entry.vendorId}` 
                                    : `/vendor/${entry.vendorId}`;
                                if ((entry.viewedAt ?? 0) > existing.timestamp) {
                                    existing.timestamp = entry.viewedAt ?? 0;
                                }
                            }
                        } else {
                            // New vendor — add a "viewed" card
                            seenVendors.add(vendorId);

                            allCards.push({
                                id: `viewed-${vendorId}`,
                                vendorId,
                                vendorName: entry.vendorName || 'Vendor',
                                vendorLogo: entry.vendorLogo || vendors.find(v => v.id === vendorId)?.logo || '',
                                coverImage: vendors.find(v => v.id === vendorId)?.coverImage,
                                subtitle: productLabel,
                                subtitle2: finalSubtitle2,
                                subtitleIcon: 'viewed',
                                href: products.length > 0 
                                    ? `/recently-viewed/${entry.vendorId}` 
                                    : `/vendor/${entry.vendorId}`,
                                priority: 4,
                                timestamp: entry.viewedAt || 0,
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('Failed to parse recently viewed:', e);
            }

            // Sort: by timestamp desc (most recently interacted first)
            allCards.sort((a, b) => b.timestamp - a.timestamp);

            setCards(allCards);
        };

        buildCards();

        // Listen for storage changes from other tabs
        window.addEventListener('storage', buildCards);
        // Listen for tab focus and visibility changes
        window.addEventListener('focus', buildCards);
        const handleVisibility = () => { if (document.visibilityState === 'visible') buildCards(); };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            window.removeEventListener('storage', buildCards);
            window.removeEventListener('focus', buildCards);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [isMounted, isLoggedIn, cartGroups, pathname, vendors, orderLists]);

    if (!isMounted || !isLoggedIn || cards.length === 0) return null;

    const lineFor = (card: ContinueCard) => {
        if (card.subtitleIcon === 'viewed' && card.subtitle2) return `Viewed · ${card.subtitle2}`;
        if (card.subtitle2) return `${card.subtitle} · ${card.subtitle2}`;
        return card.subtitle;
    };

    return (
        <section className="w-full py-4 bg-background">
            <div className="max-w-[var(--container-max)] mx-auto overflow-hidden">
                <div className="px-4 md:px-[var(--container-padding)]">
                    <SectionHeader
                        title="Continue Ordering"
                        actionLabel="View all →"
                        actionHref="/continue-ordering"
                    />
                </div>

                <div className="relative w-full">
                    <button
                        type="button"
                        onClick={() => scroll('left')}
                        disabled={!canScrollLeft}
                        className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 size-12 bg-white rounded-full shadow-cdl-2 items-center justify-center hover:scale-105 active:scale-95 transition-all border border-divider disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        <ChevronLeft size={22} className="text-[#1C1C1C]" strokeWidth={2.5} />
                    </button>

                    <div
                        ref={scrollRef}
                        onScroll={checkScroll}
                        className="overflow-x-auto no-scrollbar scroll-smooth w-full"
                    >
                        <div className="flex flex-nowrap gap-2.5 md:gap-3 py-2 px-4 md:px-[var(--container-padding)] w-max">
                            {cards.map((card) => {
                                const vendor = vendors.find(v => v.id === card.vendorId);
                                const logo = card.vendorLogo || vendor?.logo || '';

                                return (
                                    <Link
                                        key={card.id}
                                        href={card.href}
                                        className="flex items-center gap-3 shrink-0 min-w-[260px] md:min-w-[300px] bg-white border border-divider rounded-2xl px-3 py-3 shadow-cdl-1 hover:shadow-cdl-2 hover:border-primary/25 transition-all group"
                                    >
                                        <div className="size-12 md:size-14 rounded-[10px] bg-ivory border border-divider overflow-hidden shrink-0 flex items-center justify-center">
                                            {card.vendorLogos && card.vendorLogos.length > 1 ? (
                                                <div className="relative w-full h-full">
                                                    {card.vendorLogos.slice(0, 4).map((logoUrl, i) => (
                                                        <img
                                                            key={i}
                                                            src={logoUrl}
                                                            alt=""
                                                            className="absolute object-cover rounded-[4px] border border-white"
                                                            style={{
                                                                width: '52%',
                                                                height: '52%',
                                                                left: (i === 1 || i === 3) ? '42%' : '6%',
                                                                top: (i === 2 || i === 3) ? '42%' : '6%',
                                                                zIndex: 4 - i,
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            ) : logo ? (
                                                <img src={logo} alt="" className="w-full h-full object-contain p-1" />
                                            ) : (
                                                <span className="text-[15px] font-bold text-primary">
                                                    {card.vendorName?.[0] || '?'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="text-[14px] md:text-[15px] font-bold text-[#1C1C1C] leading-tight line-clamp-1 group-hover:text-primary">
                                                {card.vendorName}
                                            </p>
                                            <p className="text-[12px] text-[#667085] mt-0.5 line-clamp-1">
                                                {lineFor(card)}
                                            </p>
                                        </div>

                                        <div className="size-10 rounded-full bg-primary-light text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                                            <ChevronRight size={18} strokeWidth={2.5} />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => scroll('right')}
                        disabled={!canScrollRight}
                        className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 size-12 bg-white rounded-full shadow-cdl-2 items-center justify-center hover:scale-105 active:scale-95 transition-all border border-divider disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        <ChevronRight size={22} className="text-[#1C1C1C]" strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </section>
    );
}
