'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Warehouse, MapPin, Check, AlertCircle, ChevronDown, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { emitVendorOutletChanged } from '@/hooks/useVendorOutletScope';
import { cn } from '@/lib/utils';

export function VendorOutletStrip() {
    const {
        loading,
        switching,
        currentAccount,
        currentOutlet,
        switchOutlet,
        accessibleOutletIds,
    } = useBusinessAccountSwitcher();

    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isPickerOpen) return;
        function onMouseDown(e: MouseEvent) {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setIsPickerOpen(false);
            }
        }
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [isPickerOpen]);

    // While auth/account data is still loading, render a neutral placeholder
    // strip so layout doesn't jump.
    if (loading) {
        return (
            <div
                className="w-full bg-emerald-50/60 border-b border-emerald-100/80 px-[clamp(1rem,2.5vw,2rem)] py-[clamp(0.4rem,0.8vw,0.7rem)] flex items-center gap-3 text-[12px] text-emerald-700/70"
                aria-busy="true"
                aria-label="Loading active outlet"
            >
                <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
                <span className="h-3 w-40 max-w-[50%] rounded bg-emerald-100/80 animate-pulse" />
            </div>
        );
    }

    // Vendors with no outlets attached — render nothing rather than a broken UI.
    if (!currentAccount || currentAccount.outlets.length === 0) {
        return null;
    }

    // Filter to only the outlets the user actually has access to.
    const outlets = accessibleOutletIds.length > 0
        ? currentAccount.outlets.filter((o) => accessibleOutletIds.includes(o.id))
        : currentAccount.outlets;
    const hasMultipleOutlets = outlets.length > 1;
    const requiresAddressUpdate = currentOutlet?.requiresAddressUpdate ?? false;

    const handleOutletPick = async (outletId: string) => {
        if (outletId === currentOutlet?.id) {
            setIsPickerOpen(false);
            return;
        }
        setIsPickerOpen(false);
        await switchOutlet(outletId);
        const picked = outlets.find((o) => o.id === outletId);
        toast.success(`Now operating from ${picked?.name ?? 'warehouse'}`);
        emitVendorOutletChanged();
    };

    return (
        <div className="w-full bg-emerald-50/70 border-b border-emerald-100 px-[clamp(1rem,2.5vw,2rem)] py-[clamp(0.45rem,0.9vw,0.7rem)]">
            <div className="flex flex-wrap items-center gap-x-[clamp(0.75rem,1.5vw,1.25rem)] gap-y-1.5">
                {/* Icon + Operating from label */}
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-[28px] h-[28px] rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <Warehouse size={14} className="text-emerald-700" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/80 shrink-0">
                        Operating from
                    </span>
                    <span className="text-[13px] font-bold text-emerald-900 truncate">
                        {currentOutlet?.name ?? 'No outlet selected'}
                    </span>
                    {currentOutlet?.pincode && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[12px] text-emerald-800/70 font-medium">
                            <MapPin size={11} className="text-emerald-700/70" />
                            {currentOutlet.pincode}
                        </span>
                    )}
                </div>

                {/* Pending-address warning pill */}
                {requiresAddressUpdate && (
                    <Link
                        href="/vendor/outlets"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors text-[11px] font-bold border border-amber-200"
                    >
                        <AlertCircle size={12} />
                        Address pending — complete in account settings
                    </Link>
                )}

                {/* Switch outlet trigger */}
                <div className="ml-auto relative" ref={pickerRef}>
                    {hasMultipleOutlets ? (
                        <button
                            type="button"
                            onClick={() => setIsPickerOpen((v) => !v)}
                            disabled={switching}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 hover:bg-white border border-emerald-200 text-emerald-800 text-[12px] font-bold transition-colors disabled:opacity-50"
                        >
                            {switching ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <MapPin size={12} />
                            )}
                            Switch outlet
                            <ChevronDown
                                size={12}
                                className={cn('transition-transform', isPickerOpen && 'rotate-180')}
                            />
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-emerald-700/60">
                                Single warehouse
                            </span>
                            <Link
                                href="/vendor/outlets?action=add"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/70 hover:bg-white border border-emerald-200 text-emerald-800 text-[11px] font-bold transition-colors"
                            >
                                <Plus size={11} />
                                Add warehouse
                            </Link>
                        </div>
                    )}

                    {isPickerOpen && hasMultipleOutlets && (
                        <div className="absolute right-0 top-[calc(100%+6px)] w-[clamp(240px,28vw,320px)] bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#F0F0F0] z-50 overflow-hidden">
                            <div className="px-4 py-2 border-b border-[#F0F0F0]">
                                <p className="text-[11px] font-semibold text-[#AEAEAE] uppercase tracking-wider">
                                    Select warehouse
                                </p>
                            </div>
                            <div className="max-h-[260px] overflow-y-auto py-1">
                                {outlets.map((o) => {
                                    const isActive = o.id === currentOutlet?.id;
                                    return (
                                        <button
                                            key={o.id}
                                            type="button"
                                            onClick={() => handleOutletPick(o.id)}
                                            disabled={switching}
                                            className={cn(
                                                'w-full px-4 py-2.5 hover:bg-emerald-50 flex items-center gap-3 text-left transition-colors disabled:opacity-50',
                                                isActive && 'bg-emerald-50/50',
                                            )}
                                        >
                                            <Warehouse size={14} className="text-emerald-700 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-semibold text-[#181725] truncate">
                                                    {o.name}
                                                </p>
                                                {o.pincode && (
                                                    <p className="text-[11px] text-[#AEAEAE]">{o.pincode}</p>
                                                )}
                                            </div>
                                            {o.requiresAddressUpdate && (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 shrink-0">
                                                    Address needed
                                                </span>
                                            )}
                                            {isActive && (
                                                <Check size={14} className="text-emerald-600 shrink-0" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <Link
                                href="/vendor/outlets?action=add"
                                onClick={() => setIsPickerOpen(false)}
                                className="flex items-center gap-2 px-4 py-3 border-t border-[#F0F0F0] text-emerald-800 hover:bg-emerald-50/60 transition-colors text-[12px] font-bold"
                            >
                                <Plus size={14} />
                                Add warehouse
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
