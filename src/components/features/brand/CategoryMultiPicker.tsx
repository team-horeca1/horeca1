'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Search, X, Plus, Loader2, Check, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// One row in the categories tree
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

/** Multi-select category picker with search, add-new (suggest) flow.
 *
 * `value` and `onChange` use category NAMES (display strings) — same shape the
 * Brand.categories field already stores. The picker also resolves names against
 * the live Category table so users can pick from approved categories or
 * suggest a new one (which goes to /api/v1/brand/categories/suggest →
 * admin approval queue).
 *
 * `endpoint`: which API to call to suggest a new category. Default
 *   /api/v1/brand/categories/suggest. Pass /api/v1/vendor/categories/suggest if
 *   used in a vendor context.
 */
export function CategoryMultiPicker({
    value,
    onChange,
    max = 12,
    endpoint = '/api/v1/brand/categories/suggest',
    label = 'Categories',
    helper = 'Pick from existing categories or request a new one for admin review.',
}: {
    value: string[];
    onChange: (next: string[]) => void;
    max?: number;
    endpoint?: string;
    label?: string;
    helper?: string;
}) {
    const [allCats, setAllCats] = useState<FlatCat[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [suggesting, setSuggesting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load admin-managed categories (approved + active).
    useEffect(() => {
        let cancelled = false;
        fetch('/api/v1/categories')
            .then(r => r.json())
            .then(j => {
                if (cancelled) return;
                const list: CatRow[] = Array.isArray(j.data) ? j.data : (j.data ?? []);
                // Flatten parent + children so the picker shows everything.
                const flat: FlatCat[] = [];
                const walk = (node: CatRow, parentName: string | null) => {
                    flat.push({ id: node.id, name: node.name, parentName });
                    for (const child of node.children ?? []) walk(child, node.name);
                };
                for (const root of list) walk(root, null);
                setAllCats(flat);
            })
            .catch(() => setAllCats([]))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // Click outside closes dropdown
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const trimmedQuery = query.trim();
    const lcQuery = trimmedQuery.toLowerCase();

    const filtered = useMemo(() => {
        const lc = lcQuery;
        return allCats.filter(c =>
            !value.includes(c.name) &&
            (!lc || c.name.toLowerCase().includes(lc))
        );
    }, [allCats, value, lcQuery]);

    const exactMatch = useMemo(
        () => allCats.some(c => c.name.toLowerCase() === lcQuery)
            || value.some(v => v.toLowerCase() === lcQuery),
        [allCats, value, lcQuery],
    );

    const canSuggest = trimmedQuery.length >= 2 && !exactMatch;

    const select = (name: string) => {
        if (value.length >= max) {
            toast.error(`Max ${max} categories`);
            return;
        }
        if (value.includes(name)) return;
        onChange([...value, name]);
        setQuery('');
    };

    const remove = (name: string) => {
        onChange(value.filter(v => v !== name));
    };

    const submitSuggestion = async () => {
        if (!canSuggest || suggesting) return;
        setSuggesting(true);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmedQuery }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Suggestion failed');
            // Also add the (pending) category to the selected list so brand can save with it
            select(trimmedQuery);
            if (json.alreadyExists) {
                toast.success(`Picked existing category "${trimmedQuery}"`);
            } else {
                toast.success(`Sent "${trimmedQuery}" to admin for review`);
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Suggestion failed');
        } finally {
            setSuggesting(false);
        }
    };

    return (
        <div className="space-y-2" ref={containerRef}>
            <div>
                <label className="block text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wider">{label}</label>
                {helper && <p className="text-[11px] text-gray-400 mt-0.5">{helper}</p>}
            </div>

            {/* Selected chips */}
            <div className="flex flex-wrap gap-2 min-h-[44px] p-2 border border-gray-200 rounded-xl bg-gray-50">
                {value.length === 0 && (
                    <span className="text-[12px] text-gray-400 italic px-1">No categories selected yet</span>
                )}
                {value.map(name => (
                    <span key={name} className="flex items-center gap-1 bg-[#e8f5e9] text-primary text-[12px] font-semibold rounded-full px-3 py-1">
                        {name}
                        <button type="button" onClick={() => remove(name)} className="hover:text-red-500 transition-colors">
                            <X size={11} />
                        </button>
                    </span>
                ))}
            </div>

            {/* Search + dropdown */}
            <div className="relative">
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
                                        onClick={() => select(c.name)}
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
                                        suggesting && 'opacity-60'
                                    )}
                                >
                                    <span className="flex items-center gap-2 text-[12px] font-bold">
                                        {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                        Request &ldquo;{trimmedQuery}&rdquo; — admin will review
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

            <p className="text-[11px] text-gray-400">{value.length} / {max} selected</p>
        </div>
    );
}
