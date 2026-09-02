'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, X, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';

export function StickyCartBar() {
    const { totalItems, totalAmount, vendorCount, isCartLoading } = useCart();
    const [hidden, setHidden] = useState(false);

    // Hold last known totals while a context-switch load clears the cart briefly.
    const [lastKnown, setLastKnown] = useState({ totalItems, totalAmount, vendorCount });
    if (
        !isCartLoading &&
        (lastKnown.totalItems !== totalItems ||
            lastKnown.totalAmount !== totalAmount ||
            lastKnown.vendorCount !== vendorCount)
    ) {
        setLastKnown({ totalItems, totalAmount, vendorCount });
    }
    const display = isCartLoading ? lastKnown : { totalItems, totalAmount, vendorCount };

    if (display.totalItems === 0) return null;

    if (hidden) {
        return (
            <button
                type="button"
                onClick={() => setHidden(false)}
                aria-label="Show cart bar"
                className="fixed z-50 bottom-4 right-4 w-12 h-12 rounded-full bg-primary text-white shadow-cdl-3 flex items-center justify-center hover:bg-primary-dark transition-colors"
            >
                <ShoppingCart size={18} />
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-white text-primary text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-primary">
                    {display.totalItems}
                </span>
            </button>
        );
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:bottom-4 md:left-auto md:right-4 md:max-w-[420px]">
            <div className="relative bg-primary md:rounded-2xl shadow-cdl-3">
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setHidden(true); }}
                    aria-label="Hide cart bar"
                    className={cn(
                        'absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors z-10',
                        'md:-top-2 md:right-2 md:translate-y-0 md:w-6 md:h-6 md:bg-white md:text-primary md:shadow-md md:hover:bg-gray-50'
                    )}
                >
                    <X size={14} strokeWidth={2.5} />
                </button>

                <Link
                    href="/cart"
                    className="flex items-center gap-3 pl-4 pr-12 py-3 md:py-3.5"
                >
                    <div className="relative shrink-0">
                        <ShoppingCart size={20} className="text-white" strokeWidth={2} />
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-white text-primary text-[10px] font-bold rounded-full flex items-center justify-center">
                            {display.totalItems}
                        </span>
                    </div>

                    <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-white text-xs md:text-sm font-bold truncate">
                            {display.totalItems} item{display.totalItems > 1 ? 's' : ''}
                            {display.vendorCount > 1 ? ` · ${display.vendorCount} stores` : ''}
                        </p>
                        <p className="text-white/80 text-[11px] font-medium">
                            ₹{display.totalAmount.toLocaleString('en-IN')}
                        </p>
                    </div>

                    <span className="bg-white text-primary px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wider shadow-sm hover:shadow transition-shadow shrink-0 flex items-center gap-1">
                        VIEW <ChevronUp size={12} strokeWidth={2.5} className="rotate-90" />
                    </span>
                </Link>
            </div>
        </div>
    );
}
