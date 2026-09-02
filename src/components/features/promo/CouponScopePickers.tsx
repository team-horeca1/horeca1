'use client';

// Category / product / brand (and admin-only customer) chip pickers for coupon
// create/edit. Empty selections mean the whole platform or store.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ScopeChip {
    id: string;
    label: string;
}

interface CatNode {
    id: string;
    name: string;
    parentId?: string | null;
    children?: CatNode[];
}

interface ProductHit {
    id: string;
    name: string;
    vendor?: { businessName?: string | null } | null;
}

interface BrandHit {
    id: string;
    name: string;
}

interface UserHit {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    businessName: string | null;
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] font-medium focus:outline-none';
const labelCls = 'block text-[11px] font-bold text-gray-500 mb-1';

function flattenCategories(nodes: CatNode[], parentName: string | null = null): ScopeChip[] {
    const out: ScopeChip[] = [];
    for (const n of nodes) {
        const label = parentName ? `${parentName} › ${n.name}` : n.name;
        out.push({ id: n.id, label });
        if (n.children?.length) out.push(...flattenCategories(n.children, n.name));
    }
    return out;
}

function ChipRow({ chips, onRemove }: { chips: ScopeChip[]; onRemove: (id: string) => void }) {
    if (chips.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5 mb-2">
            {chips.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 max-w-full px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-[11px] font-semibold text-gray-700">
                    <span className="truncate">{c.label}</span>
                    <button type="button" onClick={() => onRemove(c.id)} className="text-gray-400 hover:text-red-500 cursor-pointer shrink-0" aria-label={`Remove ${c.label}`}>
                        <X size={11} />
                    </button>
                </span>
            ))}
        </div>
    );
}

function useDebouncedQuery(value: string, delay = 250) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

