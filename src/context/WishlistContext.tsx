'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import type { VendorProduct } from '@/types';
import { wishlistStorageKey, migrateLegacyKey } from '@/lib/userScopedStorage';

interface WishlistContextType {
    wishlist: VendorProduct[];
    addToWishlist: (product: VendorProduct) => void;
    removeFromWishlist: (productId: string) => void;
    isInWishlist: (productId: string) => boolean;
    toggleWishlist: (product: VendorProduct) => void;
    clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

function readWishlist(userId?: string | null): VendorProduct[] {
    try {
        migrateLegacyKey('wishlist', wishlistStorageKey(null));
        const saved = typeof window !== 'undefined' ? localStorage.getItem(wishlistStorageKey(userId)) : null;
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        console.error('Failed to parse wishlist', e);
    }
    return [];
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const userId = status === 'authenticated' ? (session?.user?.id ?? null) : null;
    const [wishlist, setWishlist] = useState<VendorProduct[]>([]);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (status === 'loading') return;
        Promise.resolve().then(() => {
            setWishlist(readWishlist(userId));
            setReady(true);
        });
    }, [status, userId]);

    useEffect(() => {
        if (!ready) return;
        try {
            localStorage.setItem(wishlistStorageKey(userId), JSON.stringify(wishlist));
        } catch { /* ignore */ }
    }, [wishlist, ready, userId]);

    const addToWishlist = useCallback((product: VendorProduct) => {
        setWishlist(prev => {
            if (prev.find(p => p.id === product.id)) return prev;
            return [...prev, product];
        });
    }, []);

    const removeFromWishlist = useCallback((productId: string) => {
        setWishlist(prev => prev.filter(p => p.id !== productId));
    }, []);

    const wishlistIds = useMemo(() => new Set(wishlist.map(p => p.id)), [wishlist]);

    const isInWishlist = useCallback((productId: string) => {
        return wishlistIds.has(productId);
    }, [wishlistIds]);

    const toggleWishlist = useCallback((product: VendorProduct) => {
        if (wishlistIds.has(product.id)) {
            removeFromWishlist(product.id);
        } else {
            addToWishlist(product);
        }
    }, [wishlistIds, removeFromWishlist, addToWishlist]);

    const clearWishlist = useCallback(() => {
        setWishlist([]);
    }, []);

    const value = useMemo(() => ({
        wishlist, addToWishlist, removeFromWishlist, isInWishlist, toggleWishlist, clearWishlist,
    }), [wishlist, addToWishlist, removeFromWishlist, isInWishlist, toggleWishlist, clearWishlist]);

    return (
        <WishlistContext.Provider value={value}>
            {children}
        </WishlistContext.Provider>
    );
}

export function useWishlist() {
    const context = useContext(WishlistContext);
    if (context === undefined) {
        throw new Error('useWishlist must be used within a WishlistProvider');
    }
    return context;
}
