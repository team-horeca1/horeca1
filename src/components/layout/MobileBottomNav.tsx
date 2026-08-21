'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';


interface MobileBottomNavProps {
    onCategoriesClick?: () => void;
    onStoreClick?: () => void;
    onAccountClick?: () => void;
    isCategoriesOpen?: boolean;
}

export function MobileBottomNav({ onCategoriesClick, onStoreClick, onAccountClick, isCategoriesOpen }: MobileBottomNavProps) {
    const pathname = usePathname();

    // Hide on cart, shipment, order list detail, and recently viewed pages (they have their own fixed CTA buttons)
    if (pathname === '/cart' || pathname?.includes('/cart/shipment/') || pathname?.includes('/order-lists/') || pathname?.includes('/recently-viewed/')) return null;


    const navItems = [
        {
            id: 'home',
            label: 'Home',
            icon: '/images/mobile-nav/home.svg',
            href: '/',
        },
        {
            id: 'categories',
            label: 'Categories',
            icon: '/images/mobile-nav/catagories.svg',
            href: '/category',
            onClick: onCategoriesClick,
        },
        {
            id: 'order',
            label: 'Order',
            icon: '/images/mobile-nav/order.svg',
            href: '/orders',
        },
        {
            id: 'profile',
            label: 'Profile',
            icon: '/images/mobile-nav/profile.svg',
            href: '/profile',
            onClick: onAccountClick,
        }
    ];

    return (
        <div
            className="lg:hidden fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-gray-100 pb-safe-area-inset-bottom h-[72px]"
            style={{
                boxShadow: '0 -4px 20px rgba(0,0,0,0.05)',
                transform: 'translate3d(0, 0, 0)',
                WebkitBackfaceVisibility: 'hidden'
            }}
        >
            <div className="flex items-center justify-around h-full px-4">
                {navItems.map((item) => {
                    const isActive = item.id === 'categories'
                        ? (isCategoriesOpen || pathname?.startsWith(item.href))
                        : (item.href === '/'
                            ? pathname === '/'
                            : pathname?.startsWith(item.href));

                    const content = (
                        <div className="flex flex-col items-center justify-center">
                            <div
                                className="transition-all duration-300"
                                style={{
                                    backgroundColor: isActive ? '#53B175' : '#181725',
                                    maskImage: `url(${item.icon})`,
                                    WebkitMaskImage: `url(${item.icon})`,
                                    maskRepeat: 'no-repeat',
                                    WebkitMaskRepeat: 'no-repeat',
                                    maskSize: 'contain',
                                    WebkitMaskSize: 'contain',
                                    maskPosition: 'center',
                                    WebkitMaskPosition: 'center',
                                    height: '40px',
                                    width: item.id === 'categories' ? '60px' : '35px',
                                }}
                            />
                        </div>
                    );

                    if ('onClick' in item && item.onClick) {
                        return (
                            <button
                                key={item.id}
                                onClick={(e) => {
                                    e.preventDefault();
                                    item.onClick?.();
                                }}
                                className="flex-1 flex flex-col items-center justify-center h-full active:scale-95 transition-transform border-none bg-transparent outline-none"
                            >
                                {content}
                            </button>
                        );
                    }

                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            className="flex-1 flex flex-col items-center justify-center h-full active:scale-95 transition-transform"
                        >
                            {content}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

