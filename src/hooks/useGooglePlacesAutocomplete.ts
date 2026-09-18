'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGoogleMaps } from '@/components/providers/GoogleMapsProvider';

export interface PlacePrediction {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string;
}

export interface PlaceDetails {
    placeId: string;
    fullAddress: string;
    shortAddress: string;
    latitude: number;
    longitude: number;
    pincode?: string;
    city?: string;
    state?: string;
    businessName?: string;  // Populated when Place has a name (restaurant, hotel, cafe)
    /** True when the place is a locality/area, not a street-level deliverable address. */
    isAreaLevel?: boolean;
    /** True when pincode came from place postal_code component (not centroid guess). */
    pincodeReliable?: boolean;
}

interface UseGooglePlacesOptions {
    debounceMs?: number;
    // When true: filters results to food/hospitality establishments (restaurants, hotels, cafes)
    businessMode?: boolean;
    // Restrict to a country (ISO 3166-1 alpha-2, e.g. 'in' for India)
    countryCode?: string;
}

export function useGooglePlacesAutocomplete(
    query: string,
    options: UseGooglePlacesOptions | number = {}
) {
    // Accept legacy numeric debounceMs for backward compatibility
    const opts: UseGooglePlacesOptions = typeof options === 'number'
        ? { debounceMs: options }
        : options;

    const { debounceMs = 300, businessMode = false, countryCode = 'in' } = opts;

    const { isLoaded, google } = useGoogleMaps();
    const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
    const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

    // Ensure autocomplete and places services exist whenever google maps is available
    const ensureServices = useCallback(() => {
        const g = google || (typeof window !== 'undefined' ? window.google : null);
        if (!g?.maps?.places) return false;
        try {
            if (!serviceRef.current) {
                serviceRef.current = new g.maps.places.AutocompleteService();
            }
            if (!placesServiceRef.current) {
                const dummyDiv = document.createElement('div');
                placesServiceRef.current = new g.maps.places.PlacesService(dummyDiv);
            }
            if (!sessionTokenRef.current) {
                sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();
            }
            return !!serviceRef.current && !!placesServiceRef.current;
        } catch (err) {
            console.warn('[useGooglePlacesAutocomplete] Service initialization error:', err);
            return false;
        }
    }, [google]);

    // Initialize services when Google Maps is loaded
    useEffect(() => {
        if (isLoaded || (typeof window !== 'undefined' && window.google?.maps?.places)) {
            ensureServices();
        }
    }, [isLoaded, ensureServices]);

    // Debounced search
    useEffect(() => {
        const hasMaps = isLoaded || (typeof window !== 'undefined' && !!window.google?.maps?.places);
        if (!hasMaps) {
            queueMicrotask(() => {
                setPredictions([]);
                setIsSearching(false);
            });
            return;
        }

        if (!ensureServices()) {
            return;
        }

        const trimmed = (query || '').trim();
        if (trimmed.length < 2) {
            queueMicrotask(() => {
                setPredictions([]);
                setIsSearching(false);
            });
            return;
        }

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        queueMicrotask(() => setIsSearching(true));

        debounceTimerRef.current = setTimeout(async () => {
            try {
                if (!ensureServices() || !serviceRef.current) {
                    setIsSearching(false);
                    return;
                }

                // AutocompletionRequest: do NOT restrict request.types to ['establishment'].
                // In Google Places API, types: ['establishment'] completely ignores
                // localities, street addresses, and areas (such as "Digha", "Sector 17", etc.).
                // Omitting types allows matching both businesses (restaurants/hotels) and
                // general addresses/localities/pincodes.
                const request: google.maps.places.AutocompletionRequest = {
                    input: trimmed,
                    sessionToken: sessionTokenRef.current || undefined,
                    componentRestrictions: { country: countryCode },
                };

                serviceRef.current.getPlacePredictions(request, (results, status) => {
                    const g = google || (typeof window !== 'undefined' ? window.google : null);
                    const OK = g?.maps?.places?.PlacesServiceStatus?.OK || 'OK';
                    const ZERO_RESULTS = g?.maps?.places?.PlacesServiceStatus?.ZERO_RESULTS || 'ZERO_RESULTS';

                    if (status === OK && results && results.length > 0) {
                        setPredictions(
                            results.map((r) => ({
                                placeId: r.place_id,
                                description: r.description,
                                mainText: r.structured_formatting?.main_text || r.description,
                                secondaryText: r.structured_formatting?.secondary_text || '',
                            }))
                        );
                    } else {
                        if (status !== ZERO_RESULTS) {
                            console.warn('[Places Autocomplete] status:', status, 'query:', trimmed);
                        }
                        setPredictions([]);
                    }
                    setIsSearching(false);
                });
            } catch (error) {
                console.error('Autocomplete error:', error);
                setPredictions([]);
                setIsSearching(false);
            }
        }, debounceMs);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [query, isLoaded, google, debounceMs, countryCode, ensureServices]);

    // Get full place details — includes businessName when place has a proper name
    const getPlaceDetails = useCallback(
        (placeId: string): Promise<PlaceDetails | null> => {
            return new Promise((resolve) => {
                if (!ensureServices() || !placesServiceRef.current) {
                    resolve(null);
                    return;
                }
                const g = google || (typeof window !== 'undefined' ? window.google : null);
                if (!g?.maps?.places) {
                    resolve(null);
                    return;
                }

                const request: google.maps.places.PlaceDetailsRequest = {
                    placeId,
                    // Include 'name' to get business name (restaurant/hotel/cafe name)
                    fields: ['name', 'formatted_address', 'geometry', 'address_components', 'place_id', 'types'],
                    sessionToken: sessionTokenRef.current!,
                };

                placesServiceRef.current.getDetails(request, (place, status) => {
                    const OK = g.maps.places.PlacesServiceStatus.OK;
                    if (status === OK && place) {
                        const lat = place.geometry?.location?.lat() || 0;
                        const lng = place.geometry?.location?.lng() || 0;
                        const components = place.address_components || [];

                        const locality = components.find(c => c.types.includes('locality'));
                        const admin2 = components.find(c => c.types.includes('administrative_area_level_2'));
                        const sublocality = components.find(c =>
                            c.types.includes('sublocality_level_1') || c.types.includes('sublocality')
                        );
                        const postalCode = components.find(c => c.types.includes('postal_code'));
                        const stateComp = components.find(c =>
                            c.types.includes('administrative_area_level_1')
                        );

                        let pincode = postalCode?.long_name || '';
                        const pincodeFromComponent = !!pincode;
                        const city = locality?.long_name
                            || admin2?.long_name
                            || sublocality?.long_name
                            || '';
                        const state = stateComp?.long_name || '';
                        const placeTypes = place.types || [];
                        const hasStreetLevel = placeTypes.some((t) =>
                            ['street_address', 'premise', 'subpremise', 'establishment', 'point_of_interest'].includes(t),
                        );
                        const isAreaLevel = !hasStreetLevel && placeTypes.some((t) =>
                            ['neighborhood', 'sublocality', 'sublocality_level_1', 'locality', 'administrative_area_level_2'].includes(t),
                        );

                        const resolveDetails = (resolvedPincode: string, pincodeReliable: boolean) => {
                            let shortAddr = '';
                            if (sublocality && (locality || admin2)) {
                                shortAddr = `${sublocality.long_name}, ${locality?.long_name || admin2?.long_name}`;
                            } else if (locality) {
                                shortAddr = locality.long_name;
                            } else if (admin2) {
                                shortAddr = admin2.long_name;
                            } else {
                                shortAddr = (place.formatted_address || '').split(',').slice(0, 2).join(',');
                            }

                            const placeName = place.name || '';
                            const isBusinessName = placeName.length > 0
                                && !place.formatted_address?.startsWith(placeName)
                                && !/^\d/.test(placeName);

                            sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();

                            resolve({
                                placeId: place.place_id || placeId,
                                fullAddress: place.formatted_address || shortAddr || '',
                                shortAddress: shortAddr,
                                latitude: lat,
                                longitude: lng,
                                pincode: resolvedPincode,
                                city,
                                state,
                                businessName: isBusinessName ? placeName : undefined,
                                isAreaLevel,
                                pincodeReliable,
                            });
                        };

                        if (!pincodeFromComponent && lat && lng) {
                            // Do not guess pincode from centroid — area picks need manual confirmation.
                            resolveDetails('', false);
                            return;
                        }

                        resolveDetails(pincode, pincodeFromComponent);
                    } else {
                        resolve(null);
                    }
                });
            });
        },
        [google, ensureServices]
    );

    const clearPredictions = useCallback(() => {
        setPredictions([]);
    }, []);

    return {
        predictions,
        isSearching,
        getPlaceDetails,
        clearPredictions,
    };
}
