'use client';

import React, { useEffect, useState } from 'react';
import { X, MapPin, Store, Home, Briefcase, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAddress, Address } from '@/context/AddressContext';
import { toast } from 'sonner';

type LabelType = 'Business' | 'Home' | 'Work' | 'Other';

const LABEL_OPTIONS: { label: LabelType; icon: React.ElementType }[] = [
    { label: 'Business', icon: Store },
    { label: 'Home', icon: Home },
    { label: 'Work', icon: Briefcase },
    { label: 'Other', icon: MapPin },
];

interface EditAddressOverlayProps {
    address: Address | null;
    onClose: () => void;
}

export function EditAddressOverlay({ address, onClose }: EditAddressOverlayProps) {
    const { updateAddress } = useAddress();
    const [label, setLabel] = useState<LabelType>('Business');
    const [businessName, setBusinessName] = useState('');
    const [fullAddress, setFullAddress] = useState('');
    const [flatInfo, setFlatInfo] = useState('');
    const [landmark, setLandmark] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!address) return;
        setLabel((address.label as LabelType) || 'Business');
        setBusinessName(address.businessName || '');
        setFullAddress(address.fullAddress || '');
        setFlatInfo(address.flatInfo || '');
        setLandmark(address.landmark || '');
    }, [address]);

    if (!address) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateAddress(address.id, {
                label,
                businessName: businessName || undefined,
                fullAddress: fullAddress || address.fullAddress,
                flatInfo: flatInfo || undefined,
                landmark: landmark || undefined,
            });
            toast.success('Address updated');
            onClose();
        } catch {
            toast.error('Could not update address');
        } finally {
            setIsSaving(false);
        }
    };

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
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Label</label>
                            <div className="grid grid-cols-4 gap-2">
                                {LABEL_OPTIONS.map(({ label: l, icon: Icon }) => (
                                    <button
                                        key={l}
                                        onClick={() => setLabel(l)}
                                        className={cn(
                                            'flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-[11px] font-bold transition-all',
                                            label === l
                                                ? 'border-[#33a852] bg-green-50/50 text-[#33a852]'
                                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                        )}
                                    >
                                        <Icon size={15} />
                                        {l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                Business Name <span className="text-gray-400 normal-case font-normal">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder="e.g. Malvan Tadka"
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] outline-none focus:border-[#33a852] transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Address</label>
                            <textarea
                                value={fullAddress}
                                onChange={(e) => setFullAddress(e.target.value)}
                                rows={2}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors resize-none"
                            />
                            {address.pincode && (
                                <p className="text-[11px] text-gray-400 mt-1.5">Pincode: {address.pincode} · To change the map pin, remove this address and add a new one.</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Floor / Unit / Building</label>
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
                                placeholder="Near main gate / opposite bus stop"
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#33a852] transition-colors"
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
                            disabled={isSaving}
                            className="flex-1 h-[44px] bg-[#33a852] hover:bg-[#2d9548] disabled:opacity-70 text-white rounded-xl text-[13px] font-bold transition-colors flex items-center justify-center gap-2"
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
