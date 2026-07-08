'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowLeft, Search, X, MapPin, Loader2, Store, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGoogleMaps } from '@/components/providers/GoogleMapsProvider';
import { useAddress, Address } from '@/context/AddressContext';
import { useGooglePlacesAutocomplete, PlaceDetails } from '@/hooks/useGooglePlacesAutocomplete';
import { toast } from 'sonner';

interface AddNewAddressOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (address: Omit<Address, 'id'>) => void;
    initialLat?: number;
    initialLng?: number;
    /** When false the overlay cannot be dismissed — used by mandatory first-address gate. */
    dismissible?: boolean;
    /** Show a top-right close / "Skip for now" escape hatch without enabling full dismissible mode. */
    allowSkip?: boolean;
}

const DEFAULT_CENTER = { lat: 19.076, lng: 72.8777 };
const DETAIL_ZOOM = 16;
type MapType = 'roadmap' | 'hybrid';

interface AddressPreviewProps {
    shortAddress: string;
    fullAddress: string;
    pincode: string;
    city: string;
    isGeocoding: boolean;
    isLocating: boolean;
}

function AddressPreview({ shortAddress, fullAddress, pincode, city, isGeocoding, isLocating }: AddressPreviewProps) {
    const heading = isLocating
        ? 'Detecting your location...'
        : isGeocoding
            ? 'Finding address...'
            : shortAddress || 'Pin your location on the map →';

    const subtext = isLocating
        ? 'Allow location access or search for your business above'
        : fullAddress || 'Drag the map to position the green pin on your address';

    return (
        <div className="flex items-start gap-3 pt-1">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                <MapPin size={17} className="text-[#33a852]" />
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-bold text-gray-800 leading-tight truncate">{heading}</h3>
                <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-2">{subtext}</p>
                {pincode && !isLocating && (
                    <span className="inline-block mt-1.5 text-[11px] font-semibold text-[#33a852] bg-green-50 px-2 py-0.5 rounded-full">
                        📍 {pincode}{city ? ` · ${city}` : ''}
                    </span>
                )}
            </div>
        </div>
    );
}

interface FormFieldsProps {
    flatInfo: string;
    setFlatInfo: (v: string) => void;
    landmark: string;
    setLandmark: (v: string) => void;
    shortAddress: string;
    fullAddress: string;
    pincode: string;
    city: string;
    isGeocoding: boolean;
    isLocating: boolean;
}

function FormFields({
    flatInfo, setFlatInfo, landmark, setLandmark,
    shortAddress, fullAddress, pincode, city, isGeocoding, isLocating,
}: FormFieldsProps) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Floor / Unit / Building
                </label>
                <input
                    type="text"
                    value={flatInfo}
                    onChange={(e) => setFlatInfo(e.target.value)}
                    placeholder="e.g. Ground Floor, Shop 4"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors"
                />
            </div>
            <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Landmark <span className="text-gray-400 normal-case font-normal">(optional)</span>
                </label>
                <input
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="Near main gate / opposite metro..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors"
                />
            </div>
            <AddressPreview
                shortAddress={shortAddress}
                fullAddress={fullAddress}
                pincode={pincode}
                city={city}
                isGeocoding={isGeocoding}
                isLocating={isLocating}
            />
        </div>
    );
}

interface BusinessSearchBarProps {
    query: string;
    onQueryChange: (v: string) => void;
    onSelect: (placeId: string) => void;
    onClear: () => void;
    isFetchingDetails: boolean;
    isSearching: boolean;
    predictions: { placeId: string; mainText: string; secondaryText: string }[];
    showDropdown: boolean;
    setShowDropdown: (v: boolean) => void;
}

