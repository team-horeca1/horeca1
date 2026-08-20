'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ClipboardList, Clock, AlertCircle, ShoppingCart, Package, Eye, ChevronRight, Home, Building2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { dal } from '@/lib/dal';
import type { Vendor } from '@/types';
import { useCart } from '@/context/CartContext';

interface ContinueCard {
    id: string;
    vendorId: string;
    vendorName: string;
    vendorLogo: string;
    vendorLogos?: string[];
    subtitle: string;
    subtitle2?: string;
    subtitleIcon: 'cart' | 'order' | 'list' | 'viewed';
    href: string;
    priority: number;
    timestamp: number;
}

export default function ContinueOrderingPage() {
    const { status } = useSession();
    const isLoggedIn = status === 'authenticated';
    const [isMounted, setIsMounted] = useState(false);
    const [cards, setCards] = useState<ContinueCard[]>([]);
    const [vendorsList, setVendorsList] = useState<Vendor[]>([]);
    const { groups: cartGroups } = useCart();
    const pathname = usePathname();

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

    useEffect(() => {
        Promise.resolve().then(() => setIsMounted(true));
        dal.vendors.list()
            .then(result => setVendorsList(result.vendors))
            .catch(() => setVendorsList([]));
    }, []);

    useEffect(() => {
        if (!isMounted || !isLoggedIn) return;

        const buildCards = () => {
            const seenVendors = new Set<string>();
            const allCards: ContinueCard[] = [];

            // SOURCE 1: Active Cart
            cartGroups.forEach(group => {
                if (seenVendors.has(group.vendorId)) return;
                seenVendors.add(group.vendorId);

                const itemCount = group.items.reduce((sum, item) => sum + item.quantity, 0);
                allCards.push({
                    id: `cart-${group.vendorId}`,
                    vendorId: group.vendorId,
                    vendorName: group.vendorName,
                    vendorLogo: group.vendorLogo || vendorsList.find(v => v.id === group.vendorId)?.logo || '',
                    subtitle: `${itemCount} items in cart • ₹${group.subtotal.toLocaleString('en-IN')}`,
                    subtitleIcon: 'cart',
                    href: '/cart',
                    priority: 1,
                    timestamp: Date.now(),
                });
            });

            // SOURCE 2: Past Orders
            try {
                const savedOrders = localStorage.getItem('horeca_orders');
                if (savedOrders) {
                    const orders: Array<{id: string; vendorId: string; vendorName?: string; vendorLogo?: string; createdAt: string}> = JSON.parse(savedOrders);
                    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .forEach((order) => {
                            if (!order.vendorId || seenVendors.has(order.vendorId)) return;
                            seenVendors.add(order.vendorId);
                            const vendor = vendorsList.find(v => v.id === order.vendorId);
                            allCards.push({
                                id: `order-${order.id}`,
                                vendorId: order.vendorId,
                                vendorName: order.vendorName || vendor?.name || 'Vendor',
                                vendorLogo: order.vendorLogo || vendor?.logo || '',
                                subtitle: `Ordered`,
                                subtitle2: getRelativeTime(new Date(order.createdAt).getTime()),
                                subtitleIcon: 'order',
                                href: '/orders',
                                priority: 2,
                                timestamp: new Date(order.createdAt).getTime(),
                            });
                        });
                }
            } catch (e) {}

            // SOURCE 3: Order Lists
            try {
                const savedLists = localStorage.getItem('horeca_order_lists_all') || '[]';
                type ParsedList = { id: string; vendorId?: string; vendorName?: string; vendorLogo?: string; name?: string; lastUsed?: string; items: Array<{ product?: { vendorId?: string } }> };
                const orderLists: ParsedList[] = JSON.parse(savedLists);
                orderLists.filter((list) => !!list.lastUsed)
                    .sort((a, b) => new Date(b.lastUsed!).getTime() - new Date(a.lastUsed!).getTime())
                    .forEach((list) => {
                        if (!list.vendorId || seenVendors.has(list.vendorId)) return;
                        seenVendors.add(list.vendorId);

                        const vendor = vendorsList.find(v => v.id === list.vendorId);
                        const listVendorIds = new Set<string>();
                        if (list.items) {
                            list.items.forEach((item) => {
                                const vid = item.product?.vendorId || list.vendorId;
                                if (vid) listVendorIds.add(vid);
                            });
                        }
                        
                        const logos = Array.from(listVendorIds).map(vid => vendorsList.find(v => v.id === vid)?.logo).filter(Boolean) as string[];

                        const rawName = list.vendorName || vendor?.name || 'Vendor';
                        const baseVendorName = rawName.replace(/\s\+\s\d+\smore.*/, '');
                        let displayVendorName = baseVendorName;
                        if (listVendorIds.size > 1) {
                            displayVendorName = `${displayVendorName} + ${listVendorIds.size - 1} more`;
                        }

                        allCards.push({
                            id: `list-${list.id}`,
                            vendorId: list.vendorId,
                            vendorName: displayVendorName,
                            vendorLogo: list.vendorLogo || vendor?.logo || '',
                            vendorLogos: logos.length > 1 ? logos : undefined,
                            subtitle: `${list.name} • ${list.items.length} items`,
                            subtitle2: `Used ${getRelativeTime(new Date(list.lastUsed!).getTime())}`,
                            subtitleIcon: 'list',
                            href: `/order-lists/${list.id}`,
                            priority: 3,
                            timestamp: new Date(list.lastUsed!).getTime(),
                        });
                    });
            } catch (e) {}

            // SOURCE 4: Recently Viewed
            try {
                const savedViewed = localStorage.getItem('horeca_recently_viewed');
                if (savedViewed) {
                    type ViewedEntry = { vendorId?: string; vendorName?: string; vendorLogo?: string; viewedAt?: number; viewedProducts?: Array<{ name: string }> };
                    const viewedEntries: ViewedEntry[] = JSON.parse(savedViewed);
                    viewedEntries.forEach((entry) => {
                        if (!entry.vendorId) return;
                        const products = entry.viewedProducts || [];
                        let productLabel = 'Recently Viewed';
                        if (products.length === 1) {
                            productLabel = `Recently Viewed • ${products[0].name}`;
                        } else if (products.length > 1) {
                            productLabel = `Recently Viewed • ${products[0].name} + ${products.length - 1} more`;
                        }
                        const finalSubtitle2 = getRelativeTime(entry.viewedAt || 0);

                        if (seenVendors.has(entry.vendorId)) {
                            const existing = allCards.find(c => c.vendorId === entry.vendorId);
                            if (existing) {
                                existing.subtitle = productLabel;
                                existing.subtitle2 = finalSubtitle2;
                                existing.subtitleIcon = 'viewed';
                                existing.href = products.length > 0 
                                    ? `/recently-viewed/${entry.vendorId}` 
                                    : `/vendor/${entry.vendorId}`;
                                if ((entry.viewedAt ?? 0) > existing.timestamp) existing.timestamp = entry.viewedAt ?? 0;
                            }
                        } else {
                            seenVendors.add(entry.vendorId);
                            allCards.push({
                                id: `viewed-${entry.vendorId}`,
                                vendorId: entry.vendorId,
                                vendorName: entry.vendorName || 'Vendor',
                                vendorLogo: entry.vendorLogo || vendorsList.find(v => v.id === entry.vendorId)?.logo || '',
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
            } catch (e) {}

            allCards.sort((a, b) => b.timestamp - a.timestamp);
            setCards(allCards);
        };

        buildCards();
        window.addEventListener('storage', buildCards);
        window.addEventListener('focus', buildCards);
        return () => {
            window.removeEventListener('storage', buildCards);
            window.removeEventListener('focus', buildCards);
        };
    }, [isMounted, isLoggedIn, cartGroups]);

    const getSubtitleIcon = (type: ContinueCard['subtitleIcon']) => {
        switch (type) {
            case 'cart': return <ShoppingCart size={12} />;
            case 'order': return <Package size={12} />;
            case 'list': return <ClipboardList size={12} />;
            case 'viewed': return <Eye size={12} />;
        }
    };

    const getSubtitleColor = (type: ContinueCard['subtitleIcon']) => {
        switch (type) {
            case 'cart': return 'text-[#e67e22]';
            case 'order': return 'text-[#299e60]';
            case 'list': return 'text-[#3b82f6]';
            case 'viewed': return 'text-[#8b5cf6]';
        }
    };

    if (!isMounted || !isLoggedIn) return null;

    return (
        <div className="min-h-screen bg-[#F2F3F2]">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="md:max-w-[var(--container-max)] mx-auto px-6 py-4 flex items-center gap-4">
                    <button onClick={() => window.history.back()} className="hover:bg-gray-50 p-1.5 rounded-full transition-colors">
                        <ChevronLeft size={24} className="text-[#181725]" />
                    </button>
                    <div>
                        <h1 className="text-[18px] md:text-[22px] font-bold text-[#181725]">Continue Ordering</h1>
                        <p className="text-[12px] md:text-[14px] text-gray-500 font-medium">{cards.length} items from your recent activity</p>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="md:max-w-[var(--container-max)] mx-auto px-6 py-6 pb-20">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cards.map((card) => {
                        const vendor = vendorsList.find(v => v.id === card.vendorId);
                        return (
                            <Link
                                key={card.id}
                                href={card.href}
                                className="flex items-center gap-4 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-lg transition-all group"
                            >
                                <div className="w-14 h-14 md:w-16 md:h-16 shrink-0 relative flex items-center justify-center">
                                    {card.vendorLogos && card.vendorLogos.length > 1 ? (
                                        <div className="relative w-full h-full">
                                            {card.vendorLogos.slice(0, 4).map((logoUrl, i) => (
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
                                                    <img src={logoUrl} alt="vendor" className="w-full h-full object-cover rounded-full border border-white" />
                                                </div>
                                            ))}
                                            {card.vendorLogos.length > 4 && (
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 rounded-full bg-[#53B175] text-white text-[8px] md:text-[9px] font-bold flex items-center justify-center border border-white z-20">
                                                    +{card.vendorLogos.length - 4}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-transparent overflow-hidden shrink-0 border border-gray-50">
                                        <img
                                            src={card.vendorLogo || vendor?.logo || ''}
                                            alt={card.vendorName}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-[15px] md:text-[17px] font-bold text-[#181725] truncate group-hover:text-primary transition-colors">
                                        {card.vendorName}
                                    </h3>
                                    <div className={`flex flex-col text-[11px] md:text-[13px] font-bold mt-0.5 whitespace-nowrap overflow-hidden`}>
                                        <div className={`flex items-center gap-1 ${getSubtitleColor(card.subtitleIcon)}`}>
                                            {getSubtitleIcon(card.subtitleIcon)}
                                            <span className="truncate">{card.subtitle}</span>
                                        </div>
                                        {card.subtitle2 && (
                                            <div className="flex items-center gap-1 mt-0.5 text-[10px] md:text-[12px] font-medium text-[#7C7C7C]">
                                                <Clock size={11} strokeWidth={2} />
                                                <span>{card.subtitle2}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight className="text-gray-300 group-hover:text-primary transition-colors group-hover:translate-x-1" size={20} />
                            </Link>
                        );
                    })}
                </div>

                {cards.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                            <Clock size={40} className="text-gray-300" />
                        </div>
                        <h2 className="text-[20px] font-bold text-[#181725] mb-2">No recent activity</h2>
                        <p className="text-[14px] text-gray-400 max-w-[280px] mx-auto">Items you view, add to cart, or order will appear here to help you quickly continue your shopping.</p>
                        <Link href="/" className="mt-8 text-[#53B175] font-bold hover:underline">Start exploring vendors</Link>
                    </div>
                )}
            </main>
        </div>
    );
}
