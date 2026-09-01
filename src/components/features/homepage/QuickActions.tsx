'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, ListOrdered, Store, BadgePercent } from 'lucide-react';
import { useStableSession } from '@/hooks/useStableSession';
import { cn } from '@/lib/utils';

export function QuickActions() {
    const { isAuthenticated } = useStableSession();
    const isLoggedIn = isAuthenticated;
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        queueMicrotask(() => setIsMounted(true));
    }, []);

    const actions = [
        {
            href: '/orders',
            icon: RotateCcw,
            label: 'Reorder',
            desc: 'From last order',
            gradient: 'from-emerald-500 to-green-600',
            shadowColor: 'shadow-emerald-500/20',
            bgClass: 'bg-gradient-to-br from-emerald-50 to-green-50',
            borderHover: 'hover:border-emerald-300',
        },
        {
            href: '/order-lists',
            icon: ListOrdered,
            label: 'Quick Order',
            desc: 'Order lists',
            gradient: 'from-violet-500 to-purple-600',
            shadowColor: 'shadow-violet-500/20',
            bgClass: 'bg-gradient-to-br from-violet-50 to-purple-50',
            borderHover: 'hover:border-violet-300',
        },
        {
            href: '/vendors',
            icon: Store,
            label: 'My Vendors',
            desc: 'Saved vendors',
            gradient: 'from-amber-500 to-orange-600',
            shadowColor: 'shadow-amber-500/20',
            bgClass: 'bg-gradient-to-br from-amber-50 to-orange-50',
            borderHover: 'hover:border-amber-300',
        },
        {
            href: '/deals',
            icon: BadgePercent,
            label: 'Deals & Discounts',
            desc: 'Coupons & offers',
            gradient: 'from-[#53B175] to-emerald-700',
            shadowColor: 'shadow-emerald-500/20',
            bgClass: 'bg-gradient-to-br from-amber-50 to-green-50',
            borderHover: 'hover:border-[#53B175]',
        },
    ];

    if (!isMounted || !isLoggedIn) return null;

    return (
        <section className="w-full py-4 md:py-6 bg-white">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-5 lg:gap-6">
                    {actions.map((action) => (
                        <Link
                            key={action.label}
                            href={action.href}
                            className={cn(
                                "group relative flex flex-col md:flex-row items-center gap-2 md:gap-5 p-3 md:p-5 lg:p-6",
                                "md:min-w-0",
                                "rounded-2xl md:rounded-[24px]",
                                action.bgClass,
                                "border border-gray-100/80",
                                "shadow-sm hover:shadow-xl",
                                action.shadowColor,
                                "hover:-translate-y-1 active:scale-[0.97]",
                                "transition-all duration-300 ease-out",
                                action.borderHover
                            )}
                        >
                            {/* Decorative dot - top right */}
                            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white border-2 border-gray-100 hidden md:block group-hover:scale-110 transition-transform" />

                            {/* Icon */}
                            <div className={cn(
                                "relative w-10 h-10 min-[340px]:w-12 min-[340px]:h-12 md:w-16 md:h-16",
                                "rounded-xl md:rounded-2xl",
                                "flex items-center justify-center shrink-0",
                                "bg-gradient-to-br text-white",
                                action.gradient,
                                "shadow-lg",
                                action.shadowColor,
                                "group-hover:scale-110 group-hover:rotate-[-3deg]",
                                "transition-all duration-500 ease-out"
                            )}>
                                <action.icon
                                    className="w-5 h-5 md:w-7 md:h-7"
                                    strokeWidth={2.5}
                                    absoluteStrokeWidth
                                />
                                {/* Inner glow */}
                                <div className="absolute inset-0 rounded-xl md:rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>

                            {/* Text */}
                            <div className="text-center md:text-left min-w-0">
                                <p className={cn(
                                    "text-[12px] min-[340px]:text-[14px] md:text-[17px] lg:text-[19px]",
                                    "font-[900] tracking-tight text-[#181725]",
                                    "leading-tight",
                                    "group-hover:text-[#53B175] transition-colors duration-300"
                                )}>
                                    {action.label}
                                </p>
                                <p className={cn(
                                    "text-[9px] min-[340px]:text-[10px] md:text-[13px] lg:text-[14px]",
                                    "text-gray-400 font-semibold leading-tight line-clamp-1 mt-0.5"
                                )}>
                                    {action.desc}
                                </p>
                            </div>

                            {/* Mobile hover overlay indicator */}
                            <div className="absolute inset-0 rounded-2xl md:rounded-[24px] bg-black/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
