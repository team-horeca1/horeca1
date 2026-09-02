'use client';

import React, { useEffect, useState } from 'react';
import { X, MapPin, Loader2 } from 'lucide-react';
import { useAddress, Address } from '@/context/AddressContext';
import { AddressAutocomplete, type AddressPickPayload } from '@/components/ui/AddressAutocomplete';
import { toast } from 'sonner';

interface EditAddressOverlayProps {
    address: Address | null;
    onClose: () => void;
}

export function EditAddressOverlay({ address, onClose }: EditAddressOverlayProps) {
    const { updateAddress } = useAddress();
    const [businessName, setBusinessName] = useState('');
    const [fullAddress, setFullAddress] = useState('');
    const [shortAddress, setShortAddress] = useState('');
    const [flatInfo, setFlatInfo] = useState('');
    const [landmark, setLandmark] = useState('');
    const [pincode, setPincode] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [placeId, setPlaceId] = useState<string | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!address) return;
        setBusinessName(address.businessName || '');
        setFullAddress(address.fullAddress || '');
        setShortAddress(address.shortAddress || '');
        setFlatInfo(address.flatInfo || '');
        setLandmark(address.landmark || '');
        setPincode(address.pincode || '');
        setCity(address.city || '');
        setState(address.state || '');
        setLatitude(Number.isFinite(address.latitude) ? address.latitude : null);
        setLongitude(Number.isFinite(address.longitude) ? address.longitude : null);
        setPlaceId(address.placeId);
    }, [address]);

    if (!address) return null;

    const handlePick = (place: AddressPickPayload) => {
        setFullAddress(place.fullAddress);
        setShortAddress(place.shortAddress);
        setPincode(place.pincode);
        setCity(place.city);
        setState(place.state);
        setLatitude(place.latitude);
        setLongitude(place.longitude);
        setPlaceId(place.placeId);
        // Overwrite business name when Places returns one; keep existing if street-only pick.
        if (place.businessName) {
            setBusinessName(place.businessName);
        }
    };

    const canSave = fullAddress.trim().length > 0
        && !fullAddress.includes('Address pending');

    const handleSave = async () => {
        if (!canSave) {
            toast.error('Search and pick a real delivery address');
            return;
        }
        setIsSaving(true);
        try {
            await updateAddress(address.id, {
                businessName: businessName.trim() || undefined,
                fullAddress: fullAddress.trim(),
                shortAddress: shortAddress.trim() || fullAddress.trim().split(',').slice(0, 2).join(', '),
                flatInfo: flatInfo.trim() || undefined,
                landmark: landmark.trim() || undefined,
                pincode: pincode.trim() || undefined,
                city: city.trim() || undefined,
                state: state.trim() || undefined,
                ...(latitude !== null && longitude !== null
                    ? { latitude, longitude }
                    : {}),
                ...(placeId ? { placeId } : {}),
            });
            toast.success('Address updated');
            onClose();
        } catch {
            toast.error('Could not update address');
        } finally {
            setIsSaving(false);
        }
    };

    const isPlaceholder = fullAddress.includes('Address pending') || !fullAddress.trim();

    return (
        <>
            <div
                className="fixed inset-0 z-[15000] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />
            <div className="fixed inset-0 z-[15001] flex items-end md:items-center justify-center p-0 md:p-4 pointer-events-none">
                <div
                    className="w-full md:max-w-[460px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95 duration-300 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <h2 className="text-[16px] font-bold text-gray-800">Edit delivery address</h2>
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
                            <X size={18} className="text-gray-600" />
                        </button>
                    </div>

                    <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                        <AddressAutocomplete
                            label="Search address"
                            placeholder="Search area, street, or business name…"
                            businessMode
                            hint="Pick a place from search — this sets the map pin, pincode, city and state."
                            initialValue={isPlaceholder ? '' : fullAddress}
                            onPick={handlePick}
                        />

                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                Business Name <span className="text-gray-400 normal-case font-normal">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder="e.g. Malvan Tadka"
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] outline-none focus:border-primary transition-colors"
                            />
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
                                <MapPin size={16} className="text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-bold text-gray-800 leading-tight">
                                    {isPlaceholder
                                        ? 'No location set yet'
                                        : (shortAddress || fullAddress.split(',').slice(0, 2).join(','))}
                                </p>
                                <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">
                                    {isPlaceholder
                                        ? 'Use search above to pick a delivery location'
                                        : fullAddress}
                                </p>
                                {pincode && !isPlaceholder && (
                                    <span className="inline-block mt-1.5 text-[11px] font-semibold text-primary bg-primary-light px-2 py-0.5 rounded-full">
                                        {pincode}{city ? ` · ${city}` : ''}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Floor / Unit / Building</label>
                            <input
                                type="text"
                                value={flatInfo}
                                onChange={(e) => setFlatInfo(e.target.value)}
                                placeholder="e.g. Ground Floor, Shop 4"
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-primary transition-colors"
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
                                placeholder="Near main gate / opposite bus stop"
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-primary transition-colors"
                            />
                        </div>
                    </div>

                    <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
                        <button
                            onClick={onClose}
                            className="h-[44px] px-5 bg-white border border-gray-200 text-gray-700 rounded-xl text-[13px] font-bold hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving || !canSave}
                            className="flex-1 h-[44px] bg-primary hover:bg-primary-dark disabled:opacity-70 text-white rounded-xl text-[13px] font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            {isSaving && <Loader2 size={15} className="animate-spin" />}
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
