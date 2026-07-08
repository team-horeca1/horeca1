'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowLeft, Search, X, MapPin, Loader2, Home, Briefcase,
    Store, CheckCircle, Building2,
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
    defaultMode?: 'business' | 'map';
    /** When false the overlay cannot be dismissed (no back button, no backdrop
     *  close) — used by the mandatory first-address gate. Defaults to true. */
    dismissible?: boolean;
    /** Show a top-right close / "Skip for now" escape hatch without enabling full dismissible mode. */
    allowSkip?: boolean;
}

const DEFAULT_CENTER = { lat: 19.076, lng: 72.8777 };
const DETAIL_ZOOM = 16;

type Mode = 'business' | 'map';
type LabelType = 'Business' | 'Home' | 'Work' | 'Other';
type MapType = 'roadmap' | 'hybrid';

const LABEL_OPTIONS: { label: LabelType; icon: React.ElementType }[] = [
    { label: 'Business', icon: Store },
    { label: 'Home', icon: Home },
    { label: 'Work', icon: Briefcase },
    { label: 'Other', icon: MapPin },
];

export function AddNewAddressOverlay({
    isOpen,
    onClose,
    onSave,
    initialLat,
    initialLng,
    defaultMode = 'business',
    dismissible = true,
    allowSkip = false,
}: AddNewAddressOverlayProps) {
    const { isLoaded, google } = useGoogleMaps();
    const { reverseGeocode } = useAddress();
    const [mode, setMode] = useState<Mode>(defaultMode);

    // ─── Business state ───────────────────────────────────────────────────
    const [businessQuery, setBusinessQuery] = useState('');
    const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null);
    const [businessNameEdit, setBusinessNameEdit] = useState('');
    const [addressEdit, setAddressEdit] = useState('');
    const [pincodeEdit, setPincodeEdit] = useState('');
    const [flatInfo, setFlatInfo] = useState('');
    const [landmark, setLandmark] = useState('');
    const [label, setLabel] = useState<LabelType>('Business');
    const [isFetchingDetails, setIsFetchingDetails] = useState(false);
    const [showBusinessDropdown, setShowBusinessDropdown] = useState(false);

    const { predictions, isSearching, getPlaceDetails, clearPredictions } =
        useGooglePlacesAutocomplete(businessQuery, { businessMode: true, countryCode: 'in' });

    // ─── Map state ────────────────────────────────────────────────────────
    // Single ref — the map container div is rendered ONCE in the DOM
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const mapAutoRef = useRef<google.maps.places.AutocompleteService | null>(null);
    const mapPlacesRef = useRef<google.maps.places.PlacesService | null>(null);
    const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
    const mapDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const geocodingRef = useRef(false);
    const mapTypeRef = useRef<MapType>('roadmap'); // mutable ref so DOM click handlers always see latest

    const [mapAddress, setMapAddress] = useState('');
    const [mapShortAddress, setMapShortAddress] = useState('');
    const [mapPincode, setMapPincode] = useState('');
    const [mapCity, setMapCity] = useState('');
    const [mapState, setMapState] = useState('');
    const [mapPlaceId, setMapPlaceId] = useState('');
    const [mapLatLng, setMapLatLng] = useState({ lat: initialLat || DEFAULT_CENTER.lat, lng: initialLng || DEFAULT_CENTER.lng });
    const [mapFlatInfo, setMapFlatInfo] = useState('');
    const [mapLandmark, setMapLandmark] = useState('');
    const [mapLabel, setMapLabel] = useState<LabelType>('Home');
    const [isGeocodingPin, setIsGeocodingPin] = useState(false);
    const [isDetectingGPS, setIsDetectingGPS] = useState(false);
    const [mapType, setMapType] = useState<MapType>('roadmap');
    const [isDragging, setIsDragging] = useState(false);
    const [mapSearchQuery, setMapSearchQuery] = useState('');
    const [mapPredictions, setMapPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
    const [isMapSearching, setIsMapSearching] = useState(false);
    const [showMapDropdown, setShowMapDropdown] = useState(false);

    // ─── Init map (runs when map container is visible and libs loaded) ────
    useEffect(() => {
        if (mode !== 'map' || !isOpen || !isLoaded || !google || !mapContainerRef.current) return;
        if (mapRef.current) return; // already initialised

        const center = (initialLat && initialLng) ? { lat: initialLat, lng: initialLng } : DEFAULT_CENTER;
        const zoom = (initialLat && initialLng) ? DETAIL_ZOOM : 13;

        const map = new google.maps.Map(mapContainerRef.current, {
            center, zoom,
            disableDefaultUI: true,
            zoomControl: true,
            zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
            gestureHandling: 'greedy',
            mapId: 'horeca1_map',
        });
        mapRef.current = map;

        mapAutoRef.current = new google.maps.places.AutocompleteService();
        const dummy = document.createElement('div');
        mapPlacesRef.current = new google.maps.places.PlacesService(dummy);

        // ─── Register native map controls (guaranteed clickable) ─────────
        const btnStyle = 'width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid #e5e7eb;transition:all 0.15s;';

        // GPS / locate-me button
        const gpsBtn = document.createElement('button');
        gpsBtn.type = 'button';
        gpsBtn.title = 'Use my current location';
        gpsBtn.setAttribute('style', btnStyle + 'background:#fff;margin-bottom:8px;margin-right:12px;box-shadow:0 2px 8px rgba(0,0,0,0.15);');
        gpsBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#33a852" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>';
        gpsBtn.addEventListener('mouseover', () => { gpsBtn.style.background = '#f9fafb'; });
        gpsBtn.addEventListener('mouseout', () => { gpsBtn.style.background = '#fff'; });
        gpsBtn.addEventListener('click', () => {
            if (!navigator.geolocation) { toast.error('GPS not supported by your browser'); return; }
            setIsDetectingGPS(true);
            gpsBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#33a852" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"></path></svg>';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    map.setZoom(DETAIL_ZOOM);
                    setIsDetectingGPS(false);
                    gpsBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#33a852" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>';
                },
                (err) => {
                    setIsDetectingGPS(false);
                    gpsBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#33a852" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>';
                    if (err.code === 1) toast.error('Location access denied — enable it in browser settings');
                    else if (err.code === 2) toast.error('Unable to detect location, try again');
                    else toast.error('Location request timed out');
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });

        // Satellite / map type toggle button
        const satBtn = document.createElement('button');
        satBtn.type = 'button';
        satBtn.title = 'Toggle satellite view';
        satBtn.setAttribute('style', btnStyle + 'background:#fff;margin-right:12px;box-shadow:0 2px 8px rgba(0,0,0,0.15);');
        satBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"></path><path d="m22.54 12.16-8.58 3.91a2 2 0 0 1-1.66 0l-8.58-3.9"></path><path d="m22.54 16.16-8.58 3.91a2 2 0 0 1-1.66 0l-8.58-3.9"></path></svg>';
        satBtn.addEventListener('click', () => {
            const current = mapTypeRef.current;
            const next: MapType = current === 'roadmap' ? 'hybrid' : 'roadmap';
            mapTypeRef.current = next;
            setMapType(next);
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

        // Container for both buttons
        const controlContainer = document.createElement('div');
        controlContainer.style.cssText = 'display:flex;flex-direction:column;padding:0 0 12px 0;';
        controlContainer.appendChild(gpsBtn);
        controlContainer.appendChild(satBtn);
        map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(controlContainer);

        // Pin lift animation on drag
        map.addListener('dragstart', () => setIsDragging(true));

        // Moving-map / fixed-pin: geocode center on every idle
        idleListenerRef.current = map.addListener('idle', async () => {
            setIsDragging(false);
            if (geocodingRef.current) return;
            const c = map.getCenter();
            if (!c) return;
            const lat = c.lat(); const lng = c.lng();
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
            }
            setIsGeocodingPin(false);
            geocodingRef.current = false;
        });

        // Auto-GPS or geocode initial coords
        if (!initialLat || !initialLng) {
            setTimeout(() => {
                if (!navigator.geolocation) return;
                setIsDetectingGPS(true);
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                        map.setZoom(DETAIL_ZOOM);
                        setIsDetectingGPS(false);
                    },
                    () => setIsDetectingGPS(false),
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            }, 400);
        } else {
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
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, isOpen, isLoaded, google]);


    // Cleanup on close
    useEffect(() => {
        if (!isOpen) {
            if (idleListenerRef.current && google) {
                google.maps.event.removeListener(idleListenerRef.current);
                idleListenerRef.current = null;
            }
            mapRef.current = null;
            setBusinessQuery(''); setSelectedPlace(null); setBusinessNameEdit('');
            setAddressEdit(''); setFlatInfo(''); setLandmark('');
            setMapSearchQuery(''); setMapPredictions([]);
            setMapFlatInfo(''); setMapLandmark('');
            setMapAddress(''); setMapShortAddress('');
            setMode(defaultMode);
        }
    }, [isOpen, defaultMode, google]);

    // Force map re-init when switching to map tab
    useEffect(() => {
        if (mode === 'map') mapRef.current = null;
    }, [mode]);

    // Map search autocomplete
    useEffect(() => {
        if (!mapSearchQuery || mapSearchQuery.length < 2 || !mapAutoRef.current || !google) {
            setMapPredictions([]); return;
        }
        if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current);
        setIsMapSearching(true);
        mapDebounceRef.current = setTimeout(() => {
            mapAutoRef.current!.getPlacePredictions(
                { input: mapSearchQuery, componentRestrictions: { country: 'in' } },
                (results, status) => {
                    setMapPredictions(status === google.maps.places.PlacesServiceStatus.OK && results ? results : []);
                    setIsMapSearching(false);
                }
            );
        }, 300);
        return () => { if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current); };
    }, [mapSearchQuery, google]);

    const selectMapPrediction = useCallback((pred: google.maps.places.AutocompletePrediction) => {
        if (!mapPlacesRef.current || !google) return;
        setShowMapDropdown(false); setMapSearchQuery(''); setMapPredictions([]);
        mapPlacesRef.current.getDetails(
            { placeId: pred.place_id, fields: ['geometry'] },
            (place, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
                    mapRef.current?.panTo(place.geometry.location);
                    mapRef.current?.setZoom(DETAIL_ZOOM);
                }
            }
        );
    }, [google]);


    const handleSelectBusiness = useCallback(async (placeId: string) => {
        setShowBusinessDropdown(false); setIsFetchingDetails(true); clearPredictions();
        const details = await getPlaceDetails(placeId);
        if (details) {
            setSelectedPlace(details);
            setBusinessNameEdit(details.businessName || '');
            setAddressEdit(details.isAreaLevel ? '' : details.fullAddress);
            if (!details.pincodeReliable) setPincodeEdit('');
            else setPincodeEdit(details.pincode || '');
        }
        setIsFetchingDetails(false);
    }, [getPlaceDetails, clearPredictions]);

    const handleSaveBusiness = useCallback(() => {
        if (!selectedPlace) return;
        onSave({
            label, businessName: businessNameEdit || undefined,
            fullAddress: addressEdit || selectedPlace.fullAddress,
            shortAddress: selectedPlace.shortAddress,
            latitude: selectedPlace.latitude, longitude: selectedPlace.longitude,
            pincode: pincodeEdit || selectedPlace.pincode, city: selectedPlace.city, state: selectedPlace.state,
            placeId: selectedPlace.placeId,
            flatInfo: flatInfo || undefined, landmark: landmark || undefined, isDefault: false,
        });
    }, [selectedPlace, label, businessNameEdit, addressEdit, pincodeEdit, flatInfo, landmark, onSave]);

    const handleSaveMap = useCallback(() => {
        if (!mapAddress) return;
        onSave({
            label: mapLabel,
            fullAddress: mapAddress,
            shortAddress: mapShortAddress || mapAddress.split(',').slice(0, 2).join(', '),
            latitude: mapLatLng.lat, longitude: mapLatLng.lng,
            pincode: mapPincode, city: mapCity, state: mapState, placeId: mapPlaceId,
            flatInfo: mapFlatInfo || undefined, landmark: mapLandmark || undefined, isDefault: false,
        });
    }, [mapAddress, mapShortAddress, mapLatLng, mapPincode, mapCity, mapState, mapPlaceId, mapFlatInfo, mapLandmark, mapLabel, onSave]);

    if (!isOpen) return null;

    return (
        <>
            {/* Desktop backdrop — click-to-close only when dismissible */}
            <div
                className="hidden md:block fixed inset-0 z-[16000] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={dismissible ? onClose : undefined}
            />

            {/*
             * Layout:
             *   Mobile  — flex-col full screen
             *   Desktop — flex-row modal (business: 500px | map: 900px)
             */}
            <div className={cn(
                'fixed inset-0 z-[16001] bg-white flex flex-col overflow-hidden',
                'md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
                'md:rounded-2xl md:shadow-2xl',
                'animate-in fade-in slide-in-from-bottom md:zoom-in-95 duration-300',
                mode === 'map' ? 'md:flex-row md:w-[940px] md:h-[600px]' : 'md:flex-col md:w-[500px] md:max-h-[88vh]'
            )}>

                {/* ── LEFT / FORM PANEL ─────────────────────────────────── */}
                <div className={cn(
                    'flex flex-col bg-white shrink-0',
                    mode === 'map'
                        ? 'md:w-[360px] md:border-r md:border-gray-100 md:overflow-y-auto'
                        : 'flex-1 overflow-hidden'
                )}>
                    {/* Header */}
                    <div className="shrink-0 bg-white border-b border-gray-100">
                        <div className="flex items-center gap-3 px-4 py-3">
                            {dismissible && (
                                <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
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
                                    onClick={onClose}
                                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                                    aria-label="Skip for now"
                                >
                                    <X size={20} className="text-gray-500" />
                                </button>
                            )}
                        </div>
                        <div className="flex px-4 gap-1">
                            {([
                                { id: 'business' as Mode, icon: Store, lbl: 'Search Business' },
                                { id: 'map' as Mode, icon: MapPin, lbl: 'Map & GPS' },
                            ] as { id: Mode; icon: React.ElementType; lbl: string }[]).map(({ id, icon: Icon, lbl }) => (
                                <button
                                    key={id}
                                    onClick={() => setMode(id)}
                                    className={cn(
                                        'flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold border-b-2 transition-colors',
                                        mode === id ? 'border-[#33a852] text-[#33a852]' : 'border-transparent text-gray-400 hover:text-gray-600'
                                    )}
                                >
                                    <Icon size={14} />{lbl}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Business search mode content */}
                    {mode === 'business' && (
                        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
                            {/* Search bar */}
                            <div className="relative mb-4">
                                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus-within:border-[#33a852] focus-within:bg-white transition-all">
                                    <Search size={17} className="text-gray-400 shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="Search your restaurant, hotel, cafe..."
                                        className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-gray-400 text-gray-800"
                                        value={businessQuery}
                                        onChange={(e) => { setBusinessQuery(e.target.value); setShowBusinessDropdown(true); if (!e.target.value) setSelectedPlace(null); }}
                                        onFocus={() => setShowBusinessDropdown(true)}
                                        autoComplete="off"
                                    />
                                    {(isSearching || isFetchingDetails) && <Loader2 size={15} className="animate-spin text-[#33a852] shrink-0" />}
                                    {businessQuery && !isSearching && !isFetchingDetails && (
                                        <button onClick={() => { setBusinessQuery(''); setSelectedPlace(null); clearPredictions(); }}>
                                            <X size={15} className="text-gray-400" />
                                        </button>
                                    )}
                                </div>

                                {showBusinessDropdown && businessQuery.length >= 2 && !selectedPlace && (
                                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-[50vh] overflow-y-auto z-30">
                                        {!isSearching && !isFetchingDetails && predictions.length === 0 && (
                                            <div className="py-8 text-center">
                                                <Building2 size={26} className="text-gray-200 mx-auto mb-2" />
                                                <p className="text-sm font-semibold text-gray-400">No businesses found</p>
                                                <p className="text-xs text-gray-300 mt-1">Try a different name or use Map & GPS</p>
                                            </div>
                                        )}
                                        {predictions.map((pred) => (
                                            <button
                                                key={pred.placeId}
                                                onClick={() => handleSelectBusiness(pred.placeId)}
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

                            {selectedPlace ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle size={14} className="text-[#33a852]" />
                                        <span className="text-[12px] font-bold text-[#33a852]">Business found — edit if needed</span>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Business Name</label>
                                        <div className="relative">
                                            <Store size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#33a852]" />
                                            <input type="text" value={businessNameEdit} onChange={(e) => setBusinessNameEdit(e.target.value)}
                                                placeholder="Restaurant / hotel / cafe name"
                                                className="w-full pl-9 pr-4 py-3 border-2 border-[#33a852]/30 rounded-xl text-[14px] font-bold text-gray-800 outline-none focus:border-[#33a852] bg-green-50/30 transition-colors" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Address <span className="text-gray-400 normal-case font-normal">(auto-filled)</span>
                                        </label>
                                        <div className="relative">
                                            <MapPin size={14} className="absolute left-3 top-3.5 text-gray-400" />
                                            <textarea value={addressEdit} onChange={(e) => setAddressEdit(e.target.value)} rows={2}
                                                className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-[13px] text-gray-700 outline-none focus:border-[#33a852] bg-white transition-colors resize-none" />
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                                            {[selectedPlace.city, selectedPlace.state].filter(Boolean).map((t, i) => (
                                                <span key={i} className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{t}</span>
                                            ))}
                                            {selectedPlace.pincodeReliable ? (
                                                selectedPlace.pincode && (
                                                    <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">📍 {selectedPlace.pincode}</span>
                                                )
                                            ) : (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={6}
                                                    value={pincodeEdit}
                                                    onChange={(e) => setPincodeEdit(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    placeholder="Pincode"
                                                    className="w-[88px] text-[11px] border border-amber-200 rounded-full px-2 py-0.5 outline-none focus:border-amber-400"
                                                />
                                            )}
                                        </div>
                                        {selectedPlace.isAreaLevel && (
                                            <p className="text-[11px] text-amber-700 mt-2 font-medium">
                                                This is an area — enter your street address and pincode, or switch to Map to drop a pin.
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Floor / Unit / Building</label>
                                        <input type="text" value={flatInfo} onChange={(e) => setFlatInfo(e.target.value)}
                                            placeholder="e.g. Ground Floor, Shop 4, Wing B"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Landmark <span className="text-gray-400 normal-case font-normal">(optional)</span>
                                        </label>
                                        <input type="text" value={landmark} onChange={(e) => setLandmark(e.target.value)}
                                            placeholder="Near main gate / opposite bus stop..."
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Save As</label>
                                        <div className="flex flex-wrap gap-2">
                                            {LABEL_OPTIONS.map(({ label: l, icon: Icon }) => (
                                                <button key={l} onClick={() => setLabel(l)}
                                                    className={cn('flex items-center gap-1.5 px-3 py-2 rounded-full border-2 text-[12px] font-bold transition-all',
                                                        label === l ? 'border-[#33a852] bg-[#e9f9e9] text-[#33a852]' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                                                    <Icon size={12} />{l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={handleSaveBusiness}
                                        className="w-full bg-[#33a852] hover:bg-[#2d9548] text-white font-bold py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all text-[15px]">
                                        Save Delivery Address
                                    </button>
                                </div>
                            ) : (
                                <div className="py-14 text-center">
                                    <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <Store size={28} className="text-[#33a852]" />
                                    </div>
                                    <h3 className="text-[15px] font-bold text-gray-700 mb-1">Find your business</h3>
                                    <p className="text-[13px] text-gray-400 max-w-[260px] mx-auto leading-relaxed">
                                        Search for your restaurant, hotel, cafe or catering kitchen above
                                    </p>
                                    <p className="text-[12px] text-gray-300 mt-4">
                                        Can&apos;t find it?{' '}
                                        <button onClick={() => setMode('map')} className="text-[#33a852] font-bold underline underline-offset-2">
                                            Use Map &amp; GPS
                                        </button>
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Map mode — desktop LEFT panel: form fields only (map is in right panel) */}
                    {mode === 'map' && (
                        <div className="hidden md:flex flex-col flex-1 overflow-hidden">
                            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-4">
                                {/* Address preview */}
                                <div className="flex items-start gap-3 pb-4 border-b border-gray-50">
                                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                                        <MapPin size={17} className="text-[#33a852]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-[14px] font-bold text-gray-800 leading-tight truncate">
                                            {mapShortAddress || (isGeocodingPin ? 'Detecting...' : 'Pin your location on the map →')}
                                        </h3>
                                        <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-2">
                                            {mapAddress || 'Drag the map to position the green pin on your address'}
                                        </p>
                                        {mapPincode && (
                                            <span className="inline-block mt-1.5 text-[11px] font-semibold text-[#33a852] bg-green-50 px-2 py-0.5 rounded-full">
                                                📍 {mapPincode} · {mapCity}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Floor / Unit / Building</label>
                                    <input type="text" value={mapFlatInfo} onChange={(e) => setMapFlatInfo(e.target.value)}
                                        placeholder="e.g. Ground Floor, Shop 4"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                        Landmark <span className="text-gray-400 normal-case font-normal">(optional)</span>
                                    </label>
                                    <input type="text" value={mapLandmark} onChange={(e) => setMapLandmark(e.target.value)}
                                        placeholder="Near main gate / opposite metro..."
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Save As</label>
                                    <div className="flex flex-wrap gap-2">
                                        {LABEL_OPTIONS.map(({ label: l, icon: Icon }) => (
                                            <button key={l} onClick={() => setMapLabel(l)}
                                                className={cn('flex items-center gap-1.5 px-3 py-2 rounded-full border-2 text-[12px] font-bold transition-all',
                                                    mapLabel === l ? 'border-[#33a852] bg-[#e9f9e9] text-[#33a852]' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                                                <Icon size={12} />{l}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="px-4 pb-4 pt-3 border-t border-gray-50 shrink-0">
                                <button onClick={handleSaveMap} disabled={!mapAddress || isGeocodingPin}
                                    className="w-full bg-[#33a852] hover:bg-[#2d9548] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all text-[15px]">
                                    {isGeocodingPin
                                        ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Finding address...</span>
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
                    )}
                </div>

                {/* ── MAP PANEL (single instance — renders once) ─────────── */}
                {mode === 'map' && (
                    <div className={cn(
                        'flex flex-col flex-1 overflow-hidden',
                        // Mobile: takes remaining space below the left panel header
                        // Desktop: is the right column of the flex-row container
                    )}>
                        {/* Map search bar */}
                        <div className="shrink-0 px-3 py-2.5 bg-white border-b border-gray-100 relative z-10">
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus-within:border-[#33a852] transition-colors">
                                <Search size={16} className="text-gray-400 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Search area or street name..."
                                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                                    value={mapSearchQuery}
                                    onChange={(e) => { setMapSearchQuery(e.target.value); setShowMapDropdown(true); }}
                                    onFocus={() => setShowMapDropdown(true)}
                                    autoComplete="off"
                                />
                                {mapSearchQuery && (
                                    <button onClick={() => { setMapSearchQuery(''); setMapPredictions([]); setShowMapDropdown(false); }}>
                                        <X size={14} className="text-gray-400" />
                                    </button>
                                )}
                                {isMapSearching && <Loader2 size={14} className="animate-spin text-gray-400 shrink-0" />}
                            </div>
                            {showMapDropdown && mapSearchQuery.length >= 2 && (
                                <div className="absolute top-full left-3 right-3 mt-1 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-[50vh] overflow-y-auto z-30">
                                    {mapPredictions.map((pred) => (
                                        <button key={pred.place_id}
                                            onClick={() => { selectMapPrediction(pred); setShowMapDropdown(false); }}
                                            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0">
                                            <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-800 truncate">{pred.structured_formatting.main_text}</p>
                                                <p className="text-xs text-gray-400 truncate mt-0.5">{pred.structured_formatting.secondary_text}</p>
                                            </div>
                                        </button>
                                    ))}
                                    {!isMapSearching && mapPredictions.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-4">No results</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Map container — SINGLE instance, ref attached here only */}
                        <div className="flex-1 relative min-h-0">
                            {/*
                             * isolation:isolate creates a new stacking context so Google Maps'
                             * internal high z-indexes are contained within this div and don't
                             * compete with our controls (which live as siblings at z-[500]).
                             */}
                            <div ref={mapContainerRef} className="absolute inset-0" />

                            {/* Loading state */}
                            {!isLoaded && (
                                <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center gap-3 z-[500]">
                                    <Loader2 size={32} className="animate-spin text-[#33a852]" />
                                    <span className="text-sm text-gray-400 font-medium">Loading map...</span>
                                </div>
                            )}

                            {/* Fixed center pin — pointer-events-none so map pan still works */}
                            {isLoaded && (
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[500]">
                                    <div className={cn('flex flex-col items-center transition-all duration-200', isDragging ? '-translate-y-4' : '')}>
                                        {/* border-radius: 50% 50% 50% 0 + rotate(-45deg) = teardrop pointing DOWN */}
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

                            {/* Geocoding pill */}
                            {isGeocodingPin && (
                                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2 z-[500] border border-gray-100 pointer-events-none">
                                    <Loader2 size={13} className="animate-spin text-[#33a852]" />
                                    <span className="text-xs font-semibold text-gray-600">Finding address...</span>
                                </div>
                            )}

                            {/* GPS + Satellite controls are injected as native map.controls
                                in the useEffect — they are NOT React elements because Google Maps'
                                event-capture overlay blocks clicks on React siblings. */}

                            {/* Drag hint */}
                            {isLoaded && !isGeocodingPin && !mapAddress && !isDragging && (
                                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-gray-800/80 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full z-[500] whitespace-nowrap pointer-events-none">
                                    Drag map to move pin
                                </div>
                            )}
                        </div>

                        {/* Mobile-only address bottom sheet */}
                        <div className="md:hidden bg-white border-t border-gray-100 shrink-0">
                            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-2.5 mb-3" />
                            <div className="px-4 pb-4 max-h-[42vh] overflow-y-auto">
                                <div className="flex items-start gap-3 mb-4 pb-4 border-b border-gray-50">
                                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                                        <MapPin size={17} className="text-[#33a852]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-[15px] font-bold text-gray-800 leading-tight truncate">
                                            {mapShortAddress || (isGeocodingPin ? 'Detecting...' : 'Select a location')}
                                        </h3>
                                        <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-2">
                                            {mapAddress || 'Drag the map to position the pin on your address'}
                                        </p>
                                        {mapPincode && (
                                            <span className="inline-block mt-1.5 text-[11px] font-semibold text-[#33a852] bg-green-50 px-2 py-0.5 rounded-full">
                                                📍 {mapPincode} · {mapCity}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-3 mb-4">
                                    <input type="text" placeholder="Flat / House no / Floor / Building"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors"
                                        value={mapFlatInfo} onChange={(e) => setMapFlatInfo(e.target.value)} />
                                    <input type="text" placeholder="Nearby landmark (optional)"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors"
                                        value={mapLandmark} onChange={(e) => setMapLandmark(e.target.value)} />
                                </div>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {LABEL_OPTIONS.map(({ label: l, icon: Icon }) => (
                                        <button key={l} onClick={() => setMapLabel(l)}
                                            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-[12px] font-bold transition-all',
                                                mapLabel === l ? 'border-[#33a852] bg-[#e9f9e9] text-[#33a852]' : 'border-gray-200 text-gray-500')}>
                                            <Icon size={12} />{l}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={handleSaveMap} disabled={!mapAddress || isGeocodingPin}
                                    className="w-full bg-[#33a852] hover:bg-[#2d9548] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all text-[15px]">
                                    {isGeocodingPin
                                        ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Finding address...</span>
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
                )}
            </div>
        </>
    );
}
