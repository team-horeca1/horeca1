'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, X, Check, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrandOption {
    id: string;
    name: string;
}

const SUGGEST_LABELS = {
    vendor: (name: string) => `Request "${name}" — admin will review`,
    admin: (name: string) => `Add "${name}" now`,
} as const;

export function BrandSinglePicker({
    value,
    onChange,
    brands = [],
    placeholder = 'Select brand',
    className,
    hasError,
    disabled,
    onSuggest,
    suggesting,
    size = 'default',
    suggestLabel = 'vendor',
}: {
    value: string;
    onChange: (next: string) => void;
    brands?: BrandOption[];
    placeholder?: string;
    className?: string;
    hasError?: boolean;
    disabled?: boolean;
    onSuggest?: (query: string) => void;
    suggesting?: boolean;
    size?: 'default' | 'compact';
    suggestLabel?: 'vendor' | 'admin';
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const isCompact = size === 'compact';

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const trimmed = query.trim();
    const lc = trimmed.toLowerCase();

    const filtered = brands.filter(b => !lc || b.name.toLowerCase().includes(lc));

    const selectBrand = (name: string) => {
        onChange(name);
        setOpen(false);
        setQuery('');
    };

    const handleSuggest = (name: string) => {
        if (onSuggest && name.trim()) {
            onSuggest(name.trim());
            setOpen(false);
            setQuery('');
        }
    };

    const exactMatch = brands.some(b => b.name.toLowerCase() === lc);

    const canSuggestTyped = !!onSuggest && trimmed.length >= 2 && !exactMatch;
    const showEmptyAddCta = !!onSuggest && brands.length === 0 && !suggesting;

    const suggestButtonLabel = (name: string) => SUGGEST_LABELS[suggestLabel](name);

    return (
        <div className="relative" ref={containerRef}>
            <div className={cn('relative', open && 'z-[50]')}>
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    disabled={disabled}
                    className={cn(
                        'w-full flex items-center justify-between gap-2 text-left',
                        'border border-[#EEEEEE] rounded-[10px] font-medium bg-white hover:bg-white',
                        'focus:outline-none focus:border-primary/40 transition-colors',
                        isCompact ? 'px-3 py-2 text-[13px] h-[36px]' : 'px-4 py-2.5 text-[14px] h-[44px]',
                        hasError && 'border-[#E74C3C] focus:border-[#E74C3C]',
                        disabled && 'opacity-60 cursor-not-allowed bg-gray-50',
                        className,
                    )}
                >
                    <span className={cn('truncate', value ? 'text-[#181725]' : 'text-gray-400')}>
                        {value || placeholder}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {value && !disabled && (
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(''); } }}
                                className="p-1 hover:bg-gray-100 rounded cursor-pointer"
                            >
                                <X size={isCompact ? 11 : 12} className="text-gray-400" />
                            </span>
                        )}
                        <ChevronDown size={isCompact ? 12 : 14} className={cn('text-gray-400 transition-transform', open && 'rotate-180')} />
                    </div>
                </button>

                {open && (
                    <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-[#EEEEEE] rounded-xl shadow-xl max-h-[260px] overflow-hidden flex flex-col">
                        <div className="p-2 border-b border-gray-100 shrink-0">
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    autoFocus
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search or add brand..."
                                    className="w-full pl-8 pr-2 py-1.5 border border-[#EEEEEE] rounded-lg text-[12px] outline-none focus:border-primary/40"
                                />
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1 py-1">
                            {filtered.length > 0 ? (
                                filtered.map(b => (
                                    <button
                                        key={b.id}
                                        type="button"
                                        onClick={() => selectBrand(b.name)}
                                        className={cn(
                                            'w-full flex items-center gap-2 px-3 py-2 hover:bg-primary-light hover:text-primary text-left transition-colors text-[13px] text-[#181725]',
                                            value === b.name && 'bg-primary-light text-primary font-semibold',
                                        )}
                                    >
                                        <span className="flex-1 truncate">{b.name}</span>
                                        {value === b.name && <Check size={11} className="text-primary shrink-0" />}
                                    </button>
                                ))
                            ) : showEmptyAddCta ? (
                                <div className="p-2">
                                    <button
                                        type="button"
                                        onClick={() => handleSuggest(query || 'New brand')}
                                        disabled={suggesting}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary-light hover:bg-primary hover:text-white text-primary transition-colors text-[12px] font-bold"
                                    >
                                        {suggesting ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                        Add brand…
                                    </button>
                                </div>
                            ) : (
                                <p className="px-3 py-3 text-[12px] text-gray-400 italic text-center">No brands found</p>
                            )}
                        </div>

                        {canSuggestTyped && (
                            <div className="border-t border-gray-100 p-2 shrink-0 bg-gray-50">
                                <button
                                    type="button"
                                    onClick={() => handleSuggest(trimmed)}
                                    disabled={suggesting}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-primary-light hover:bg-primary hover:text-white text-primary transition-colors"
                                >
                                    <span className="flex items-center gap-2 text-[12px] font-bold truncate">
                                        {suggesting ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                        {suggestButtonLabel(trimmed)}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
