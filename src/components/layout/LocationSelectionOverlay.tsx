'use client';

import React, { useState } from 'react';
import {
    ArrowLeft, Search, MapPin, Loader2,
    Navigation, X, Trash2, Store, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAddress, Address } from '@/context/AddressContext';
import { useGooglePlacesAutocomplete, PlacePrediction } from '@/hooks/useGooglePlacesAutocomplete';
import { useGoogleMaps } from '@/components/providers/GoogleMapsProvider';
import { AddNewAddressOverlay } from './AddNewAddressOverlay';
import { EditAddressOverlay } from './EditAddressOverlay';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useStableSession } from '@/hooks/useStableSession';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { syncAddressToOutlet, prepareAccountForOutletSync } from '@/lib/syncAddressToOutlet';
import { toast } from 'sonner';

interface LocationSelectionOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

export function LocationSelectionOverlay({ isOpen, onClose }: LocationSelectionOverlayProps) {
    const { isLoaded, loadError } = useGoogleMaps();
    const confirm = useConfirm();
    const {
        selectedAddress,
        savedAddresses,
        isLoadingAddresses,
        setSelectedAddress,
        updateAddress,
        addAddress,
        removeAddress,
        detectCurrentLocation,
        isDetectingLocation,
    } = useAddress();

    const { isAuthenticated } = useStableSession();
    const {
        currentAccount,
        accounts,
        switchAccount,
        switchOutlet,
        refresh: refreshAccounts,
    } = useBusinessAccountSwitcher();

    const [searchQuery, setSearchQuery] = useState('');
    const [isAddNewOpen, setIsAddNewOpen] = useState(false);
    const [initialCoords, setInitialCoords] = useState<{ lat?: number; lng?: number }>({});
    const [editingAddress, setEditingAddress] = useState<Address | null>(null);

    // ─── Google Places autocomplete (address search in main overlay) ─────
    const { predictions, isSearching, getPlaceDetails, clearPredictions } =
        useGooglePlacesAutocomplete(searchQuery);

    // ─── Sync selected address with active session outlet ────────────────
    const handleSelectAddressAndSyncOutlet = async (addr: Address) => {
        setSelectedAddress(addr);

        // Selecting an address also makes it primary (isDefault + primaryOutletId via PATCH).
        // Only real SavedAddress UUIDs — skip guest/local ids (addr_…, current_…).
        const isDbId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(addr.id);
        if (isDbId) {
            try {
                await updateAddress(addr.id, { isDefault: true });
            } catch (err) {
                console.error('Error setting default address:', err);
            }
        }

        if (isAuthenticated) {
            try {
                const accountId = await prepareAccountForOutletSync(
                    accounts,
                    currentAccount,
                    switchAccount,
                );
                if (!accountId) {
                    toast.error('No business account found. Complete your profile or log in again.');
                    onClose();
                    return;
                }
                await syncAddressToOutlet({
                    accountId,
                    addr,
                    switchOutlet,
                    refreshAccounts,
                });
            } catch (err) {
                console.error('Error syncing address to outlet:', err);
                const msg = err instanceof Error ? err.message : 'Failed to sync outlet address';
                toast.error(msg);
            }
        }
        onClose();
    };

    // ─── Select a saved address ──────────────────────────────────────────
    const handleSelectSaved = async (addr: Address) => {
        await handleSelectAddressAndSyncOutlet(addr);
    };

    // ─── Select from autocomplete prediction — confirm before save for area-level picks ──
    const handleSelectPrediction = async (pred: PlacePrediction) => {
        const details = await getPlaceDetails(pred.placeId);
        if (!details) return;

        setSearchQuery('');
        clearPredictions();

        if (details.isAreaLevel || !details.pincodeReliable) {
            setInitialCoords({ lat: details.latitude, lng: details.longitude });
            setIsAddNewOpen(true);
            return;
        }

        const addressInput: Omit<Address, 'id'> = {
            label: 'Other',
            businessName: details.businessName,
            fullAddress: details.fullAddress,
            shortAddress: details.shortAddress,
            latitude: details.latitude,
            longitude: details.longitude,
            pincode: details.pincode,
            city: details.city,
            state: details.state,
            placeId: details.placeId,
            isDefault: false,
        };

        const saved = await addAddress(addressInput);
        if (saved) {
            await handleSelectAddressAndSyncOutlet(saved);
        }
    };

    // ─── Use current location ────────────────────────────────────────────
    const handleUseCurrentLocation = async () => {
        const detected = await detectCurrentLocation();
        if (detected) {
            await handleSelectAddressAndSyncOutlet(detected);
        }
    };

    // ─── Save from AddNewAddressOverlay ──────────────────────────────────
    const handleSaveNewAddress = async (address: Omit<Address, 'id'>) => {
        const saved = await addAddress(address);
        setIsAddNewOpen(false);
        if (saved) {
            await handleSelectAddressAndSyncOutlet(saved);
        } else {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Desktop backdrop */}
            <div
                className="hidden md:block fixed inset-0 z-[11000] bg-black/50 animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed inset-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-[11001] bg-white flex flex-col md:w-[480px] md:max-h-[80vh] md:rounded-2xl md:shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom md:slide-in-from-bottom-4 duration-300">

                {/* Header */}
                <div className="flex items-center justify-between p-4 bg-white sticky top-0 z-10 border-b border-gray-100 shrink-0">
                    <button onClick={onClose} className="p-1 -ml-1 md:hidden" aria-label="Close delivery location">
                        <ArrowLeft size={24} className="text-gray-700" />
                    </button>
                    <h2 className="text-xl font-bold text-gray-800">Delivery Location</h2>
                    <button onClick={onClose} className="p-1 -mr-1 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close delivery location">
                        <X size={22} className="text-gray-600" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 pt-2 pb-24 md:pb-4">

                    {/* Search Bar */}
                    <div className="mb-4 relative">
                        <div className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg w-full shadow-sm focus-within:border-[#33a852]/50 transition-colors">
                            <Search size={20} className="text-gray-400 shrink-0" />
                            <input
                                type="text"
                                placeholder={isLoaded ? 'Search area or street name...' : 'Loading maps...'}
                                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                disabled={!isLoaded}
                            />
                            {searchQuery && (
                                <button onClick={() => { setSearchQuery(''); clearPredictions(); }}>
                                    <X size={16} className="text-gray-400" />
                                </button>
                            )}
                            {isSearching && <Loader2 size={16} className="animate-spin text-gray-400 shrink-0" />}
                        </div>

                        {loadError && (
                            <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-xs text-amber-700">{loadError}</p>
                            </div>
                        )}

                        {predictions.length > 0 && (
                            <div className="mt-2 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden">
                                {predictions.map((pred) => (
                                    <button
                                        key={pred.placeId}
                                        onClick={() => handleSelectPrediction(pred)}
                                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                                    >
                                        <MapPin size={18} className="text-gray-400 mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 truncate">{pred.mainText}</p>
                                            <p className="text-xs text-gray-400 truncate mt-0.5">{pred.secondaryText}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Use Current Location */}
                    <button
                        onClick={handleUseCurrentLocation}
                        disabled={isDetectingLocation}
                        className="w-full flex items-center gap-4 p-4 bg-[#e9f9e9] border border-[#d1f2d1] rounded-lg mb-6 active:scale-[0.98] transition-transform text-left disabled:opacity-60"
                    >
                        <div className="w-10 h-10 shrink-0 bg-white rounded-full flex items-center justify-center shadow-sm">
                            {isDetectingLocation
                                ? <Loader2 size={20} className="animate-spin text-[#33a852]" />
                                : <Navigation size={20} className="text-[#33a852]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-[15px] font-bold text-[#33a852]">
                                {isDetectingLocation ? 'Detecting location...' : 'Use current location'}
                            </h3>
                            <p className="text-[11px] text-[#33a852]/70 font-medium truncate mt-0.5">
                                {selectedAddress?.shortAddress || 'Using GPS'}
                            </p>
                        </div>
                    </button>

                    {/* Saved Addresses */}
                    {isLoadingAddresses && (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 size={20} className="animate-spin text-[#33a852]" />
                            <span className="text-sm text-gray-400 ml-2">Loading delivery addresses...</span>
                        </div>
                    )}

                    {!isLoadingAddresses && savedAddresses.length > 0 && (
                        <>
                            <h3 className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider mb-3">
                                Delivery Addresses
                            </h3>
                            <div className="space-y-3 mb-6">
                                {savedAddresses.map((addr) => {
                                    const isSelected = selectedAddress?.id === addr.id;
                                    const title = addr.businessName
                                        || addr.shortAddress
                                        || addr.fullAddress.split(',').slice(0, 2).join(',')
                                        || 'Delivery address';
                                    const subtitle = addr.businessName
                                        ? (addr.shortAddress || addr.fullAddress)
                                        : addr.fullAddress;

                                    return (
                                        <div
                                            key={addr.id}
                                            onClick={() => handleSelectSaved(addr)}
                                            className={cn(
                                                'flex items-center gap-3 p-4 bg-white border rounded-xl shadow-sm cursor-pointer transition-all active:scale-[0.98]',
                                                isSelected
                                                    ? 'border-[#33a852] ring-1 ring-[#33a852]/20'
                                                    : 'border-gray-100 hover:border-gray-200'
                                            )}
                                        >
                                            <div className={cn(
                                                'w-10 h-10 shrink-0 rounded-xl flex items-center justify-center',
                                                isSelected ? 'bg-[#e9f9e9]' : 'bg-gray-50'
                                            )}>
                                                <MapPin size={20} className={isSelected ? 'text-[#33a852]' : 'text-gray-400'} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[14px] font-bold text-gray-800 truncate leading-tight">
                                                    {title}
                                                </p>
                                                {addr.flatInfo && (
                                                    <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                                        {addr.flatInfo}
                                                    </p>
                                                )}
                                                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                                    {subtitle}
                                                    {addr.pincode ? ` — ${addr.pincode}` : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingAddress(addr);
                                                    }}
                                                    className="p-2 hover:bg-green-50 rounded-full transition-colors"
                                                    aria-label="Edit address"
                                                >
                                                    <Pencil size={14} className="text-gray-300 hover:text-[#33a852]" />
                                                </button>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const ok = await confirm({
                                                            title: 'Remove address?',
                                                            message: `This will permanently remove "${title}" from your delivery addresses.`,
                                                            confirmText: 'Remove',
                                                            tone: 'danger',
                                                        });
                                                        if (ok) removeAddress(addr.id);
                                                    }}
                                                    className="p-2 hover:bg-red-50 rounded-full transition-colors"
                                                    aria-label="Remove address"
                                                >
                                                    <Trash2 size={15} className="text-gray-300 hover:text-red-400" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {!isLoadingAddresses && savedAddresses.length === 0 && (
                        <div className="text-center py-8 mb-8">
                            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Store size={28} className="text-gray-300" />
                            </div>
                            <h3 className="text-sm font-bold text-gray-500 mb-1">No delivery addresses yet</h3>
                            <p className="text-xs text-gray-400">Search for your restaurant, hotel or cafe below</p>
                        </div>
                    )}
                </div>

                {/* Sticky Bottom Button — opens in Business Search mode by default */}
                <div className="p-4 bg-white border-t border-gray-100 shrink-0">
                    <button
                        onClick={() => {
                            setInitialCoords({});
                            setIsAddNewOpen(true);
                        }}
                        className="w-full bg-[#33a852] hover:bg-[#2d9548] text-white font-bold py-4 rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <Store size={18} />
                        Add Delivery Address
                    </button>
                </div>
            </div>

            {/* Add New Address Overlay */}
            <AddNewAddressOverlay
                isOpen={isAddNewOpen}
                onClose={() => setIsAddNewOpen(false)}
                onSave={handleSaveNewAddress}
                initialLat={initialCoords.lat}
                initialLng={initialCoords.lng}
            />

            {/* Edit Address Overlay */}
            <EditAddressOverlay
                address={editingAddress}
                onClose={() => setEditingAddress(null)}
            />
        </>
    );
}
