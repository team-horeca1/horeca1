'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Search, X, Plus, Loader2, Check, Tag } from 'lucide-react';
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

/** Multi-select category picker that stores **category IDs** (not names).
 *  Use when the consumer is a UUID FK / UUID[] column.
 *
 *  Differs from CategoryMultiPicker (which works in names — used where the
 *  storage is a String[] of category names, e.g. Brand.categories).
 *
 *  Suggest flow: when the user types a category that doesn't exist, calling
 *  the suggest endpoint creates a pending Category row and adds its ID to
 *  the selection (so the product can be saved immediately).
 */
export function CategoryMultiPickerById({
    value,
    onChange,
    max = 12,
    endpoint = '/api/v1/brand/categories/suggest',
    label = 'Categories',
    helper = 'Pick from existing categories or request a new one — admin reviews.',
    disableSuggest = false,
}: {
    value: string[];
    onChange: (next: string[]) => void;
    max?: number;
    endpoint?: string;
    label?: string;
    helper?: string;
    /** Hide the "Request new" button (use when caller can create categories directly, e.g. admin). */
    disableSuggest?: boolean;
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

    const byId = useMemo(() => new Map(allCats.map(c => [c.id, c])), [allCats]);
    const selectedRows = useMemo(
        () => value.map(id => byId.get(id)).filter((c): c is FlatCat => !!c),
        [value, byId],
    );

    const trimmedQuery = query.trim();
    const lcQuery = trimmedQuery.toLowerCase();

    const filtered = useMemo(() => {
        return allCats.filter(c =>
            !value.includes(c.id) &&
            (!lcQuery || c.name.toLowerCase().includes(lcQuery)),
        );
    }, [allCats, value, lcQuery]);

    const exactMatch = useMemo(() => {
        if (allCats.some(c => c.name.toLowerCase() === lcQuery)) return true;
        for (const root of allCats.filter(c => !c.parentName)) {
            const prefix = `${root.name} `.toLowerCase();
            if (lcQuery.startsWith(prefix)) {
                const childName = trimmedQuery.slice(root.name.length).trim().toLowerCase();
                if (allCats.some(c => c.name.toLowerCase() === childName && c.parentName === root.name)) {
                    return true;
                }
            }
        }
        return false;
    }, [allCats, lcQuery, trimmedQuery]);

    const suggestParentId = useMemo((): string | undefined => {
        const parentsInFilter = [...new Set(filtered.map(c => c.parentName).filter(Boolean))];
        if (parentsInFilter.length === 1) {
            const parent = allCats.find(c => c.name === parentsInFilter[0] && !c.parentName);
            if (parent) return parent.id;
        }
        for (const root of allCats.filter(c => !c.parentName)) {
            const prefix = `${root.name} `.toLowerCase();
            if (lcQuery.startsWith(prefix) && lcQuery.length > prefix.length) {
                return root.id;
            }
        }
        return undefined;
    }, [filtered, lcQuery, trimmedQuery, allCats]);

    const suggestName = useMemo(() => {
        if (!suggestParentId) return trimmedQuery;
        const parent = allCats.find(c => c.id === suggestParentId);
        if (!parent) return trimmedQuery;
        const prefix = `${parent.name} `.toLowerCase();
        if (lcQuery.startsWith(prefix)) {
            return trimmedQuery.slice(parent.name.length).trim() || trimmedQuery;
        }
        return trimmedQuery;
    }, [suggestParentId, trimmedQuery, lcQuery, allCats]);

    const canSuggest = !disableSuggest && suggestName.length >= 2 && !exactMatch;

    const select = (id: string) => {
        if (value.includes(id)) return;
        if (value.length >= max) {
            toast.error(`Max ${max} categories`);
            return;
        }
        onChange([...value, id]);
        setQuery('');
    };

    const remove = (id: string) => {
        onChange(value.filter(v => v !== id));
    };

    const submitSuggestion = async () => {
        if (!canSuggest || suggesting) return;
        setSuggesting(true);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: suggestName,
                    ...(suggestParentId ? { parentId: suggestParentId } : {}),
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Suggestion failed');
            const cat = json.data;
            const parent = suggestParentId ? allCats.find(c => c.id === suggestParentId) : null;
            setAllCats(prev => prev.some(p => p.id === cat.id) ? prev : [...prev, {
                id: cat.id,
                name: cat.name,
                parentName: parent?.name ?? null,
            }]);
            select(cat.id);
            if (json.alreadyExists) {
                toast.success(`Picked existing category "${cat.name}"`);
            } else {
                toast.success(`Sent "${suggestName}" to admin for review`);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Suggestion failed');
        } finally {
            setSuggesting(false);
        }
    };

    return (
        <div className="space-y-2.5" ref={containerRef}>
            <div>
                <label className="block text-[13px] font-bold text-[#181725] mb-1">{label}</label>
                {helper && <p className="text-[11px] text-gray-400 mt-0.5">{helper}</p>}
            </div>

            <div className={cn("relative", open && "z-[50]")}>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={query}
                        onChange={e => { setQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        placeholder={loading ? 'Loading categories…' : 'Search categories or type a new one…'}
                        disabled={loading || value.length >= max}
                        className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-primary/50 disabled:bg-gray-50 disabled:cursor-not-allowed"
                    />
                </div>

                {open && !loading && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-[280px] overflow-y-auto">
                        {filtered.length > 0 && (
                            <div className="py-1">
                                <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pick from existing</p>
                                {filtered.slice(0, 50).map(c => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => select(c.id)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left transition-colors"
                                    >
                                        <Tag size={12} className="text-gray-400 shrink-0" />
                                        <span className="text-[13px] text-[#181725]">{c.name}</span>
                                        {c.parentName && (
                                            <span className="text-[10px] text-gray-400">in {c.parentName}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {filtered.length === 0 && trimmedQuery.length === 0 && (
                            <p className="px-3 py-3 text-[12px] text-gray-400 italic">All matching categories already selected.</p>
                        )}

                        {canSuggest && (
                            <div className="border-t border-gray-100 p-2">
                                <button
                                    type="button"
                                    onClick={submitSuggestion}
                                    disabled={suggesting}
                                    className={cn(
                                        'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors',
                                        'bg-primary-light hover:bg-primary hover:text-white text-primary',
                                        suggesting && 'opacity-60',
                                    )}
                                >
                                    <span className="flex items-center gap-2 text-[12px] font-bold">
                                        {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                        Request &ldquo;{suggestName}&rdquo;{suggestParentId ? ' (sub-category)' : ''} — admin will review
                                    </span>
                                    <Check size={12} className="opacity-60" />
                                </button>
                            </div>
                        )}

                        {!canSuggest && trimmedQuery.length > 0 && filtered.length === 0 && (
                            <p className="px-3 py-3 text-[12px] text-gray-400 italic">Already in your list.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Selected chips */}
            <div className="flex flex-wrap gap-2 min-h-[44px] p-2 border border-gray-200 rounded-xl bg-gray-50">
                {selectedRows.length === 0 && (
                    <span className="text-[12px] text-gray-400 italic px-1">No categories selected yet</span>
                )}
                {selectedRows.map(c => (
                    <span key={c.id} className="flex items-center gap-1 bg-[#e8f5e9] text-primary text-[12px] font-semibold rounded-full px-3 py-1">
                        {c.name}
                        <button type="button" onClick={() => remove(c.id)} className="hover:text-red-500 transition-colors">
                            <X size={11} />
                        </button>
                    </span>
                ))}
            </div>

            <p className="text-[11px] text-gray-400">{value.length} / {max} selected</p>
        </div>
    );
}
