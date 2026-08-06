'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useGoogleMaps } from '@/components/providers/GoogleMapsProvider';
import { toast } from 'sonner';
import { notifyAccountsRefresh } from '@/lib/addressUsability';
import {
    addressSelectedKey,
    addressSavedKey,
    migrateLegacyKey,
} from '@/lib/userScopedStorage';
import {
    isAdminCustomerImpersonationActive,
    IMPERSONATION_CHANGED_EVENT,
} from '@/lib/clearImpersonation';
import { subscribeAuthTabEvents } from '@/lib/authTabSync';

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

// ─── Provider ────────────────────────────────────────────────────────────────

export function AddressProvider({ children }: { children: React.ReactNode }) {
    const { isLoaded, google } = useGoogleMaps();
    const { data: session, status } = useSession();
    const userId = status === 'authenticated' ? (session?.user?.id ?? null) : null;
    const [selectedAddress, setSelectedAddressState] = useState<Address | null>(null);
    const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
    const [isDetectingLocation, setIsDetectingLocation] = useState(false);
    const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
    const [customerImpersonating, setCustomerImpersonating] = useState(false);
    const impersonatingRef = useRef(false);

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
            const active = isAdminCustomerImpersonationActive();
            impersonatingRef.current = active;
            setCustomerImpersonating(active);
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

    // ─── Load addresses on mount / session / impersonation change ────────

    useEffect(() => {
        if (status === 'loading') return;
        migrateLegacyKey('horeca1_selected_address', addressSelectedKey(null));
        migrateLegacyKey('horeca1_saved_addresses', addressSavedKey(null));

        const impersonating = customerImpersonating || isAdminCustomerImpersonationActive();

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

        if (status === 'authenticated') {
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
                        // Drop orphan selections that aren't in the fetched list.
                        // When id still matches, use the fresh DB row (not a stale localStorage blob).
                        const freshMatch = prev
                            ? addresses.find((a) => a.id === prev.id) ?? null
                            : null;
                        const next = freshMatch ?? defaultAddr;
                        try { localStorage.setItem(addressSelectedKey(userId), JSON.stringify(next)); } catch { /* ignore */ }
                        return next;
                    });
                }
            });
        } else if (status === 'unauthenticated') {
            try {
                const savedList = localStorage.getItem(addressSavedKey(null));
                if (savedList) Promise.resolve().then(() => setSavedAddresses(JSON.parse(savedList)));
                else Promise.resolve().then(() => setSavedAddresses([]));
            } catch { /* ignore */ }
        }
    }, [status, userId, fetchAddressesFromDB, customerImpersonating]);

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
        if (status !== 'authenticated') return;
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
            const next = freshMatch ?? defaultAddr;
            if (next) {
                try { localStorage.setItem(addressSelectedKey(userId), JSON.stringify(next)); } catch { /* ignore */ }
            }
            return next;
        });
    }, [status, fetchAddressesFromDB, userId]);

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
        if (status === 'authenticated') {
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
    }, [status]);

    // ─── removeAddress ───────────────────────────────────────────────────

    const removeAddress = useCallback(async (id: string): Promise<void> => {
        if (status === 'authenticated') {
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
            if (status !== 'authenticated') {
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
    }, [status, userId]);

    // ─── updateAddress ───────────────────────────────────────────────────

    const updateAddress = useCallback(async (id: string, updates: Partial<Address>): Promise<void> => {
        if (status === 'authenticated') {
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
            if (status !== 'authenticated') {
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
    }, [status, userId]);

    // ─── Reverse Geocode ─────────────────────────────────────────────────

    const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<Partial<Address> | null> => {
        if (!isLoaded || !google) return null;

        try {
            const geocoder = new google.maps.Geocoder();
            const response = await geocoder.geocode({ location: { lat, lng } });

            if (response.results && response.results.length > 0) {
                const result = response.results[0];
                const components = result.address_components;

                const locality = components?.find(c => c.types.includes('locality'));
                const sublocality = components?.find(c =>
                    c.types.includes('sublocality_level_1') || c.types.includes('sublocality')
                );
                const postalCode = components?.find(c => c.types.includes('postal_code'));
                const stateComp = components?.find(c => c.types.includes('administrative_area_level_1'));

                const pincode = postalCode?.long_name || '';
                const city = locality?.long_name || '';
                const state = stateComp?.long_name || '';
                let shortAddr = '';
                if (sublocality && locality) {
                    shortAddr = `${sublocality.long_name}, ${locality.long_name}`;
                } else if (locality) {
                    shortAddr = locality.long_name;
                } else {
                    shortAddr = result.formatted_address.split(',').slice(0, 2).join(',');
                }

                return {
                    fullAddress: result.formatted_address,
                    shortAddress: shortAddr,
                    latitude: lat,
                    longitude: lng,
                    pincode,
                    city,
                    state,
                    placeId: result.place_id,
                };
            }
            return null;
        } catch (error) {
            console.error('Reverse geocode failed:', error);
            return null;
        }
    }, [isLoaded, google]);

    // ─── Forward Geocode a Pincode ───────────────────────────────────────
    // Resolves a bare 6-digit pincode to a real location (city/state/lat/lng)
    // so the "Deliver to" chip never shows a fabricated default area.
    const geocodePincode = useCallback(async (pincode: string): Promise<Partial<Address> | null> => {
        if (!isLoaded || !google) return null;

        try {
            const geocoder = new google.maps.Geocoder();
            const response = await geocoder.geocode({
                componentRestrictions: { country: 'IN', postalCode: pincode },
            });

            if (response.results && response.results.length > 0) {
                const result = response.results[0];
                const loc = result.geometry.location;
                const components = result.address_components;

                const locality = components?.find(c => c.types.includes('locality'));
                const sublocality = components?.find(c =>
                    c.types.includes('sublocality_level_1') || c.types.includes('sublocality')
                );
                const stateComp = components?.find(c => c.types.includes('administrative_area_level_1'));

                const city = locality?.long_name || '';
                const state = stateComp?.long_name || '';
                let shortAddr = '';
                if (sublocality && locality) {
                    shortAddr = `${sublocality.long_name}, ${locality.long_name}`;
                } else if (locality) {
                    shortAddr = locality.long_name;
                } else {
                    shortAddr = result.formatted_address.split(',').slice(0, 2).join(',');
                }

                return {
                    fullAddress: result.formatted_address,
                    shortAddress: shortAddr,
                    latitude: loc.lat(),
                    longitude: loc.lng(),
                    pincode,
                    city,
                    state,
                    placeId: result.place_id,
                };
            }
            return null;
        } catch (error) {
            console.error('Pincode geocode failed:', error);
            return null;
        }
    }, [isLoaded, google]);

    // ─── Detect Current Location ─────────────────────────────────────────

    const detectCurrentLocation = useCallback(async (): Promise<Address | null> => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser');
            return null;
        }

        setIsDetectingLocation(true);

        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000,
                });
            });

            const { latitude, longitude } = position.coords;
            const geocoded = await reverseGeocode(latitude, longitude);

            if (geocoded) {
                const address: Address = {
                    id: `current_${Date.now()}`,
                    label: 'Other',
                    fullAddress: geocoded.fullAddress || '',
                    shortAddress: geocoded.shortAddress || '',
                    latitude,
                    longitude,
                    pincode: geocoded.pincode,
                    city: geocoded.city,
                    state: geocoded.state,
                    placeId: geocoded.placeId,
                };
                setSelectedAddress(address);
                setIsDetectingLocation(false);
                return address;
            }

            setIsDetectingLocation(false);
            return null;
        } catch (error: unknown) {
            setIsDetectingLocation(false);
            const geoError = error as { code?: number };
            if (geoError.code === 1) {
                toast.error('Location access denied. Enable location permissions in your browser settings.');
            } else if (geoError.code === 2) {
                toast.error('Unable to determine your location. Please try again.');
            } else if (geoError.code === 3) {
                toast.error('Location request timed out. Please try again.');
            }
            return null;
        }
    }, [reverseGeocode, setSelectedAddress]);

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