export function CouponScopeFields({
    categoryIds,
    productIds,
    brandNames,
    onChange,
    productSource,
    focusBorder = 'focus:border-primary',
}: {
    categoryIds: string[];
    productIds: string[];
    brandNames: string[];
    onChange: (patch: { categoryIds?: string[]; productIds?: string[]; brandNames?: string[] }) => void;
    productSource: 'admin' | 'vendor';
    focusBorder?: string;
}) {
    const [allCats, setAllCats] = useState<ScopeChip[]>([]);
    const [catQuery, setCatQuery] = useState('');
    const [catOpen, setCatOpen] = useState(false);
    const [catLabels, setCatLabels] = useState<Record<string, string>>({});

    const [prodQuery, setProdQuery] = useState('');
    const [prodOpen, setProdOpen] = useState(false);
    const [prodHits, setProdHits] = useState<ScopeChip[]>([]);
    const [prodLoading, setProdLoading] = useState(false);
    const [prodLabels, setProdLabels] = useState<Record<string, string>>({});

    const [brandQuery, setBrandQuery] = useState('');
    const [brandOpen, setBrandOpen] = useState(false);
    const [allBrands, setAllBrands] = useState<ScopeChip[]>([]);

    const catBox = useRef<HTMLDivElement>(null);
    const prodBox = useRef<HTMLDivElement>(null);
    const brandBox = useRef<HTMLDivElement>(null);
    const debouncedProd = useDebouncedQuery(prodQuery);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/v1/categories')
            .then((r) => r.json())
            .then((json: { data?: CatNode[] }) => {
                if (cancelled) return;
                const list = Array.isArray(json.data) ? json.data : [];
                const flat = flattenCategories(list);
                setAllCats(flat);
                setCatLabels((prev) => {
                    const next = { ...prev };
                    for (const c of flat) next[c.id] = c.label;
                    return next;
                });
            })
            .catch(() => {
                if (!cancelled) setAllCats([]);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/v1/brands?limit=200&scope=picker')
            .then((r) => r.json())
            .then((json: { data?: { brands?: BrandHit[] } }) => {
                if (cancelled) return;
                const brands = json.data?.brands ?? [];
                setAllBrands(brands.map((b) => ({ id: b.name, label: b.name })));
            })
            .catch(() => {
                if (!cancelled) setAllBrands([]);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!debouncedProd.trim()) {
            Promise.resolve().then(() => setProdHits([]));
            return;
        }
        let cancelled = false;
        Promise.resolve().then(() => {
            if (!cancelled) setProdLoading(true);
        });
        const url = productSource === 'admin'
            ? `/api/v1/admin/products?search=${encodeURIComponent(debouncedProd.trim())}&gridListings=true&limit=15`
            : `/api/v1/vendor/products?search=${encodeURIComponent(debouncedProd.trim())}&limit=15`;
        fetch(url)
            .then((r) => r.json())
            .then((json: { data?: { products?: ProductHit[] } | ProductHit[] }) => {
                if (cancelled) return;
                const raw = json.data;
                const products = Array.isArray(raw) ? raw : (raw?.products ?? []);
                const chips = products.map((p) => ({
                    id: p.id,
                    label: p.vendor?.businessName ? `${p.name} · ${p.vendor.businessName}` : p.name,
                }));
                setProdHits(chips);
                setProdLabels((prev) => {
                    const next = { ...prev };
                    for (const c of chips) next[c.id] = c.label;
                    return next;
                });
            })
            .catch(() => {
                if (!cancelled) setProdHits([]);
            })
            .finally(() => {
                if (!cancelled) setProdLoading(false);
            });
        return () => { cancelled = true; };
    }, [debouncedProd, productSource]);

    useEffect(() => {
        const missing = productIds.filter((id) => !prodLabels[id]);
        if (missing.length === 0) return;
        let cancelled = false;
        const endpoint = productSource === 'admin' ? '/api/v1/admin/products' : '/api/v1/products';
        Promise.all(missing.map((id) => fetch(`${endpoint}/${id}`).then((r) => r.json()).catch(() => null)))
            .then((rows) => {
                if (cancelled) return;
                setProdLabels((prev) => {
                    const next = { ...prev };
                    rows.forEach((json, i) => {
                        const id = missing[i];
                        const p = (json?.data ?? json) as ProductHit | undefined;
                        if (p && typeof p.name === 'string') {
                            next[id] = p.vendor?.businessName ? `${p.name} · ${p.vendor.businessName}` : p.name;
                        } else {
                            next[id] = id.slice(0, 8);
                        }
                    });
                    return next;
                });
            });
        return () => { cancelled = true; };
    }, [productIds, prodLabels, productSource]);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            const t = e.target as Node;
            if (catBox.current && !catBox.current.contains(t)) setCatOpen(false);
            if (prodBox.current && !prodBox.current.contains(t)) setProdOpen(false);
            if (brandBox.current && !brandBox.current.contains(t)) setBrandOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const catChips: ScopeChip[] = categoryIds.map((id) => ({ id, label: catLabels[id] ?? id.slice(0, 8) }));
    const prodChips: ScopeChip[] = productIds.map((id) => ({ id, label: prodLabels[id] ?? id.slice(0, 8) }));
    const brandChips: ScopeChip[] = brandNames.map((name) => ({ id: name, label: name }));

    const catQ = catQuery.trim().toLowerCase();
    const catHits = allCats.filter((c) => !categoryIds.includes(c.id) && (!catQ || c.label.toLowerCase().includes(catQ))).slice(0, 20);

    const brandQ = brandQuery.trim().toLowerCase();
    const brandHits = allBrands.filter((b) => !brandNames.includes(b.label) && (!brandQ || b.label.toLowerCase().includes(brandQ))).slice(0, 20);
    const canAddCustomBrand = brandQ.length > 0 && !brandNames.some((n) => n.toLowerCase() === brandQ);

    const addCategory = (c: ScopeChip) => {
        if (categoryIds.includes(c.id)) return;
        setCatLabels((prev) => ({ ...prev, [c.id]: c.label }));
        onChange({ categoryIds: [...categoryIds, c.id] });
        setCatQuery('');
        setCatOpen(false);
    };
    const addProduct = (c: ScopeChip) => {
        if (productIds.includes(c.id)) return;
        setProdLabels((prev) => ({ ...prev, [c.id]: c.label }));
        onChange({ productIds: [...productIds, c.id] });
        setProdQuery('');
        setProdOpen(false);
    };
    const addBrand = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed || brandNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return;
        onChange({ brandNames: [...brandNames, trimmed] });
        setBrandQuery('');
        setBrandOpen(false);
    };

    return (
        <div className="col-span-2 space-y-3 pt-1">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Scope — leave empty for the whole {productSource === 'vendor' ? 'store' : 'platform'}</p>

            <div ref={catBox} className="relative">
                <label className={labelCls}>Categories</label>
                <ChipRow chips={catChips} onRemove={(id) => onChange({ categoryIds: categoryIds.filter((x) => x !== id) })} />
                <div className="relative">
                    <input
                        className={cn(inputCls, focusBorder, 'pr-8')}
                        value={catQuery}
                        onChange={(e) => { setCatQuery(e.target.value); setCatOpen(true); }}
                        onFocus={() => setCatOpen(true)}
                        placeholder="Search categories"
                    />
                    <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                </div>
                {catOpen && catHits.length > 0 && (
                    <ul className="absolute z-30 mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-lg max-h-[200px] overflow-y-auto">
                        {catHits.map((c) => (
                            <li key={c.id}>
                                <button type="button" onClick={() => addCategory(c)} className="w-full text-left px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                                    {c.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div ref={prodBox} className="relative">
                <label className={labelCls}>Products</label>
                <ChipRow chips={prodChips} onRemove={(id) => onChange({ productIds: productIds.filter((x) => x !== id) })} />
                <div className="relative">
                    <input
                        className={cn(inputCls, focusBorder, 'pr-8')}
                        value={prodQuery}
                        onChange={(e) => { setProdQuery(e.target.value); setProdOpen(true); }}
                        onFocus={() => setProdOpen(true)}
                        placeholder="Search products"
                    />
                    {prodLoading
                        ? <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 animate-spin" />
                        : <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />}
                </div>
                {prodOpen && prodHits.filter((p) => !productIds.includes(p.id)).length > 0 && (
                    <ul className="absolute z-30 mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-lg max-h-[200px] overflow-y-auto">
                        {prodHits.filter((p) => !productIds.includes(p.id)).map((p) => (
                            <li key={p.id}>
                                <button type="button" onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                                    {p.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div ref={brandBox} className="relative">
                <label className={labelCls}>Brands</label>
                <ChipRow chips={brandChips} onRemove={(id) => onChange({ brandNames: brandNames.filter((x) => x !== id) })} />
                <div className="relative">
                    <input
                        className={cn(inputCls, focusBorder, 'pr-8')}
                        value={brandQuery}
                        onChange={(e) => { setBrandQuery(e.target.value); setBrandOpen(true); }}
                        onFocus={() => setBrandOpen(true)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBrand(brandQuery); } }}
                        placeholder="Search or type a brand name"
                    />
                    <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                </div>
                {brandOpen && (brandHits.length > 0 || canAddCustomBrand) && (
                    <ul className="absolute z-30 mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-lg max-h-[200px] overflow-y-auto">
                        {canAddCustomBrand && (
                            <li>
                                <button type="button" onClick={() => addBrand(brandQuery)} className="w-full text-left px-3 py-2 text-[12px] font-medium text-primary hover:bg-gray-50 cursor-pointer">
                                    Add “{brandQuery.trim()}”
                                </button>
                            </li>
                        )}
                        {brandHits.map((b) => (
                            <li key={b.id}>
                                <button type="button" onClick={() => addBrand(b.label)} className="w-full text-left px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                                    {b.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export function AudienceUserPicker({
    userIds,
    onChange,
    focusBorder = 'focus:border-primary',
}: {
    userIds: string[];
    onChange: (ids: string[]) => void;
    focusBorder?: string;
}) {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<UserHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [labels, setLabels] = useState<Record<string, string>>({});
    const boxRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    const userLabel = useCallback((u: UserHit) => u.fullName || u.businessName || u.phone || u.email || u.id, []);

    const search = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const res = await fetch(`/api/v1/admin/users?search=${encodeURIComponent(query.trim())}&limit=8`);
            const json = await res.json();
            const users = (json?.data?.users ?? json?.data ?? []) as UserHit[];
            const list = Array.isArray(users) ? users : [];
            setHits(list);
            setOpen(true);
            setLabels((prev) => {
                const next = { ...prev };
                for (const u of list) next[u.id] = userLabel(u);
                return next;
            });
        } catch {
            setHits([]);
        } finally {
            setSearching(false);
        }
    };

    useEffect(() => {
        const missing = userIds.filter((id) => !labels[id]);
        if (missing.length === 0) return;
        let cancelled = false;
        Promise.all(missing.map((id) => fetch(`/api/v1/admin/users/${id}`).then((r) => r.json()).catch(() => null)))
            .then((rows) => {
                if (cancelled) return;
                setLabels((prev) => {
                    const next = { ...prev };
                    rows.forEach((json, i) => {
                        const id = missing[i];
                        const u = json?.data as UserHit | undefined;
                        next[id] = u ? userLabel(u) : id.slice(0, 8);
                    });
                    return next;
                });
            });
        return () => { cancelled = true; };
    }, [userIds, labels, userLabel]);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const chips: ScopeChip[] = userIds.map((id) => ({ id, label: labels[id] ?? id.slice(0, 8) }));

    return (
        <div ref={boxRef} className="col-span-2">
            <label className={labelCls}>Target customers (empty = all)</label>
            <ChipRow chips={chips} onRemove={(id) => onChange(userIds.filter((x) => x !== id))} />
            <div className="flex gap-2">
                <input
                    className={cn(inputCls, focusBorder)}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
                    placeholder="Name / phone / email / HCID"
                />
                <button type="button" onClick={search} disabled={searching} className="shrink-0 px-3 rounded-lg bg-[#181725] text-white cursor-pointer disabled:opacity-50">
                    {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
            </div>
            {open && hits.filter((u) => !userIds.includes(u.id)).length > 0 && (
                <ul className="mt-2 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-[200px] overflow-y-auto">
                    {hits.filter((u) => !userIds.includes(u.id)).map((u) => (
                        <li key={u.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    onChange([...userIds, u.id]);
                                    setLabels((prev) => ({ ...prev, [u.id]: userLabel(u) }));
                                    setHits([]);
                                    setQuery('');
                                    setOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer"
                            >
                                <p className="text-[12px] font-bold text-[#181725]">{userLabel(u)}</p>
                                <p className="text-[10px] text-gray-400">{u.phone || u.email}</p>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
