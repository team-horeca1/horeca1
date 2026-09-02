'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, Navigation, Loader2, Store, X, CheckCircle } from 'lucide-react';
import { useStableSession } from '@/hooks/useStableSession';
import { cn } from '@/lib/utils';
import { useAddress } from '@/context/AddressContext';
import { useGooglePlacesAutocomplete } from '@/hooks/useGooglePlacesAutocomplete';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { syncAddressToOutlet, prepareAccountForOutletSync } from '@/lib/syncAddressToOutlet';
import { toast } from 'sonner';

interface InitialPincodeOverlayProps {
    onComplete: (pincode?: string) => void;
}

// Track if shown since last page reload
let hasBeenShownInSession = false;

type Tab = 'business' | 'pincode';

export function InitialPincodeOverlay({ onComplete }: InitialPincodeOverlayProps) {
    const { session, isAuthenticated, isResolved } = useStableSession();
    const activeOutletId = session?.user?.activeOutletId ?? null;
    const [isVisible, setIsVisible] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [tab, setTab] = useState<Tab>('business');

    // ─── Business Search State ────────────────────────────────────────────
    const [businessQuery, setBusinessQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [isFetchingPlace, setIsFetchingPlace] = useState(false);
    const [selectedName, setSelectedName] = useState('');
    const [selectedPincode, setSelectedPincode] = useState('');
    const [isCheckingServiceability, setIsCheckingServiceability] = useState(false);
    const [serviceabilityError, setServiceabilityError] = useState('');

    const { addAddress, setSelectedAddress, detectCurrentLocation, isDetectingLocation, geocodePincode } = useAddress();
    const { currentAccount, accounts, switchAccount, switchOutlet, refresh: refreshAccounts } = useBusinessAccountSwitcher();
    const { predictions, isSearching, getPlaceDetails, clearPredictions } =
        useGooglePlacesAutocomplete(businessQuery, { businessMode: true, countryCode: 'in' });

    // ─── Pincode State ────────────────────────────────────────────────────
    const [pincode, setPincode] = useState('');
    const [pincodeError, setPincodeError] = useState('');
    const [checkingPincode, setCheckingPincode] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (hasBeenShownInSession) return;

        if (!isResolved) return;

        // V2.2: logged-in users with an active outlet — pincode comes from the
        // outlet, not from this overlay. Skip showing the legacy chooser entirely.
        if (isAuthenticated && activeOutletId) {
            hasBeenShownInSession = true;
            return;
        }

        try {
            // Don't show if user already has an address selected or has previously interacted
            if (
                localStorage.getItem('pincode_interacted') === 'true' ||
                localStorage.getItem('horeca1_selected_address')
            ) return;
        } catch { /* ignore */ }

        setIsVisible(true);
        hasBeenShownInSession = true;
    }, [isResolved, isAuthenticated, activeOutletId]);

    if (!isMounted || !isVisible) return null;

    const syncOutletIfLoggedIn = async (addr: {
        fullAddress: string;
        businessName?: string;
        label?: string;
        flatInfo?: string;
        landmark?: string;
        city?: string;
        state?: string;
        pincode?: string;
        latitude: number;
        longitude: number;
        placeId?: string;
    }) => {
        if (!isAuthenticated) return;
        try {
            const accountId = await prepareAccountForOutletSync(
                accounts,
                currentAccount,
                switchAccount,
            );
            if (!accountId) return;
            await syncAddressToOutlet({
                accountId,
                addr,
                switchOutlet,
                refreshAccounts,
            });
        } catch (err) {
            console.error('Error syncing address to outlet:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to sync delivery outlet');
        }
    };

    const handleSkip = () => {
        localStorage.setItem('pincode_interacted', 'true');
        setIsVisible(false);
        onComplete();
    };

    // ─── Business selection flow ──────────────────────────────────────────

    const handleSelectBusiness = async (placeId: string, mainText: string) => {
        setShowDropdown(false);
        setBusinessQuery(mainText);
        clearPredictions();
        setIsFetchingPlace(true);
        setServiceabilityError('');

        const details = await getPlaceDetails(placeId);
        if (!details) { setIsFetchingPlace(false); return; }

        setSelectedName(details.businessName || mainText);
        setSelectedPincode(details.pincode || '');
        setIsFetchingPlace(false);

        if (!details.pincode) {
            setServiceabilityError('Could not detect pincode for this location. Please enter manually below.');
            setTab('pincode');
            return;
        }

        // Check serviceability
        setIsCheckingServiceability(true);
        try {
            const res = await fetch(`/api/v1/vendors/serviceability?pincode=${details.pincode}`);
            const json = await res.json();
            // API wraps the result in a { success, data } envelope — unwrap it.
            const data = json.data ?? json;

            localStorage.setItem('pincode_interacted', 'true');
            localStorage.setItem('user_pincode', details.pincode);

            // Save address to context (DB-backed if logged in)
            const saved = await addAddress({
                label: 'Business',
                businessName: details.businessName || mainText,
                fullAddress: details.fullAddress,
                shortAddress: details.shortAddress,
                latitude: details.latitude,
                longitude: details.longitude,
                pincode: details.pincode,
                city: details.city,
                state: details.state,
                placeId: details.placeId,
                isDefault: true,
            });
            if (saved) {
                setSelectedAddress(saved);
                await syncOutletIfLoggedIn(saved);
            }

            if (!data.serviceable && !data.vendor_count) {
                setServiceabilityError(`We're not in ${details.city || 'your area'} yet, but your address is saved for when we expand!`);
            }

            setIsVisible(false);
            onComplete(details.pincode);
        } catch {
            localStorage.setItem('pincode_interacted', 'true');
            if (details.pincode) localStorage.setItem('user_pincode', details.pincode);
            setIsVisible(false);
            onComplete(details.pincode);
        } finally {
            setIsCheckingServiceability(false);
        }
    };

    // ─── GPS flow ─────────────────────────────────────────────────────────

    const handleUseGPS = async () => {
        const detected = await detectCurrentLocation();
        if (detected) {
            if (detected.pincode) {
                localStorage.setItem('pincode_interacted', 'true');
                localStorage.setItem('user_pincode', detected.pincode);
            }
            await syncOutletIfLoggedIn(detected);
            setIsVisible(false);
            onComplete(detected.pincode);
        }
    };

    // ─── Pincode flow ─────────────────────────────────────────────────────

    const handlePincodeSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (pincode.length !== 6) { setPincodeError('Enter a valid 6-digit pincode'); return; }
        setCheckingPincode(true);
        setPincodeError('');
        try {
            const res = await fetch(`/api/v1/vendors/serviceability?pincode=${pincode}`);
            const json = await res.json();
            // API wraps the result in a { success, data } envelope — unwrap it.
            const data = json.data ?? json;
            if (data.serviceable || data.vendor_count > 0) {
                localStorage.setItem('pincode_interacted', 'true');
                localStorage.setItem('user_pincode', pincode);
                // Resolve the pincode to a real location so the "Deliver to"
                // chip reflects the actual area, never a fabricated default.
                const geo = await geocodePincode(pincode);
                setSelectedAddress({
                    id: `pin_${Date.now()}`,
                    label: 'Other',
                    fullAddress: geo?.fullAddress || `Pincode ${pincode}`,
                    shortAddress: geo?.shortAddress || `Pincode ${pincode}`,
                    latitude: geo?.latitude ?? 0,
                    longitude: geo?.longitude ?? 0,
                    pincode,
                    city: geo?.city,
                    state: geo?.state,
                    placeId: geo?.placeId,
                });
                setIsVisible(false);
                onComplete(pincode);
            } else {
                setPincodeError("Sorry, we don't deliver to this pincode yet.");
            }
        } catch {
            localStorage.setItem('pincode_interacted', 'true');
            localStorage.setItem('user_pincode', pincode);
            setIsVisible(false);
            onComplete(pincode);
        } finally {
            setCheckingPincode(false);
        }
    };

    const isBusy = isFetchingPlace || isCheckingServiceability || isDetectingLocation;

    return (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center px-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Card */}
            <div className="relative w-full max-w-[460px] bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 md:p-8">

                    {/* Header */}
                    <div className="text-center mb-6">
                        <div className="w-12 h-12 bg-primary-light rounded-2xl flex items-center justify-center mx-auto mb-3">
                            <MapPin size={24} className="text-primary" />
                        </div>
                        <h2 className="text-[20px] font-bold text-[#181725] mb-1">Choose Delivery Location</h2>
                        <p className="text-[13px] text-gray-400">Find your restaurant, hotel or cafe</p>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5">
                        <button
                            onClick={() => setTab('business')}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-bold transition-all',
                                tab === 'business'
                                    ? 'bg-white text-primary shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                            )}
                        >
                            <Store size={14} />
                            Search Business
                        </button>
                        <button
                            onClick={() => setTab('pincode')}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-bold transition-all',
                                tab === 'pincode'
                                    ? 'bg-white text-primary shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                            )}
                        >
                            <Search size={14} />
                            Enter Pincode
                        </button>
                    </div>

                    {/* ─── Business Search Tab ─────────────────────────────── */}
                    {tab === 'business' && (
                        <div>
                            {/* Search input */}
                            <div className="relative mb-3">
                                <div className={cn(
                                    'flex items-center gap-3 px-4 py-3 border-2 rounded-xl transition-all',
                                    'border-gray-200 focus-within:border-primary bg-white'
                                )}>
                                    <Store size={18} className="text-primary shrink-0" />
                                    <input
                                        type="text"
                                        value={businessQuery}
                                        onChange={(e) => {
                                            setBusinessQuery(e.target.value);
                                            setShowDropdown(true);
                                            setSelectedName('');
                                            setSelectedPincode('');
                                            setServiceabilityError('');
                                        }}
                                        placeholder="e.g. The Grand Hotel, Chai Point..."
                                        className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-gray-400"
                                        autoComplete="off"
                                        autoFocus
                                    />
                                    {isBusy && <Loader2 size={16} className="animate-spin text-primary shrink-0" />}
                                    {businessQuery && !isBusy && (
                                        <button onClick={() => { setBusinessQuery(''); setSelectedName(''); clearPredictions(); }}>
                                            <X size={16} className="text-gray-400" />
                                        </button>
                                    )}
                                </div>

                                {/* Dropdown */}
                                {showDropdown && businessQuery.length >= 2 && !selectedName && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl max-h-[200px] overflow-y-auto z-30">
                                        {isSearching && (
                                            <div className="flex items-center justify-center py-4">
                                                <Loader2 size={16} className="animate-spin text-gray-400" />
                                                <span className="text-xs text-gray-400 ml-2">Searching...</span>
                                            </div>
                                        )}
                                        {!isSearching && predictions.length === 0 && (
                                            <div className="py-4 text-center text-xs text-gray-400">
                                                No results — try a different name
                                            </div>
                                        )}
                                        {predictions.map((pred) => (
                                            <button
                                                key={pred.placeId}
                                                onClick={() => handleSelectBusiness(pred.placeId, pred.mainText)}
                                                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-primary-light transition-colors text-left border-b border-gray-50 last:border-0"
                                            >
                                                <Store size={15} className="text-primary mt-0.5 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-bold text-gray-800 truncate">{pred.mainText}</p>
                                                    <p className="text-[11px] text-gray-400 truncate">{pred.secondaryText}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Selected business confirmation */}
                            {selectedName && (
                                <div className="flex items-center gap-2 px-4 py-3 bg-primary-light border border-primary/20 rounded-xl mb-3">
                                    <CheckCircle size={16} className="text-primary shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-bold text-primary truncate">{selectedName}</p>
                                        {selectedPincode && (
                                            <p className="text-[11px] text-primary">Pincode: {selectedPincode}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {serviceabilityError && (
                                <p className="text-[12px] text-amber-600 font-medium text-center mb-3 px-2">
                                    {serviceabilityError}
                                </p>
                            )}

                            {/* GPS option */}
                            <button
                                onClick={handleUseGPS}
                                disabled={isBusy}
                                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:border-primary/30 hover:bg-primary-light/30 transition-all disabled:opacity-60 mb-4"
                            >
                                {isDetectingLocation
                                    ? <Loader2 size={18} className="animate-spin text-primary shrink-0" />
                                    : <Navigation size={18} className="text-primary shrink-0" />}
                                <span className="text-[13px] font-semibold text-gray-700">
                                    {isDetectingLocation ? 'Detecting location...' : 'Use my current location (GPS)'}
                                </span>
                            </button>
                        </div>
                    )}

                    {/* ─── Pincode Tab ─────────────────────────────────────── */}
                    {tab === 'pincode' && (
                        <form onSubmit={handlePincodeSubmit} className="mb-4 space-y-3">
                            <div className={cn(
                                'flex items-center gap-3 px-4 py-3 border-2 rounded-xl transition-all',
                                pincodeError ? 'border-red-400 bg-red-50/30' : 'border-gray-200 focus-within:border-primary'
                            )}>
                                <Search size={18} className={cn('shrink-0', pincodeError ? 'text-red-400' : 'text-primary')} />
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={pincode}
                                    onChange={(e) => { setPincode(e.target.value.replace(/\D/g, '')); setPincodeError(''); }}
                                    placeholder="Enter 6-digit pincode"
                                    className="flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-gray-400"
                                    maxLength={6}
                                    autoFocus
                                />
                            </div>

                            {pincodeError && (
                                <p className="text-[12px] font-semibold text-red-500 text-center animate-in fade-in">
                                    {pincodeError}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={checkingPincode}
                                className="w-full bg-primary hover:bg-primary-dark disabled:opacity-70 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98]"
                            >
                                {checkingPincode ? 'Checking...' : 'Confirm Pincode'}
                            </button>
                        </form>
                    )}

                    {/* Skip */}
                    <button
                        onClick={handleSkip}
                        className="w-full text-[12px] font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-wider py-2"
                    >
                        Go Without Location
                    </button>
                </div>
            </div>
        </div>
    );
}
