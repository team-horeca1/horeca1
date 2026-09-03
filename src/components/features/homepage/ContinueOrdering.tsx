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

interface ContinueCard {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorLogo: string;
  vendorLogos?: string[];
  coverImage?: string;
  subtitle: string;
  subtitle2?: string;
  subtitleIcon: 'cart' | 'order' | 'list' | 'viewed';
  href: string;
  priority: number;
  timestamp: number;
}

interface ApiOrder {
  id: string;
  createdAt: string;
  vendorId?: string;
  vendor?: { id: string; businessName: string; logoUrl: string | null };
  items?: Array<{ quantity: number }>;
}

export function ContinueOrdering() {
  const { isAuthenticated } = useStableSession();
  const isLoggedIn = isAuthenticated;
  const [isMounted, setIsMounted] = useState(false);
  const [cards, setCards] = useState<ContinueCard[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [orderLists, setOrderLists] = useState<Record<string, unknown>[]>([]);
  const [pastOrders, setPastOrders] = useState<ApiOrder[]>([]);
  const { groups: cartGroups } = useCart();
  const pathname = usePathname();

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
        behavior: 'smooth',
      });
      setTimeout(checkScroll, 350);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => setIsMounted(true));
  }, []);

  useEffect(() => {
    if (!isMounted || !isLoggedIn) return;

    dal.vendors
      .list()
      .then((res) => setVendors(res.vendors))
      .catch(() => setVendors([]));

    dal.lists
      .getAll()
      .then((res) => setOrderLists(res as unknown as Record<string, unknown>[]))
      .catch(() => setOrderLists([]));

    fetch('/api/v1/orders?limit=10', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const orders: ApiOrder[] = json?.data?.orders ?? [];
        setPastOrders(orders);
      })
      .catch(() => setPastOrders([]));
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

  useEffect(() => {
    if (!isMounted || !isLoggedIn) return;

    const buildCards = () => {
      const seenVendors = new Set<string>();
      const allCards: ContinueCard[] = [];

      cartGroups.forEach((group) => {
        if (seenVendors.has(group.vendorId)) return;
        seenVendors.add(group.vendorId);

        const itemCount = group.items.reduce((sum, item) => sum + item.quantity, 0);
        const total = group.subtotal;
        const vendor = vendors.find((v) => v.id === group.vendorId);

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

      pastOrders
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .forEach((order) => {
          const vendorId = order.vendorId || order.vendor?.id;
          if (!vendorId || seenVendors.has(vendorId)) return;
          seenVendors.add(vendorId);

          const vendor = vendors.find((v) => v.id === vendorId);
          const itemCount = order.items?.reduce((s, i) => s + (i.quantity || 0), 0) ?? 0;

          allCards.push({
            id: `order-${order.id}`,
            vendorId,
            vendorName: order.vendor?.businessName || vendor?.name || 'Vendor',
            vendorLogo: order.vendor?.logoUrl || vendor?.logo || '',
            coverImage: vendor?.coverImage,
            subtitle: itemCount > 0 ? `Ordered · ${itemCount} items` : 'Ordered',
            subtitle2: getRelativeTime(new Date(order.createdAt).getTime()),
            subtitleIcon: 'order',
            href: `/orders`,
            priority: 2,
            timestamp: new Date(order.createdAt).getTime(),
          });
        });

      try {
        type ParsedList = {
          id: string;
          lastUsed?: string;
          vendorId?: string;
          vendorName?: string;
          vendorLogo?: string;
          name?: string;
          items: Array<{ product?: { vendorId?: string } }>;
        };

        (orderLists as ParsedList[])
          .filter((list) => !!list.lastUsed)
          .sort((a, b) => new Date(b.lastUsed!).getTime() - new Date(a.lastUsed!).getTime())
          .forEach((list) => {
            const vendorId = list.vendorId;
            if (!vendorId || seenVendors.has(vendorId)) return;
            seenVendors.add(vendorId);

            const vendor = vendors.find((v) => v.id === vendorId);
            const listVendorIds = new Set<string>();
            if (list.items) {
              list.items.forEach((item) => {
                const vid = item.product?.vendorId || list.vendorId || vendorId;
                if (vid) listVendorIds.add(vid);
              });
            }

            const logos = Array.from(listVendorIds)
              .map((vid) => vendors.find((v) => v.id === vid)?.logo)
              .filter(Boolean) as string[];

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

      try {
        const savedViewed = localStorage.getItem('horeca_recently_viewed');
        if (savedViewed) {
          type ViewedEntry = {
            vendorId?: string;
            vendorName?: string;
            vendorLogo?: string;
            viewedAt?: number;
            viewedProducts?: Array<{ name: string }>;
          };
          const viewedEntries: ViewedEntry[] = JSON.parse(savedViewed);
          viewedEntries.forEach((entry) => {
            const vendorId = entry.vendorId;
            if (!vendorId) return;

            const products = entry.viewedProducts || [];
            let productLabel = 'Recently Viewed';
            if (products.length === 1) {
              productLabel = `Recently Viewed • ${products[0].name}`;
            } else if (products.length > 1) {
              productLabel = `Recently Viewed • ${products[0].name} + ${products.length - 1} more`;
            }

            const finalSubtitle2 = getRelativeTime(entry.viewedAt || 0);

            if (seenVendors.has(vendorId)) {
              const existing = allCards.find((c) => c.vendorId === vendorId);
              if (existing) {
                existing.subtitle = productLabel;
                existing.subtitle2 = finalSubtitle2;
                existing.subtitleIcon = 'viewed';
                existing.href =
                  products.length > 0 ? `/recently-viewed/${entry.vendorId}` : `/vendor/${entry.vendorId}`;
                if ((entry.viewedAt ?? 0) > existing.timestamp) {
                  existing.timestamp = entry.viewedAt ?? 0;
                }
              }
            } else {
              seenVendors.add(vendorId);
              allCards.push({
                id: `viewed-${vendorId}`,
                vendorId,
                vendorName: entry.vendorName || 'Vendor',
                vendorLogo: entry.vendorLogo || vendors.find((v) => v.id === vendorId)?.logo || '',
                coverImage: vendors.find((v) => v.id === vendorId)?.coverImage,
                subtitle: productLabel,
                subtitle2: finalSubtitle2,
                subtitleIcon: 'viewed',
                href: products.length > 0 ? `/recently-viewed/${entry.vendorId}` : `/vendor/${entry.vendorId}`,
                priority: 4,
                timestamp: entry.viewedAt || 0,
              });
            }
          });
        }
      } catch (e) {
        console.error('Failed to parse recently viewed:', e);
      }

      allCards.sort((a, b) => b.timestamp - a.timestamp);
      setCards(allCards);
    };

    buildCards();

    window.addEventListener('storage', buildCards);
    window.addEventListener('focus', buildCards);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') buildCards();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', buildCards);
      window.removeEventListener('focus', buildCards);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isMounted, isLoggedIn, cartGroups, pathname, vendors, orderLists, pastOrders]);

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
          <SectionHeader title="Continue Ordering" actionLabel="View all →" actionHref="/continue-ordering" />
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

          <div ref={scrollRef} onScroll={checkScroll} className="overflow-x-auto no-scrollbar scroll-smooth w-full">
            <div className="flex flex-nowrap gap-2.5 md:gap-3 py-2 px-4 md:px-[var(--container-padding)] w-max">
              {cards.map((card) => {
                const vendor = vendors.find((v) => v.id === card.vendorId);
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
                                left: i === 1 || i === 3 ? '42%' : '6%',
                                top: i === 2 || i === 3 ? '42%' : '6%',
                                zIndex: 4 - i,
                              }}
                            />
                          ))}
                        </div>
                      ) : logo ? (
                        <img src={logo} alt="" className="w-full h-full object-contain p-1" />
                      ) : (
                        <span className="text-[15px] font-bold text-primary">{card.vendorName?.[0] || '?'}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[14px] md:text-[15px] font-bold text-[#1C1C1C] leading-tight line-clamp-1 group-hover:text-primary">
                        {card.vendorName}
                      </p>
                      <p className="text-[12px] text-[#667085] mt-0.5 line-clamp-1">{lineFor(card)}</p>
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
