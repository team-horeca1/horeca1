'use client';

import React, { useState, useEffect } from 'react';
import { Search, MapPin } from 'lucide-react';
import { useStableSession } from '@/hooks/useStableSession';
import { cn } from '@/lib/utils';
import { useAddress } from '@/context/AddressContext';

interface InitialPincodeOverlayProps {
    onComplete: (pincode?: string) => void;
}

// Track if shown since last page reload
let hasBeenShownInSession = false;

export function InitialPincodeOverlay({ onComplete }: InitialPincodeOverlayProps) {
    const { session, isAuthenticated, isResolved } = useStableSession();
    const activeOutletId = session?.user?.activeOutletId ?? null;
    const [isVisible, setIsVisible] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    const { setSelectedAddress, geocodePincode } = useAddress();

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

    const handleSkip = () => {
        localStorage.setItem('pincode_interacted', 'true');
        setIsVisible(false);
        onComplete();
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
                        <h2 className="text-[20px] font-bold text-[#181725] mb-1">Choose delivery pincode</h2>
                        <p className="text-[13px] text-gray-400">Type a 6-digit pincode. You can add the full address later.</p>
                    </div>

                    {/* ─── Pincode ─────────────────────────────────────────── */}
                    {(
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
