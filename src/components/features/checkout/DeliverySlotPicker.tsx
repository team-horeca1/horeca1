'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Clock } from 'lucide-react';

interface Slot {
    id: string;
    slotStart: string;
    slotEnd: string;
    cutoffTime: string;
    pastCutoff: boolean;
}

interface Day {
    date: string;
    dayOfWeek: number;
    dayLabel: string;
    slots: Slot[];
}

interface DeliverySlotPickerProps {
    vendorId: string;
    selectedSlotId: string | null;
    onChange: (slotId: string | null) => void;
}

export function DeliverySlotPicker({ vendorId, selectedSlotId, onChange }: DeliverySlotPickerProps) {
    const [days, setDays] = useState<Day[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeDate, setActiveDate] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => setLoading(true));
        fetch(`/api/v1/vendors/${vendorId}/delivery-slots?days=3`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                const fetched: Day[] = json?.data?.days ?? [];
                setDays(fetched);
                const firstWithSelectable = fetched.find(d => d.slots.some(s => !s.pastCutoff));
                setActiveDate(firstWithSelectable?.date ?? fetched[0]?.date ?? null);
            })
            .catch(() => {
                if (!cancelled) setDays([]);
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [vendorId]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                Loading delivery slots…
            </div>
        );
    }

    if (days.length === 0) {
        return (
            <div className="px-4 py-3 text-[12px] text-gray-400 bg-gray-50 rounded-xl">
                No delivery slots configured. Vendor will confirm delivery window after order.
            </div>
        );
    }

    const active = days.find(d => d.date === activeDate) ?? days[0];

    return (
        <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <Clock size={12} />
                Pick Delivery Slot
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {days.map(d => (
                    <button
                        key={d.date}
                        type="button"
                        onClick={() => setActiveDate(d.date)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                            activeDate === d.date
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                    >
                        {d.dayLabel}
                    </button>
                ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {active.slots.map(s => {
                    const selected = selectedSlotId === s.id;
                    const disabled = s.pastCutoff;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => !disabled && onChange(selected ? null : s.id)}
                            disabled={disabled}
                            className={`px-3 py-2 rounded-xl text-[11px] font-semibold border text-left transition-all ${
                                disabled
                                    ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed line-through'
                                    : selected
                                        ? 'bg-primary text-white border-primary shadow-md shadow-green-100'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-primary/40'
                            }`}
                        >
                            <div className="font-bold">{s.slotStart}–{s.slotEnd}</div>
                            <div className={`text-[10px] mt-0.5 ${selected ? 'text-white/80' : 'text-gray-400'}`}>
                                {disabled ? 'Past cutoff' : `Cutoff ${s.cutoffTime}`}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
