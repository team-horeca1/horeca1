'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

interface GoogleMapsContextType {
    isLoaded: boolean;
    loadError: string | null;
    google: typeof google | null;
    __isProvider?: boolean;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
    isLoaded: false,
    loadError: null,
    google: null,
});

export function useGoogleMaps() {
    return useContext(GoogleMapsContext);
}

let globalLoadPromise: Promise<void> | null = null;

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
    const parentContext = useContext(GoogleMapsContext);

    // If an ancestor provider is already active, don't duplicate
    if (parentContext.__isProvider) {
        return <>{children}</>;
    }

    return <GoogleMapsProviderInner>{children}</GoogleMapsProviderInner>;
}

function GoogleMapsProviderInner({ children }: { children: React.ReactNode }) {
    const [isLoaded, setIsLoaded] = useState(() => {
        return typeof window !== 'undefined' && !!window.google?.maps?.places;
    });
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.google?.maps?.places) {
            setIsLoaded(true);
            return;
        }

        if (isLoaded) return;

        if (!globalLoadPromise) {
            globalLoadPromise = (async () => {
                // Fetch key dynamically
                const res = await fetch('/api/v1/config/maps-key');
                if (!res.ok) {
                    throw new Error('Failed to fetch maps API key configuration');
                }
                const json = await res.json();
                if (!json.success || !json.apiKey) {
                    throw new Error(json.error || 'Google Maps API key not configured on the server');
                }

                // Set API options
                setOptions({
                    key: json.apiKey,
                    v: 'weekly',
                    libraries: ['places', 'geocoding', 'marker'],
                });

                // Import all required libraries
                await Promise.all([
                    importLibrary('core'),
                    importLibrary('places'),
                    importLibrary('marker'),
                    importLibrary('geocoding'),
                ]);
            })();
        }

        globalLoadPromise
            .then(() => {
                setIsLoaded(true);
            })
            .catch((err: unknown) => {
                console.error('Google Maps failed to load:', err);
                setLoadError(err instanceof Error ? err.message : 'Failed to load Google Maps');
                globalLoadPromise = null; // allow retry on next mount
            });
    }, [isLoaded]);

    // Once loaded, the global `google` namespace is available
    const googleInstance = isLoaded ? (typeof window !== 'undefined' ? window.google : null) : null;

    const value = useMemo(
        () => ({ isLoaded, loadError, google: googleInstance, __isProvider: true }),
        [isLoaded, loadError, googleInstance],
    );

    return (
        <GoogleMapsContext.Provider value={value}>
            {children}
        </GoogleMapsContext.Provider>
    );
}