function BusinessSearchBar({
    query, onQueryChange, onSelect, onClear, isFetchingDetails, isSearching, predictions,
    showDropdown, setShowDropdown,
    overlay = false,
}: BusinessSearchBarProps & { overlay?: boolean }) {
    return (
        <div className={cn(
            'relative z-20',
            overlay
                ? 'absolute top-3 left-3 right-3'
                : 'shrink-0 px-3 py-2.5 bg-white border-b border-gray-100'
        )}>
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus-within:border-[#33a852] focus-within:bg-white transition-all">
                <Search size={17} className="text-gray-400 shrink-0" />
                <input
                    type="text"
                    placeholder="Search your restaurant, hotel, cafe..."
                    className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-gray-400 text-gray-800"
                    value={query}
                    onChange={(e) => {
                        onQueryChange(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    autoComplete="off"
                />
                {(isSearching || isFetchingDetails) && (
                    <Loader2 size={15} className="animate-spin text-[#33a852] shrink-0" />
                )}
                {query && !isSearching && !isFetchingDetails && (
                    <button
                        type="button"
                        onClick={onClear}
                    >
                        <X size={15} className="text-gray-400" />
                    </button>
                )}
            </div>

            {showDropdown && query.length >= 2 && (
                <div className={cn(
                    'absolute top-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-[50vh] overflow-y-auto z-30',
                    overlay ? 'left-0 right-0' : 'left-3 right-3'
                )}>
                    {!isSearching && !isFetchingDetails && predictions.length === 0 && (
                        <div className="py-8 text-center">
                            <Building2 size={26} className="text-gray-200 mx-auto mb-2" />
                            <p className="text-sm font-semibold text-gray-400">No businesses found</p>
                            <p className="text-xs text-gray-300 mt-1">Try a different name or drag the map pin</p>
                        </div>
                    )}
                    {predictions.map((pred) => (
                        <button
                            key={pred.placeId}
                            type="button"
                            onClick={() => onSelect(pred.placeId)}
                            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-green-50/70 transition-colors text-left border-b border-gray-50 last:border-0"
                        >
                            <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                                <Store size={15} className="text-[#33a852]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-bold text-gray-800 leading-tight">{pred.mainText}</p>
                                <p className="text-[12px] text-gray-400 truncate mt-0.5">{pred.secondaryText}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function AddNewAddressOverlay({
    isOpen,
    onClose,
    onSave,
    initialLat,
    initialLng,
    dismissible = true,
    allowSkip = false,
}: AddNewAddressOverlayProps) {
    const { isLoaded, loadError, google } = useGoogleMaps();
    const { reverseGeocode } = useAddress();

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
    const geocodingRef = useRef(false);
    const allowGeocodeRef = useRef(false);
    const mapTypeRef = useRef<MapType>('roadmap');

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null);
    const [flatInfo, setFlatInfo] = useState('');
    const [landmark, setLandmark] = useState('');
    const [isFetchingDetails, setIsFetchingDetails] = useState(false);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);

    const [mapAddress, setMapAddress] = useState('');
    const [mapShortAddress, setMapShortAddress] = useState('');
    const [mapPincode, setMapPincode] = useState('');
    const [mapCity, setMapCity] = useState('');
    const [mapState, setMapState] = useState('');
    const [mapPlaceId, setMapPlaceId] = useState('');
    const [mapLatLng, setMapLatLng] = useState({
        lat: initialLat ?? DEFAULT_CENTER.lat,
        lng: initialLng ?? DEFAULT_CENTER.lng,
    });
    const [isGeocodingPin, setIsGeocodingPin] = useState(false);
    const [isLocatingGps, setIsLocatingGps] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const { predictions, isSearching, getPlaceDetails, clearPredictions } =
        useGooglePlacesAutocomplete(searchQuery, { businessMode: true, countryCode: 'in' });

    const applyPlaceDetails = useCallback((details: PlaceDetails) => {
        setSelectedPlace(details);
        setMapAddress(details.isAreaLevel ? '' : details.fullAddress);
        setMapShortAddress(details.shortAddress);
        setMapPincode(details.pincodeReliable ? (details.pincode ?? '') : '');
        setMapCity(details.city ?? '');
        setMapState(details.state ?? '');
        setMapPlaceId(details.placeId);
        setMapLatLng({ lat: details.latitude, lng: details.longitude });
        allowGeocodeRef.current = true;

        if (mapRef.current) {
            mapRef.current.panTo({ lat: details.latitude, lng: details.longitude });
            mapRef.current.setZoom(DETAIL_ZOOM);
        }
    }, []);

    const handleSelectBusiness = useCallback(async (placeId: string) => {
        setShowSearchDropdown(false);
        setIsFetchingDetails(true);
        clearPredictions();
        setSearchQuery('');

        const details = await getPlaceDetails(placeId);
        if (details) applyPlaceDetails(details);
        setIsFetchingDetails(false);
    }, [applyPlaceDetails, clearPredictions, getPlaceDetails]);

    const resetFormState = useCallback(() => {
        setSearchQuery('');
        setSelectedPlace(null);
        setFlatInfo('');
        setLandmark('');
        setIsFetchingDetails(false);
        setShowSearchDropdown(false);
        setMapAddress('');
        setMapShortAddress('');
        setMapPincode('');
        setMapCity('');
        setMapState('');
        setMapPlaceId('');
        setMapLatLng({
            lat: initialLat ?? DEFAULT_CENTER.lat,
            lng: initialLng ?? DEFAULT_CENTER.lng,
        });
        setIsGeocodingPin(false);
        setIsLocatingGps(false);
        setIsDragging(false);
        allowGeocodeRef.current = false;
        geocodingRef.current = false;
    }, [initialLat, initialLng]);

    // Sync coords when props change while open
    useEffect(() => {
        if (!isOpen) return;
        if (initialLat != null && initialLng != null) {
            setMapLatLng({ lat: initialLat, lng: initialLng });
            allowGeocodeRef.current = true;
        }
    }, [isOpen, initialLat, initialLng]);

    // Cleanup on close
    useEffect(() => {
        if (isOpen) return;

        if (idleListenerRef.current && google) {
            google.maps.event.removeListener(idleListenerRef.current);
            idleListenerRef.current = null;
        }
        mapRef.current = null;
        resetFormState();
    }, [isOpen, google, resetFormState]);

    // Init map when open and libs loaded
    useEffect(() => {
        if (!isOpen || !isLoaded || !google || !mapContainerRef.current || mapRef.current) return;

        allowGeocodeRef.current = !!(initialLat && initialLng);
        const center = (initialLat && initialLng)
            ? { lat: initialLat, lng: initialLng }
            : DEFAULT_CENTER;
        const zoom = (initialLat && initialLng) ? DETAIL_ZOOM : 13;

        const map = new google.maps.Map(mapContainerRef.current, {
            center,
            zoom,
            disableDefaultUI: true,
            zoomControl: true,
            zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
            gestureHandling: 'greedy',
            mapId: 'horeca1_map',
        });
        mapRef.current = map;

        // Ensure map fills container after layout
        requestAnimationFrame(() => {
            google.maps.event.trigger(map, 'resize');
            map.setCenter(center);
        });

        const btnStyle = 'width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid #e5e7eb;transition:all 0.15s;';

        const gpsBtn = document.createElement('button');
        gpsBtn.type = 'button';
        gpsBtn.title = 'Use my current location';
        gpsBtn.setAttribute('style', btnStyle + 'background:#fff;margin-bottom:8px;margin-right:12px;box-shadow:0 2px 8px rgba(0,0,0,0.15);');
        gpsBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#33a852" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>';
        gpsBtn.addEventListener('mouseover', () => { gpsBtn.style.background = '#f9fafb'; });
        gpsBtn.addEventListener('mouseout', () => { gpsBtn.style.background = '#fff'; });
        gpsBtn.addEventListener('click', () => {
            if (!navigator.geolocation) { toast.error('GPS not supported by your browser'); return; }
            setIsLocatingGps(true);
            gpsBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#33a852" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"></path></svg>';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    allowGeocodeRef.current = true;
                    map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    map.setZoom(DETAIL_ZOOM);
                    setIsLocatingGps(false);
                    gpsBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#33a852" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>';
                },
                (err) => {
                    setIsLocatingGps(false);
                    allowGeocodeRef.current = true;
                    gpsBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#33a852" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>';
                    if (err.code === 1) toast.error('Location access denied — enable it in browser settings');
                    else if (err.code === 2) toast.error('Unable to detect location, try again');
                    else toast.error('Location request timed out');
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });

        const satBtn = document.createElement('button');
        satBtn.type = 'button';
        satBtn.title = 'Toggle satellite view';
        satBtn.setAttribute('style', btnStyle + 'background:#fff;margin-right:12px;box-shadow:0 2px 8px rgba(0,0,0,0.15);');
        satBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"></path><path d="m22.54 12.16-8.58 3.91a2 2 0 0 1-1.66 0l-8.58-3.9"></path><path d="m22.54 16.16-8.58 3.91a2 2 0 0 1-1.66 0l-8.58-3.9"></path></svg>';
        satBtn.addEventListener('click', () => {
            const current = mapTypeRef.current;
            const next: MapType = current === 'roadmap' ? 'hybrid' : 'roadmap';
            mapTypeRef.current = next;
            map.setMapTypeId(next);
            if (next === 'hybrid') {
                map.setZoom(Math.max(map.getZoom() ?? 15, 15));
                map.setTilt(45);
                satBtn.style.background = '#33a852';
                satBtn.style.borderColor = '#33a852';
                satBtn.querySelector('svg')!.setAttribute('stroke', '#fff');
            } else {
                map.setTilt(0);
                satBtn.style.background = '#fff';
                satBtn.style.borderColor = '#e5e7eb';
                satBtn.querySelector('svg')!.setAttribute('stroke', '#4b5563');
            }
        });

        const controlContainer = document.createElement('div');
        controlContainer.style.cssText = 'display:flex;flex-direction:column;padding:0 0 12px 0;';
        controlContainer.appendChild(gpsBtn);
        controlContainer.appendChild(satBtn);
        map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(controlContainer);

        map.addListener('dragstart', () => {
            setIsDragging(true);
            allowGeocodeRef.current = true;
        });

        idleListenerRef.current = map.addListener('idle', async () => {
            setIsDragging(false);
            if (!allowGeocodeRef.current || geocodingRef.current) return;

            const c = map.getCenter();
            if (!c) return;
            const lat = c.lat();
            const lng = c.lng();
            setMapLatLng({ lat, lng });

            geocodingRef.current = true;
            setIsGeocodingPin(true);
            const geo = await reverseGeocode(lat, lng);
            if (geo) {
                setMapAddress(geo.fullAddress || '');
                setMapShortAddress(geo.shortAddress || '');
                setMapPincode(geo.pincode || '');
                setMapCity(geo.city || '');
                setMapState(geo.state || '');
                setMapPlaceId(geo.placeId || '');
                setSelectedPlace(null);
            }
            setIsGeocodingPin(false);
            geocodingRef.current = false;
        });

        if (initialLat && initialLng) {
            (async () => {
                setIsGeocodingPin(true);
                const geo = await reverseGeocode(initialLat, initialLng);
                if (geo) {
                    setMapAddress(geo.fullAddress || '');
                    setMapShortAddress(geo.shortAddress || '');
                    setMapPincode(geo.pincode || '');
                    setMapCity(geo.city || '');
                    setMapState(geo.state || '');
                    setMapPlaceId(geo.placeId || '');
                }
                setIsGeocodingPin(false);
            })();
        } else {
            setIsLocatingGps(true);
            if (!navigator.geolocation) {
                allowGeocodeRef.current = true;
                setIsLocatingGps(false);
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    allowGeocodeRef.current = true;
                    map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    map.setZoom(DETAIL_ZOOM);
                    setIsLocatingGps(false);
                },
                () => {
                    allowGeocodeRef.current = true;
                    setIsLocatingGps(false);
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, isLoaded, google, initialLat, initialLng]);

    const handleSave = useCallback(() => {
        if (!mapAddress) return;
        onSave({
            label: 'Business',
            businessName: selectedPlace?.businessName,
            fullAddress: mapAddress,
            shortAddress: mapShortAddress || mapAddress.split(',').slice(0, 2).join(', '),
            latitude: mapLatLng.lat,
            longitude: mapLatLng.lng,
            pincode: mapPincode,
            city: mapCity,
            state: mapState,
            placeId: mapPlaceId || selectedPlace?.placeId,
            flatInfo: flatInfo || undefined,
            landmark: landmark || undefined,
            isDefault: false,
        });
    }, [mapAddress, mapShortAddress, mapLatLng, mapPincode, mapCity, mapState, mapPlaceId, selectedPlace, flatInfo, landmark, onSave]);

    const canSave = !!mapAddress && !isGeocodingPin && !isLocatingGps;

    const formProps: FormFieldsProps = {
        flatInfo,
        setFlatInfo,
        landmark,
        setLandmark,
        shortAddress: mapShortAddress,
        fullAddress: mapAddress,
        pincode: mapPincode,
        city: mapCity,
        isGeocoding: isGeocodingPin,
        isLocating: isLocatingGps,
    };

    if (!isOpen) return null;

    return (
        <>
            <div
                className="hidden md:block fixed inset-0 z-[16000] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={dismissible ? onClose : undefined}
            />

            <div className={cn(
                'fixed inset-0 z-[16001] bg-white flex flex-col overflow-hidden',
                'md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
                'md:rounded-2xl md:shadow-2xl',
                'animate-in fade-in slide-in-from-bottom md:zoom-in-95 duration-300',
                'md:flex-row md:w-[940px] md:h-[600px]'
            )}>
                {/* Left panel — header + desktop form */}
                <div className="flex flex-col bg-white shrink-0 md:w-[360px] md:border-r md:border-gray-100 md:overflow-hidden">
                    <div className="shrink-0 bg-white border-b border-gray-100">
                        <div className="flex items-center gap-3 px-4 py-3">
                            {dismissible && (
                                <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                                    <ArrowLeft size={22} className="text-gray-700" />
                                </button>
                            )}
                            <div className="flex-1 min-w-0">
                                <h2 className="text-[16px] font-bold text-gray-800">
                                    {dismissible ? 'Add Delivery Address' : 'Set your delivery address'}
                                </h2>
                                {!dismissible && (
                                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                                        Required to show prices &amp; place orders
                                    </p>
                                )}
                            </div>
                            {allowSkip && !dismissible && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                                    aria-label="Skip for now"
                                >
                                    <X size={20} className="text-gray-500" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="hidden md:flex flex-col flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
                            <FormFields {...formProps} />
                        </div>
                        <div className="px-4 pb-4 pt-3 border-t border-gray-50 shrink-0">
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!canSave}
                                className="w-full bg-[#33a852] hover:bg-[#2d9548] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all text-[15px]"
                            >
                                {isGeocodingPin || isLocatingGps
                                    ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 size={16} className="animate-spin" />
                                            {isLocatingGps ? 'Detecting location...' : 'Finding address...'}
                                        </span>
                                    )
                                    : 'Confirm This Location'}
                            </button>
                            {allowSkip && !dismissible && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="w-full mt-2 py-2.5 text-[13px] font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Skip for now
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Map panel — always visible */}
                <div className="flex flex-col flex-1 overflow-hidden min-h-[min(50vh,320px)] md:min-h-0">
                    <div className="flex-1 relative min-h-[min(50vh,320px)] md:min-h-0">
                        <div
                            ref={mapContainerRef}
                            className="absolute inset-0 bg-gray-100"
                        />

                        <BusinessSearchBar
                            overlay
                            query={searchQuery}
                            onQueryChange={setSearchQuery}
                            onSelect={handleSelectBusiness}
                            onClear={() => { setSearchQuery(''); clearPredictions(); setShowSearchDropdown(false); }}
                            isFetchingDetails={isFetchingDetails}
                            isSearching={isSearching}
                            predictions={predictions}
                            showDropdown={showSearchDropdown}
                            setShowDropdown={setShowSearchDropdown}
                        />

                        {loadError && (
                            <div className="absolute inset-0 bg-gray-50 flex flex-col items-center justify-center gap-3 z-[500] px-6 text-center">
                                <MapPin size={32} className="text-red-400" />
                                <p className="text-sm font-semibold text-gray-700">Map failed to load</p>
                                <p className="text-xs text-gray-400">{loadError}</p>
                            </div>
                        )}

                        {!loadError && !isLoaded && (
                            <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center gap-3 z-[500]">
                                <Loader2 size={32} className="animate-spin text-[#33a852]" />
                                <span className="text-sm text-gray-400 font-medium">Loading map...</span>
                            </div>
                        )}

                        {!loadError && isLoaded && isLocatingGps && (
                            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2 z-[500] border border-gray-100 pointer-events-none">
                                <Loader2 size={13} className="animate-spin text-[#33a852]" />
                                <span className="text-xs font-semibold text-gray-600">Detecting your location...</span>
                            </div>
                        )}

                        {isLoaded && (
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[500]">
                                <div className={cn('flex flex-col items-center transition-all duration-200', isDragging ? '-translate-y-4' : '')}>
                                    <div className={cn(
                                        'w-12 h-12 rounded-full rounded-bl-none -rotate-45 flex items-center justify-center transition-all duration-200',
                                        'shadow-[0_4px_20px_rgba(51,168,82,0.55)]',
                                        isDragging ? 'bg-[#2d9548] scale-110' : 'bg-[#33a852]'
                                    )}>
                                        <div className="w-4 h-4 bg-white rounded-full rotate-45" />
                                    </div>
                                    <div className={cn(
                                        'rounded-full bg-black/25 transition-all duration-200 -mt-1',
                                        isDragging ? 'w-6 h-2 opacity-30' : 'w-3 h-1.5 opacity-60'
                                    )} />
                                </div>
                            </div>
                        )}

                        {isGeocodingPin && !isLocatingGps && (
                            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2 z-[500] border border-gray-100 pointer-events-none">
                                <Loader2 size={13} className="animate-spin text-[#33a852]" />
                                <span className="text-xs font-semibold text-gray-600">Finding address...</span>
                            </div>
                        )}

                        {isLoaded && !isGeocodingPin && !mapAddress && !isDragging && !isLocatingGps && (
                            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-gray-800/80 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full z-[500] whitespace-nowrap pointer-events-none">
                                Drag map to move pin
                            </div>
                        )}
                    </div>

                    {/* Mobile bottom sheet */}
                    <div className="md:hidden bg-white border-t border-gray-100 shrink-0">
                        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-2.5 mb-3" />
                        <div className="px-4 pb-4 max-h-[42vh] overflow-y-auto">
                            <FormFields {...formProps} />
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!canSave}
                                className="w-full mt-4 bg-[#33a852] hover:bg-[#2d9548] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all text-[15px]"
                            >
                                {isGeocodingPin || isLocatingGps
                                    ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Loader2 size={16} className="animate-spin" />
                                            {isLocatingGps ? 'Detecting location...' : 'Finding address...'}
                                        </span>
                                    )
                                    : 'Confirm This Location'}
                            </button>
                            {allowSkip && !dismissible && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="w-full mt-2 py-2.5 text-[13px] font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Skip for now
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
