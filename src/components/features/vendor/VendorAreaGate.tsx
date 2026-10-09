'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { useAddress } from '@/context/AddressContext';

/**
 * Shown instead of the product grid.
 * Outside the vendor's delivery area is not the same thing as out of stock.
 */
export function VendorAreaGate({
    mode,
    vendorName,
    pincode,
    allowPincodeChange,
}: {
    mode: 'enter-pincode' | 'outside';
    vendorName: string;
    pincode?: string;
    /** Guests can type a pin. A logged-in outlet pin is not overridden by this field. */
    allowPincodeChange: boolean;
}) {
    const { setSelectedAddress } = useAddress();
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');

    const savePincode = () => {
        const pin = draft.trim();
        if (!/^\d{6}$/.test(pin)) {
            setError('Enter a 6-digit pincode');
            return;
        }
        setError('');
        setSelectedAddress({
            id: `guest-pin-${pin}`,
            label: 'Delivery',
            fullAddress: `Pincode ${pin}`,
            shortAddress: pin,
            latitude: 0,
            longitude: 0,
            pincode: pin,
        });
        try {
            localStorage.setItem('user_pincode', pin);
            localStorage.setItem('pincode_interacted', 'true');
        } catch { /* private mode */ }
    };

    const showForm = mode === 'enter-pincode' || allowPincodeChange;

    return (
        <div className="max-w-md mx-auto px-4 py-16 text-center">
            <div className="size-14 mx-auto rounded-full bg-ivory flex items-center justify-center mb-4">
                <MapPin size={22} className="text-primary" />
            </div>
            {mode === 'enter-pincode' ? (
                <>
                    <h2 className="text-[18px] font-semibold text-text text-balance">Enter pincode</h2>
                    <p className="mt-2 text-[13px] text-text-secondary text-pretty">
                        {vendorName} delivers only inside its service area. Enter your pincode to see what you can order.
                    </p>
                </>
            ) : (
                <>
                    <h2 className="text-[18px] font-semibold text-text text-balance">
                        Doesn&apos;t deliver to {pincode}
                    </h2>
                    <p className="mt-2 text-[13px] text-text-secondary text-pretty">
                        {vendorName} does not deliver to {pincode}. Choose a supplier that covers this pincode.
                    </p>
                </>
            )}

            {showForm && (
                <form
                    className="mt-5 flex flex-col gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        savePincode();
                    }}
                >
                    <input
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={6}
                        value={draft}
                        placeholder="6-digit pincode"
                        aria-label="Delivery pincode"
                        onChange={(e) => {
                            setDraft(e.target.value.replace(/\D/g, '').slice(0, 6));
                            setError('');
                        }}
                        className="min-h-12 w-full rounded-xl border border-divider bg-white px-4 text-center text-[16px] font-semibold tracking-wide text-text outline-none focus:border-primary"
                    />
                    {error && <p className="text-[12px] font-medium text-error">{error}</p>}
                    <button
                        type="submit"
                        className="min-h-12 rounded-xl bg-primary px-5 text-[14px] font-semibold text-white hover:bg-primary-dark"
                    >
                        {mode === 'enter-pincode' ? 'Continue' : 'Check another pincode'}
                    </button>
                </form>
            )}

            {!allowPincodeChange && (
                <Link
                    href="/vendors"
                    className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-[14px] font-semibold text-white hover:bg-primary-dark"
                >
                    See suppliers for {pincode}
                </Link>
            )}
        </div>
    );
}
