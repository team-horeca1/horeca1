'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, X, Plus, Loader2, Check, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CatRow {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    children?: CatRow[];
}

interface FlatCat {
    id: string;
    name: string;
    parentName: string | null;
}

/** Single-select category picker (returns category UUID + name).
 *  - Loads admin-approved categories from /api/v1/categories
 *  - Searchable dropdown
 *  - "Request new" button creates a pending category via the suggest endpoint;
 *    on success it auto-selects (status=pending until admin approves).
 */
export function CategorySinglePicker({
    valueId,
    valueName,
    onChange,
    endpoint = '/api/v1/brand/categories/suggest',
    placeholder = 'Select a category…',
    label,
    helper,
}: {
    valueId: string | null;
    valueName: string | null;
    onChange: (next: { id: string | null; name: string | null }) => void;
    endpoint?: string;
    placeholder?: string;
    label?: string;
    helper?: string;
}) {
    const [allCats, setAllCats] = useState<FlatCat[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [suggesting, setSuggesting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/v1/categories')
            .then(r => r.json())
            .then(j => {
                if (cancelled) return;
                const list: CatRow[] = Array.isArray(j.data) ? j.data : (j.data ?? []);
                const flat: FlatCat[] = [];
                const walk = (node: CatRow, parentName: string | null) => {
                    const hasChildren = node.children && node.children.length > 0;
                    if (!hasChildren) {
                        flat.push({ id: node.id, name: node.name, parentName });
                    }
                    for (const child of node.children ?? []) walk(child, node.name);
                };
                for (const root of list) walk(root, null);
                setAllCats(flat);
            })
            .catch(() => setAllCats([]))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const trimmed = query.trim();
    const lc = trimmed.toLowerCase();
    const filtered = useMemo(
        () => allCats.filter(c => !lc || c.name.toLowerCase().includes(lc)),
        [allCats, lc],
    );
    const exactMatch = useMemo(
        () => allCats.some(c => c.name.toLowerCase() === lc),
        [allCats, lc],
    );
    const canSuggest = trimmed.length >= 2 && !exactMatch;

    const selectCat = (c: FlatCat) => {
        onChange({ id: c.id, name: c.name });
        setOpen(false);
        setQuery('');
    };

    const submitSuggestion = async () => {
        if (!canSuggest || suggesting) return;
        setSuggesting(true);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmed }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Suggestion failed');
            const cat = json.data;
            onChange({ id: cat.id, name: cat.name });
            setOpen(false);
            setQuery('');
            if (json.alreadyExists) {
                toast.success(`Picked existing category "${cat.name}"`);
            } else {
                toast.success(`Sent "${trimmed}" to admin for review — selected for this product`);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Suggestion failed');
        } finally {
            setSuggesting(false);
        }
    };

    return (
        <div className="space-y-1.5" ref={containerRef}>
            {label && (
                <label className="block text-[13px] font-bold text-[#181725] mb-1">{label}</label>
            )}
            {helper && <p className="text-[11px] text-gray-400">{helper}</p>}

            {/* Trigger button — looks like an input */}
            <div className={cn("relative", open && "z-[50]")}>
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    disabled={loading}
                    className={cn(
                        'w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left',
                        'border border-[#EEEEEE] rounded-[10px] text-[14px] font-medium bg-[#FAFAFA] hover:bg-white',
                        'focus:outline-none focus:border-primary/50 transition-colors',
                        loading && 'opacity-60'
                    )}
                >
                    <span className={cn('truncate', valueName ? 'text-[#181725]' : 'text-gray-400')}>
                        {loading ? 'Loading categories…' : (valueName ?? placeholder)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {valueId && (
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); onChange({ id: null, name: null }); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange({ id: null, name: null }); } }}
                                className="p-1 hover:bg-gray-100 rounded cursor-pointer"
                            >
                                <X size={12} className="text-gray-400" />
                            </span>
                        )}
                        <ChevronDown size={14} className={cn('text-gray-400 transition-transform', open && 'rotate-180')} />
                    </div>
                </button>

                {open && !loading && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-[260px] overflow-hidden flex flex-col">
                        {/* Search bar */}
                        <div className="p-2 border-b border-gray-100">
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    autoFocus
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search or type a new category…"
                                    className="w-full pl-8 pr-2 py-1.5 border border-gray-100 rounded-lg text-[12px] outline-none focus:border-primary/40"
                                />
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1">
                            {filtered.length > 0 ? (
                                <div className="py-1">
                                    {filtered.slice(0, 60).map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => selectCat(c)}
                                            className={cn(
                                                'w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left transition-colors',
                                                valueId === c.id && 'bg-primary-light'
                                            )}
                                        >
                                            <Tag size={11} className="text-gray-400 shrink-0" />
                                            <span className="text-[12px] text-[#181725] flex-1 truncate">{c.name}</span>
                                            {c.parentName && <span className="text-[10px] text-gray-400">in {c.parentName}</span>}
                                            {valueId === c.id && <Check size={11} className="text-primary" />}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="px-3 py-3 text-[12px] text-gray-400 italic">No categories match.</p>
                            )}
                        </div>

                        {canSuggest && (
                            <div className="border-t border-gray-100 p-2">
                                <button
                                    type="button"
                                    onClick={submitSuggestion}
                                    disabled={suggesting}
                                    className={cn(
                                        'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors',
                                        'bg-primary-light hover:bg-primary hover:text-white text-primary',
                                        suggesting && 'opacity-60'
                                    )}
                                >
                                    <span className="flex items-center gap-2 text-[12px] font-bold">
                                        {suggesting ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                        Request &ldquo;{trimmed}&rdquo; — admin will review
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
