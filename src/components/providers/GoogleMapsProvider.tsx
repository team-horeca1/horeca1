'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

interface GoogleMapsContextType {
    isLoaded: boolean;
    loadError: string | null;
    google: typeof google | null;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
    isLoaded: false,
    loadError: null,
    google: null,
});

export function useGoogleMaps() {
    return useContext(GoogleMapsContext);
}

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const loadingRef = useRef(false);

    useEffect(() => {
        if (loadingRef.current || isLoaded) return;
        loadingRef.current = true;

        const loadMaps = async () => {
            try {
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

                setIsLoaded(true);
            } catch (err: unknown) {
                console.error('Google Maps failed to load:', err);
                setLoadError(err instanceof Error ? err.message : 'Failed to load Google Maps');
                loadingRef.current = false;
            }
        };

        loadMaps();
    }, [isLoaded]);

    // Once loaded, the global `google` namespace is available
    const googleInstance = isLoaded ? (typeof window !== 'undefined' ? window.google : null) : null;

    const value = useMemo(
        () => ({ isLoaded, loadError, google: googleInstance }),
        [isLoaded, loadError, googleInstance],
    );

    return (
        <GoogleMapsContext.Provider value={value}>
            {children}
        </GoogleMapsContext.Provider>
    );
}
