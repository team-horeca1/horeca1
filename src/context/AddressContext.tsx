'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { notifyAccountsRefresh } from '@/lib/addressUsability';
import {
    addressSelectedKey,
    addressSavedKey,
    migrateLegacyKey,
} from '@/lib/userScopedStorage';
import {
    isAdminBuyerImpersonationActive,
    IMPERSONATION_CHANGED_EVENT,
} from '@/lib/clearImpersonation';
import { subscribeAuthTabEvents } from '@/lib/authTabSync';
import { useStableSession } from '@/hooks/useStableSession';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Address {
    id: string;
    /** Present when this row is backed by a business-account Outlet. */
    outletId?: string;
    label: string;
    businessName?: string;  // Auto-filled from Google Places (restaurant/hotel/cafe name)
    fullAddress: string;
    shortAddress: string;
    latitude: number;
    longitude: number;
    flatInfo?: string;
    landmark?: string;
    pincode?: string;
    city?: string;
    state?: string;
    placeId?: string;
    isDefault?: boolean;
}

interface AddressContextType {
    selectedAddress: Address | null;
    savedAddresses: Address[];
    isLoadingAddresses: boolean;
    setSelectedAddress: (address: Address | null) => void;
    addAddress: (address: Omit<Address, 'id'>) => Promise<Address | null>;
    removeAddress: (id: string) => Promise<void>;
    updateAddress: (id: string, updates: Partial<Address>) => Promise<void>;
    detectCurrentLocation: () => Promise<Address | null>;
    isDetectingLocation: boolean;
    reverseGeocode: (lat: number, lng: number) => Promise<Partial<Address> | null>;
    geocodePincode: (pincode: string) => Promise<Partial<Address> | null>;
    refreshAddresses: () => Promise<void>;
}

const AddressContext = createContext<AddressContextType | undefined>(undefined);

