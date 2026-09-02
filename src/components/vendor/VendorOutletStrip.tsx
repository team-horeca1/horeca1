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
    const [pinCounts, setPinCounts] = useState<Record<string, number>>({});
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

    useEffect(() => {
        let cancelled = false;
        fetch('/api/v1/vendor/outlets')
            .then((r) => r.json())
            .then((json) => {
                if (cancelled || !json.success) return;
                const map: Record<string, number> = {};
                for (const o of json.data?.outlets ?? []) {
                    map[o.id as string] = Number(o.serviceAreaCount ?? 0);
                }
                setPinCounts(map);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [currentAccount?.id, isPickerOpen]);

    if (loading) {
        return (
            <div
                className="relative z-10 w-full bg-primary-light/60 border-b border-primary/20 px-[clamp(1rem,2.5vw,2rem)] py-[clamp(0.4rem,0.8vw,0.7rem)] flex items-center gap-3 text-[12px] text-primary/70"
                aria-busy="true"
                aria-label="Loading active outlet"
            >
                <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
                <span className="h-3 w-40 max-w-[50%] rounded bg-primary-light animate-pulse" />
            </div>
        );
    }

    if (!currentAccount || currentAccount.outlets.length === 0) {
        return null;
    }

    const outlets = accessibleOutletIds.length > 0
        ? currentAccount.outlets.filter((o) => accessibleOutletIds.includes(o.id))
        : currentAccount.outlets;
    const hasMultipleOutlets = outlets.length > 1;
    const requiresAddressUpdate = currentOutlet?.requiresAddressUpdate ?? false;
    const activePinCount = currentOutlet ? (pinCounts[currentOutlet.id] ?? null) : null;

    const handleOutletPick = async (outletId: string) => {
        if (outletId === currentOutlet?.id) {
            setIsPickerOpen(false);
            return;
        }
        setIsPickerOpen(false);
        await switchOutlet(outletId);
        // Pass id so Inventory refetches this warehouse immediately (before React state settles).
        emitVendorOutletChanged(outletId);
        const picked = outlets.find((o) => o.id === outletId);
        toast.success(`Now viewing stock for ${picked?.name ?? 'warehouse'}`);
    };

    return (
        <div className="relative z-10 w-full bg-primary-light/70 border-b border-primary/20 px-[clamp(1rem,2.5vw,2rem)] py-[clamp(0.45rem,0.9vw,0.7rem)]">
            <div className="flex flex-wrap items-center gap-x-[clamp(0.75rem,1.5vw,1.25rem)] gap-y-1.5">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-[28px] h-[28px] rounded-full bg-primary-light flex items-center justify-center shrink-0">
                        <Warehouse size={14} className="text-primary" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary/80 shrink-0">
                        Warehouse
                    </span>
                    <span className="text-[13px] font-bold text-primary truncate">
                        {currentOutlet?.name ?? 'No outlet selected'}
                    </span>
                    {currentOutlet?.pincode && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[12px] text-primary/70 font-medium">
                            <MapPin size={11} className="text-primary/70" />
                            {currentOutlet.pincode}
                        </span>
                    )}
                    {activePinCount != null && (
                        <span className="hidden md:inline text-[11px] text-primary/70 font-medium">
                            · {activePinCount === 0 ? 'No delivery pins' : `${activePinCount} delivery pin${activePinCount === 1 ? '' : 's'}`}
                        </span>
                    )}
                </div>

                {requiresAddressUpdate && (
                    <Link
                        href="/vendor/outlets"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors text-[11px] font-bold border border-amber-200"
                    >
                        <AlertCircle size={12} />
                        Address pending
                    </Link>
                )}

                <div className="ml-auto flex items-center gap-2 relative" ref={pickerRef}>
                    {hasMultipleOutlets ? (
                        <button
                            type="button"
                            onClick={() => setIsPickerOpen((v) => !v)}
                            disabled={switching}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 hover:bg-white border border-primary/30 text-primary text-[12px] font-bold transition-colors disabled:opacity-50"
                        >
                            {switching ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <Warehouse size={12} />
                            )}
                            Switch warehouse
                            <ChevronDown
                                size={12}
                                className={cn('transition-transform', isPickerOpen && 'rotate-180')}
                            />
                        </button>
                    ) : (
                        <Link
                            href="/vendor/outlets?action=add"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/70 hover:bg-white border border-primary/30 text-primary text-[11px] font-bold transition-colors"
                        >
                            <Plus size={11} />
                            Add warehouse
                        </Link>
                    )}

                    {isPickerOpen && hasMultipleOutlets && (
                        <div className="absolute right-0 top-[calc(100%+6px)] w-[clamp(260px,30vw,340px)] bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-[#F0F0F0] z-[80] overflow-hidden">
                            <div className="px-4 py-2 border-b border-[#F0F0F0]">
                                <p className="text-[11px] font-semibold text-[#AEAEAE] uppercase tracking-wider">
                                    Select warehouse — stock is separate for each
                                </p>
                            </div>
                            <div className="max-h-[260px] overflow-y-auto py-1">
                                {outlets.map((o) => {
                                    const isActive = o.id === currentOutlet?.id;
                                    const pins = pinCounts[o.id];
                                    return (
                                        <button
                                            key={o.id}
                                            type="button"
                                            onClick={() => handleOutletPick(o.id)}
                                            disabled={switching}
                                            className={cn(
                                                'w-full px-4 py-2.5 hover:bg-primary-light flex items-center gap-3 text-left transition-colors disabled:opacity-50',
                                                isActive && 'bg-primary-light/50',
                                            )}
                                        >
                                            <Warehouse size={14} className="text-primary shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-semibold text-[#181725] truncate">
                                                    {o.name}
                                                </p>
                                                <p className="text-[11px] text-[#AEAEAE]">
                                                    {o.pincode ? `Pin ${o.pincode}` : 'No address pin'}
                                                    {' · '}
                                                    {pins == null
                                                        ? '…'
                                                        : pins === 0
                                                            ? 'No delivery pins'
                                                            : `${pins} delivery pin${pins === 1 ? '' : 's'}`}
                                                </p>
                                            </div>
                                            {o.requiresAddressUpdate && (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 shrink-0">
                                                    Address needed
                                                </span>
                                            )}
                                            {isActive && (
                                                <Check size={14} className="text-primary shrink-0" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="border-t border-[#F0F0F0] flex flex-col">
                                {currentOutlet && (
                                    <Link
                                        href={`/vendor/settings?tab=delivery&outletId=${currentOutlet.id}`}
                                        onClick={() => setIsPickerOpen(false)}
                                        className="flex items-center gap-2 px-4 py-2.5 text-primary hover:bg-primary-light/60 transition-colors text-[12px] font-bold"
                                    >
                                        <MapPin size={14} />
                                        Delivery pins for {currentOutlet.name}
                                    </Link>
                                )}
                                <Link
                                    href="/vendor/outlets"
                                    onClick={() => setIsPickerOpen(false)}
                                    className="flex items-center gap-2 px-4 py-2.5 border-t border-[#F0F0F0] text-[#7C7C7C] hover:bg-gray-50 transition-colors text-[12px] font-bold"
                                >
                                    Manage warehouses
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