function pickDefaultAddress(addresses: Address[]): Address | null {
    return addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

function persistSelectedAddress(userId: string | null, address: Address | null) {
    try {
        if (address) {
            localStorage.setItem(addressSelectedKey(userId), JSON.stringify(address));
        } else {
            localStorage.removeItem(addressSelectedKey(userId));
        }
    } catch { /* ignore */ }
}

function pickAddressForOutlet(
    addresses: Address[],
    outletId: string | null | undefined,
): Address | null {
    if (outletId) {
        const match = addresses.find((a) => a.outletId === outletId);
        if (match) return match;
    }
    return pickDefaultAddress(addresses);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AddressProvider({ children }: { children: React.ReactNode }) {
    const { session, isAuthenticated, isResolved } = useStableSession();
    const userId = session?.user?.id ?? null;
    const activeOutletId = session?.user?.activeOutletId ?? null;
    const [selectedAddress, setSelectedAddressState] = useState<Address | null>(null);
    const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
    const [isDetectingLocation] = useState(false);
    const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
    const [buyerImpersonating, setBuyerImpersonating] = useState(false);
    const impersonatingRef = useRef(false);
    const lastLoadKeyRef = useRef<string | null>(null);

    // ─── DB Sync Helpers ─────────────────────────────────────────────────

    const fetchAddressesFromDB = useCallback(async (): Promise<Address[]> => {
        try {
            const res = await fetch('/api/v1/addresses');
            if (!res.ok) return [];
            const json = await res.json();
            return (json.data || []).map((a: Record<string, unknown>): Address => ({
                id: a.id as string,
                outletId: (a.outletId as string | undefined) ?? undefined,
                label: a.label as string,
                businessName: a.businessName as string | undefined,
                fullAddress: a.fullAddress as string,
                shortAddress: (a.shortAddress ?? '') as string,
                latitude: a.latitude as number,
                longitude: a.longitude as number,
                flatInfo: a.flatInfo as string | undefined,
                landmark: a.landmark as string | undefined,
                pincode: a.pincode as string | undefined,
                city: a.city as string | undefined,
                state: a.state as string | undefined,
                placeId: a.placeId as string | undefined,
                isDefault: a.isDefault as boolean,
            }));
        } catch {
            return [];
        }
    }, []);

    useEffect(() => {
        const sync = () => {
            const active = isAdminBuyerImpersonationActive();
            impersonatingRef.current = active;
            setBuyerImpersonating(active);
        };
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

    // ─── Load addresses on mount / identity / impersonation change ───────
    // Do not refetch when Auth.js flips status to loading during update().

    useEffect(() => {
        if (!isResolved) return;
        migrateLegacyKey('horeca1_selected_address', addressSelectedKey(null));
        migrateLegacyKey('horeca1_saved_addresses', addressSavedKey(null));

        const impersonating = buyerImpersonating || isAdminBuyerImpersonationActive();
        const loadKey = `${userId ?? 'guest'}|${impersonating ? '1' : '0'}|${isAuthenticated ? '1' : '0'}`;
        if (lastLoadKeyRef.current === loadKey) return;
        lastLoadKeyRef.current = loadKey;

        // While viewing as a customer, never hydrate the admin's localStorage
        // selection — it mixes with the customer address list from the API.
        if (!impersonating) {
            try {
                const savedSelected = localStorage.getItem(addressSelectedKey(userId));
                if (savedSelected) {
                    Promise.resolve().then(() => setSelectedAddressState(JSON.parse(savedSelected)));
                } else {
                    Promise.resolve().then(() => setSelectedAddressState(null));
                }
            } catch { /* ignore */ }
        } else {
            Promise.resolve().then(() => setSelectedAddressState(null));
        }

        if (isAuthenticated) {
            Promise.resolve().then(() => setIsLoadingAddresses(true));
            fetchAddressesFromDB().then((addresses) => {
                setSavedAddresses(addresses);
                setIsLoadingAddresses(false);
                const defaultAddr = pickDefaultAddress(addresses);
                if (impersonating) {
                    // Always align selection to the customer list (default/primary).
                    if (defaultAddr) {
                        setSelectedAddressState(defaultAddr);
                    }
                    return;
                }
                if (defaultAddr) {
                    setSelectedAddressState(prev => {
                        const freshMatch = prev
                            ? addresses.find((a) => a.id === prev.id) ?? null
                            : null;
                        const next = pickAddressForOutlet(addresses, activeOutletId)
                            ?? freshMatch
                            ?? defaultAddr;
                        persistSelectedAddress(userId, next);
                        return next;
                    });
                }
            });
        } else {
            try {
                const savedList = localStorage.getItem(addressSavedKey(null));
                if (savedList) Promise.resolve().then(() => setSavedAddresses(JSON.parse(savedList)));
                else Promise.resolve().then(() => setSavedAddresses([]));
            } catch { /* ignore */ }
        }
    }, [isResolved, isAuthenticated, userId, fetchAddressesFromDB, buyerImpersonating, activeOutletId]);

    // Keep "Deliver to" on the active outlet after business / outlet switches.
    useEffect(() => {
        if (!isAuthenticated || buyerImpersonating || savedAddresses.length === 0) return;
        Promise.resolve().then(() => setSelectedAddressState((prev) => {
            if (activeOutletId) {
                const match = savedAddresses.find((a) => a.outletId === activeOutletId);
                if (match) {
                    if (prev?.id === match.id) return prev;
                    persistSelectedAddress(userId, match);
                    return match;
                }
                if (prev?.outletId && prev.outletId !== activeOutletId) {
                    persistSelectedAddress(userId, null);
                    return null;
                }
                return prev;
            }
            if (prev?.outletId) {
                persistSelectedAddress(userId, null);
                return null;
            }
            return prev;
        }));
    }, [activeOutletId, savedAddresses, isAuthenticated, buyerImpersonating, userId]);

    // ─── Sync the selected delivery address into a cookie ────────────────
    // The server reads `h1_addr` (a SavedAddress id) to drive location-based
    // pricing off the chosen "Deliver to" address. Only real DB ids (UUIDs)
    // are written; guest/local ids are ignored so they never mislead pricing.
    useEffect(() => {
        try {
            const id = selectedAddress?.id;
            const isDbId = !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            document.cookie = isDbId
                ? `h1_addr=${id}; path=/; max-age=31536000; SameSite=Lax`
                : 'h1_addr=; path=/; max-age=0; SameSite=Lax';
        } catch { /* ignore */ }
    }, [selectedAddress]);

    // ─── refreshAddresses ────────────────────────────────────────────────

    const refreshAddresses = useCallback(async () => {
        if (!isAuthenticated) return;
        const addresses = await fetchAddressesFromDB();
        setSavedAddresses(addresses);
        const defaultAddr = pickDefaultAddress(addresses);
        setSelectedAddressState((prev) => {
            const freshMatch = prev
                ? addresses.find((a) => a.id === prev.id) ?? null
                : null;
            if (impersonatingRef.current) {
                return freshMatch ?? defaultAddr;
            }
            const next = pickAddressForOutlet(addresses, activeOutletId) ?? freshMatch ?? defaultAddr;
            persistSelectedAddress(userId, next);
            return next;
        });
    }, [isAuthenticated, fetchAddressesFromDB, userId, activeOutletId]);

    // ─── setSelectedAddress ──────────────────────────────────────────────

    const setSelectedAddress = useCallback((address: Address | null) => {
        setSelectedAddressState(address);
        // Don't overwrite the admin's localStorage selection while impersonating.
        if (impersonatingRef.current) return;
        try {
            if (address) {
                localStorage.setItem(addressSelectedKey(userId), JSON.stringify(address));
            } else {
                localStorage.removeItem(addressSelectedKey(userId));
            }
        } catch { /* ignore */ }
    }, [userId]);

    // ─── addAddress ──────────────────────────────────────────────────────

    const addAddress = useCallback(async (address: Omit<Address, 'id'>): Promise<Address | null> => {
        if (isAuthenticated) {
            try {
                const res = await fetch('/api/v1/addresses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        label: address.label,
                        businessName: address.businessName,
                        fullAddress: address.fullAddress,
                        shortAddress: address.shortAddress,
                        flatInfo: address.flatInfo,
                        landmark: address.landmark,
                        pincode: address.pincode,
                        city: address.city,
                        state: address.state,
                        latitude: address.latitude,
                        longitude: address.longitude,
                        placeId: address.placeId,
                        isDefault: address.isDefault ?? false,
                    }),
                });
                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    toast.error(
                        (json as { error?: { message?: string } }).error?.message
                        ?? 'Failed to save address',
                    );
                    return null;
                }
                const json = await res.json();
                const saved: Address = {
                    id: json.data.id,
                    outletId: json.data.outletId ?? undefined,
                    label: json.data.label,
                    businessName: json.data.businessName ?? undefined,
                    fullAddress: json.data.fullAddress,
                    shortAddress: json.data.shortAddress ?? undefined,
                    latitude: json.data.latitude,
                    longitude: json.data.longitude,
                    flatInfo: json.data.flatInfo ?? undefined,
                    landmark: json.data.landmark ?? undefined,
                    pincode: json.data.pincode ?? undefined,
                    city: json.data.city ?? undefined,
                    state: json.data.state ?? undefined,
                    placeId: json.data.placeId ?? undefined,
                    isDefault: json.data.isDefault,
                };
                setSavedAddresses(prev => {
                    const filtered = address.isDefault ? prev.map(a => ({ ...a, isDefault: false })) : prev;
                    return [saved, ...filtered];
                });
                notifyAccountsRefresh();
                return saved;
            } catch {
                toast.error('Failed to save address');
                return null;
            }
        } else {
            // localStorage fallback for unauthenticated users
            const newAddr: Address = { ...address, id: `addr_${Date.now()}` };
            setSavedAddresses(prev => {
                const updated = [...prev, newAddr];
                try { localStorage.setItem(addressSavedKey(null), JSON.stringify(updated)); } catch { /* ignore */ }
                return updated;
            });
            return newAddr;
        }
    }, [isAuthenticated]);

    // ─── removeAddress ───────────────────────────────────────────────────

    const removeAddress = useCallback(async (id: string): Promise<void> => {
        if (isAuthenticated) {
            const res = await fetch(`/api/v1/addresses/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                toast.error((json as { error?: { message?: string } }).error?.message ?? 'Failed to remove address');
                return;
            }
        }
        setSavedAddresses(prev => {
            let remaining = prev.filter(a => a.id !== id);
            // Mirror server DELETE promotion: keep exactly one local default.
            if (remaining.length > 0 && !remaining.some(a => a.isDefault)) {
                remaining = remaining.map((a, i) => ({ ...a, isDefault: i === 0 }));
            }
            if (!isAuthenticated) {
                try { localStorage.setItem(addressSavedKey(null), JSON.stringify(remaining)); } catch { /* ignore */ }
            }
            // If the removed address was selected, fall back to remaining default / first.
            Promise.resolve().then(() => {
                setSelectedAddressState(sel => {
                    if (sel?.id !== id) return sel;
                    const fallback = pickDefaultAddress(remaining);
                    if (!impersonatingRef.current) {
                        try {
                            if (fallback) {
                                localStorage.setItem(addressSelectedKey(userId), JSON.stringify(fallback));
                            } else {
                                localStorage.removeItem(addressSelectedKey(userId));
                            }
                        } catch { /* ignore */ }
                    }
                    return fallback;
                });
            });
            return remaining;
        });
        notifyAccountsRefresh();
    }, [isAuthenticated, userId]);

    // ─── updateAddress ───────────────────────────────────────────────────

    const updateAddress = useCallback(async (id: string, updates: Partial<Address>): Promise<void> => {
        if (isAuthenticated) {
            const res = await fetch(`/api/v1/addresses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                toast.error((json as { error?: { message?: string } }).error?.message ?? 'Failed to update address');
                return;
            }
        }
        setSavedAddresses(prev => {
            // Mirror addAddress / server PATCH: only one local default at a time.
            const cleared = updates.isDefault === true
                ? prev.map((a) => (a.id === id ? a : { ...a, isDefault: false }))
                : prev;
            const updated = cleared.map((a) => (a.id === id ? { ...a, ...updates } : a));
            if (!isAuthenticated) {
                try { localStorage.setItem(addressSavedKey(null), JSON.stringify(updated)); } catch { /* ignore */ }
            }
            return updated;
        });
        // Keep navbar "Deliver to" in sync when the selected address was edited.
        setSelectedAddressState(prev => {
            if (!prev || prev.id !== id) return prev;
            const merged = { ...prev, ...updates };
            if (!impersonatingRef.current) {
                try { localStorage.setItem(addressSelectedKey(userId), JSON.stringify(merged)); } catch { /* ignore */ }
            }
            return merged;
        });
        notifyAccountsRefresh();
    }, [isAuthenticated, userId]);

    // ─── Reverse Geocode ─────────────────────────────────────────────────

    const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<Partial<Address> | null> => {
        void lat;
        void lng;
        return null;
    }, []);

    // ─── Forward Geocode a Pincode ───────────────────────────────────────
    // Resolves a bare 6-digit pincode to a real location (city/state/lat/lng)
    // so the "Deliver to" chip never shows a fabricated default area.
    const geocodePincode = useCallback(async (pincode: string): Promise<Partial<Address> | null> => {
        try {
            const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
            const data = await res.json() as Array<{ PostOffice?: Array<{ District?: string; Division?: string; State?: string; Name?: string }> }>;
            const po = data?.[0]?.PostOffice?.[0];
            const city = po?.District || po?.Division || '';
            const state = po?.State || '';
            const shortAddr = [po?.Name, city, state].filter(Boolean).join(', ') || `Pincode ${pincode}`;
            return {
                fullAddress: shortAddr,
                shortAddress: shortAddr,
                latitude: 0,
                longitude: 0,
                pincode,
                city,
                state,
            };
        } catch {
            return null;
        }
    }, []);

    // ─── Detect Current Location ─────────────────────────────────────────

    const detectCurrentLocation = useCallback(async (): Promise<Address | null> => {
        toast.error('Type the address instead of using GPS.');
        return null;
    }, []);

    const value = useMemo(() => ({
        selectedAddress,
        savedAddresses,
        isLoadingAddresses,
        setSelectedAddress,
        addAddress,
        removeAddress,
        updateAddress,
        detectCurrentLocation,
        isDetectingLocation,
        reverseGeocode,
        geocodePincode,
        refreshAddresses,
    }), [
        selectedAddress,
        savedAddresses,
        isLoadingAddresses,
        setSelectedAddress,
        addAddress,
        removeAddress,
        updateAddress,
        detectCurrentLocation,
        isDetectingLocation,
        reverseGeocode,
        geocodePincode,
        refreshAddresses,
    ]);

    return (
        <AddressContext.Provider value={value}>
            {children}
        </AddressContext.Provider>
    );
}

export function useAddress() {
    const context = useContext(AddressContext);
    if (context === undefined) {
        throw new Error('useAddress must be used within an AddressProvider');
    }
    return context;
}
