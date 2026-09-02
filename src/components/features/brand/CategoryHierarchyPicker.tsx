'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Search, X, Plus, Loader2, Check, Tag, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CatRow {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    parentCategoryIds?: string[];
    primaryParentCategoryId?: string | null;
    children?: CatRow[];
}

interface FlatSubCat {
    id: string;
    name: string;
    parentCategoryIds: string[];
    primaryParentCategoryId: string | null;
}

function derivePickerState(
    value: string[],
    subById: Map<string, FlatSubCat>,
    parentById: Map<string, CatRow>,
): { parentId: string; primarySubId: string } {
    if (value.length === 0) {
        return { parentId: '', primarySubId: '' };
    }

    const leaves = value.filter((id) => subById.has(id));
    const parents = value.filter((id) => parentById.has(id));

    if (leaves.length > 0) {
        const primarySubId = leaves[0];
        const sub = subById.get(primarySubId)!;
        const parentId =
            sub.primaryParentCategoryId ?? sub.parentCategoryIds[0] ?? parents[0] ?? '';
        return { parentId, primarySubId };
    }

    if (parents.length > 0) {
        return { parentId: parents[0], primarySubId: '' };
    }

    return { parentId: '', primarySubId: value[0] };
}

/**
 * Three-step category picker: Parent Category → Sub-Category (required) →
 * Additional Sub-Categories (optional). Outputs `categoryIds` where index 0
 * is the primary sub-category and the rest are additional M2M links.
 */
export function CategoryHierarchyPicker({
    value,
    onChange,
    maxAdditional = 4,
    endpoint = '/api/v1/brand/categories/suggest',
    label = 'Categories',
    helper = 'Pick a parent, then a sub-category. Optionally add more sub-categories.',
    disableSuggest = false,
    disabled = false,
    lockParent = false,
}: {
    value: string[];
    onChange: (next: string[]) => void;
    maxAdditional?: number;
    endpoint?: string;
    label?: string;
    helper?: string;
    disableSuggest?: boolean;
    disabled?: boolean;
    lockParent?: boolean;
}) {
    const [parents, setParents] = useState<CatRow[]>([]);
    const [subCategories, setSubCategories] = useState<FlatSubCat[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Selection IDs
    const [parentId, setParentId] = useState('');
    const [primarySubId, setPrimarySubId] = useState('');
    
    // Parent search/open states
    const [parentQuery, setParentQuery] = useState('');
    const [parentOpen, setParentOpen] = useState(false);
    const [suggestingParent, setSuggestingParent] = useState(false);
    
    // Sub-category search/open states
    const [subQuery, setSubQuery] = useState('');
    const [subOpen, setSubOpen] = useState(false);
    const [suggestingSub, setSuggestingSub] = useState(false);
    
    // Additional sub-categories search/open states
    const [additionalOpen, setAdditionalOpen] = useState(false);
    const [additionalQuery, setAdditionalQuery] = useState('');
    const [suggesting, setSuggesting] = useState(false);

    // Refs for click outside detection
    const parentRef = useRef<HTMLDivElement>(null);
    const subRef = useRef<HTMLDivElement>(null);
    const additionalRef = useRef<HTMLDivElement>(null);

    // Fetch initial category hierarchy on mount
    useEffect(() => {
        let cancelled = false;
        fetch('/api/v1/categories')
            .then((r) => r.json())
            .then((j) => {
                if (cancelled) return;
                const list: CatRow[] = Array.isArray(j.data) ? j.data : (j.data ?? []);
                setParents(list.filter((c) => !c.parentId));

                const flat: FlatSubCat[] = [];
                for (const root of list) {
                    for (const child of root.children ?? []) {
                        flat.push({
                            id: child.id,
                            name: child.name,
                            parentCategoryIds: child.parentCategoryIds?.length
                                ? child.parentCategoryIds
                                : child.parentId
                                  ? [child.parentId]
                                  : [],
                            primaryParentCategoryId:
                                child.primaryParentCategoryId ?? child.parentId ?? null,
                        });
                    }
                }
                setSubCategories(flat);
            })
            .catch(() => {
                setParents([]);
                setSubCategories([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const subById = useMemo(() => new Map(subCategories.map((c) => [c.id, c])), [subCategories]);
    const parentById = useMemo(() => new Map(parents.map((c) => [c.id, c])), [parents]);

    // Sync internal state when value changes externally (e.g. edit / master fill).
    const prevValueRef = useRef(value);
    useEffect(() => {
        const prevPrimary = prevValueRef.current[0] ?? '';
        prevValueRef.current = value;

        if (value.length === 0) {
            setPrimarySubId('');
            if (prevPrimary) {
                setParentId('');
            }
            return;
        }

        const next = derivePickerState(value, subById, parentById);
        setParentId(next.parentId);
        setPrimarySubId(next.primarySubId);
    }, [value, subCategories, parents, subById, parentById]);

    // Resolve category IDs missing from the tree (master catalog / legacy links).
    const valueKey = value.filter(Boolean).join(',');
    useEffect(() => {
        if (loading || !valueKey) return;

        const ids = valueKey.split(',');
        const missing = ids.filter((id) => !subById.has(id) && !parentById.has(id));
        if (missing.length === 0) return;

        let cancelled = false;
        fetch(`/api/v1/categories?resolveIds=${missing.join(',')}`)
            .then((r) => r.json())
            .then((j) => {
                if (cancelled || !j.success || !Array.isArray(j.data)) return;
                const resolved = j.data as Array<{
                    id: string;
                    name: string;
                    slug: string;
                    parentCategoryIds: string[];
                    primaryParentCategoryId: string | null;
                    isParent: boolean;
                }>;

                const newParents: CatRow[] = [];
                const newSubs: FlatSubCat[] = [];
                for (const row of resolved) {
                    if (row.isParent) {
                        newParents.push({
                            id: row.id,
                            name: row.name,
                            slug: row.slug,
                            parentId: null,
                        });
                    } else {
                        newSubs.push({
                            id: row.id,
                            name: row.name,
                            parentCategoryIds: row.parentCategoryIds,
                            primaryParentCategoryId: row.primaryParentCategoryId,
                        });
                    }
                }
                if (newParents.length > 0) {
                    setParents((prev) => [
                        ...prev,
                        ...newParents.filter((np) => !prev.some((x) => x.id === np.id)),
                    ]);
                }
                if (newSubs.length > 0) {
                    setSubCategories((prev) => [
                        ...prev,
                        ...newSubs.filter((ns) => !prev.some((x) => x.id === ns.id)),
                    ]);
                }
            })
            .catch(() => { /* non-fatal */ });

        return () => {
            cancelled = true;
        };
    }, [valueKey, loading, subById, parentById]);

    // Handle outside clicks to close the search panels and clear draft queries
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (parentRef.current && !parentRef.current.contains(target)) {
                setParentOpen(false);
                setParentQuery('');
            }
            if (subRef.current && !subRef.current.contains(target)) {
                setSubOpen(false);
                setSubQuery('');
            }
            if (additionalRef.current && !additionalRef.current.contains(target)) {
                setAdditionalOpen(false);
                setAdditionalQuery('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Parent filtering
    const lcParentQuery = parentQuery.trim().toLowerCase();
    const filteredParents = useMemo(() => {
        return parents.filter((p) =>
            !lcParentQuery || p.name.toLowerCase().includes(lcParentQuery)
        );
    }, [parents, lcParentQuery]);

    const exactParentMatch = useMemo(
        () => parents.some((p) => p.name.toLowerCase() === lcParentQuery),
        [parents, lcParentQuery]
    );

    const canSuggestParent =
        !disableSuggest &&
        lcParentQuery.length >= 2 &&
        !exactParentMatch;

    // Sub-category filtering
    const lcSubQuery = subQuery.trim().toLowerCase();
    const filteredSubs = useMemo(() => {
        if (!parentId) return [];
        return subCategories.filter(
            (c) =>
                c.parentCategoryIds.includes(parentId) &&
                (!lcSubQuery || c.name.toLowerCase().includes(lcSubQuery))
        );
    }, [subCategories, parentId, lcSubQuery]);

    const exactSubMatch = useMemo(
        () => subCategories.some((c) => c.name.toLowerCase() === lcSubQuery),
        [subCategories, lcSubQuery]
    );

    const canSuggestSub =
        !disableSuggest &&
        !!parentId &&
        lcSubQuery.length >= 2 &&
        !exactSubMatch;

    const additionalIds = useMemo(() => value.slice(1), [value]);

    const emitChange = (primary: string, additional: string[]) => {
        const uniqueAdditional = additional.filter((id) => id && id !== primary);
        onChange(primary ? [primary, ...uniqueAdditional] : []);
    };

    const handleParentChange = (nextParentId: string) => {
        setParentId(nextParentId);
        const primaryStillValid =
            primarySubId &&
            subCategories.some(
                (c) => c.id === primarySubId && c.parentCategoryIds.includes(nextParentId),
            );
        if (!primaryStillValid) {
            setPrimarySubId('');
            if (primarySubId || additionalIds.length > 0) {
                emitChange('', []);
            }
        }
    };

    const handlePrimaryChange = (nextPrimary: string) => {
        setPrimarySubId(nextPrimary);
        const keptAdditional = additionalIds.filter((id) => id !== nextPrimary);
        emitChange(nextPrimary, keptAdditional);
    };

    const addAdditional = (id: string) => {
        if (!primarySubId) {
            toast.error('Pick a sub-category first');
            return;
        }
        if (id === primarySubId || additionalIds.includes(id)) return;
        if (additionalIds.length >= maxAdditional) {
            toast.error(`Max ${maxAdditional} additional sub-categories`);
            return;
        }
        emitChange(primarySubId, [...additionalIds, id]);
        setAdditionalQuery('');
    };

    const removeAdditional = (id: string) => {
        emitChange(primarySubId, additionalIds.filter((v) => v !== id));
    };

    const trimmedAdditionalQuery = additionalQuery.trim();
    const lcAdditionalQuery = trimmedAdditionalQuery.toLowerCase();

    const additionalCandidates = useMemo(() => {
        return subCategories.filter(
            (c) =>
                c.id !== primarySubId &&
                !additionalIds.includes(c.id) &&
                (!lcAdditionalQuery || c.name.toLowerCase().includes(lcAdditionalQuery)),
        );
    }, [subCategories, primarySubId, additionalIds, lcAdditionalQuery]);

    const exactAdditionalMatch = useMemo(
        () => subCategories.some((c) => c.name.toLowerCase() === lcAdditionalQuery),
        [subCategories, lcAdditionalQuery],
    );

    const canSuggestAdditional =
        !disableSuggest &&
        !!parentId &&
        !!primarySubId &&
        trimmedAdditionalQuery.length >= 2 &&
        !exactAdditionalMatch;

    const submitAdditionalSuggestion = async () => {
        if (!canSuggestAdditional || suggesting) return;
        setSuggesting(true);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmedAdditionalQuery, parentId }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Suggestion failed');
            const cat = json.data as CatRow;
            const row: FlatSubCat = {
                id: cat.id,
                name: cat.name,
                parentCategoryIds: parentId ? [parentId] : [],
                primaryParentCategoryId: parentId || null,
            };
            setSubCategories((prev) => (prev.some((p) => p.id === row.id) ? prev : [...prev, row]));
            addAdditional(cat.id);
            toast.success(
                json.alreadyExists
                    ? `Picked existing sub-category "${cat.name}"`
                    : `Sent "${trimmedAdditionalQuery}" to admin for review`,
            );
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Suggestion failed');
        } finally {
            setSuggesting(false);
        }
    };

    // Request a brand-new PARENT (root) category — POST with no parentId.
    const submitParentRequest = async (customName?: string) => {
        const name = (customName || parentQuery).trim();
        if (name.length < 2 || suggestingParent) return;
        setSuggestingParent(true);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Request failed');
            const cat = json.data as CatRow;
            setParents((prev) =>
                prev.some((p) => p.id === cat.id)
                    ? prev
                    : [...prev, { id: cat.id, name: cat.name, slug: cat.slug, parentId: null }],
            );
            handleParentChange(cat.id);
            setParentOpen(false);
            setParentQuery('');
            toast.success(
                json.alreadyExists
                    ? `Using existing parent "${cat.name}"`
                    : `Sent "${name}" to admin for review`,
            );
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Request failed');
        } finally {
            setSuggestingParent(false);
        }
    };

    // Request a new SUB-category under the selected parent — POST with parentId.
    const submitSubRequest = async (customName?: string) => {
        const name = (customName || subQuery).trim();
        if (!parentId) {
            toast.error('Pick a parent category first');
            return;
        }
        if (name.length < 2 || suggestingSub) return;
        setSuggestingSub(true);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, parentId }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Request failed');
            const cat = json.data as CatRow;
            const row: FlatSubCat = {
                id: cat.id,
                name: cat.name,
                parentCategoryIds: [parentId],
                primaryParentCategoryId: parentId,
            };
            setSubCategories((prev) => (prev.some((p) => p.id === row.id) ? prev : [...prev, row]));
            handlePrimaryChange(cat.id);
            setSubOpen(false);
            setSubQuery('');
            toast.success(
                json.alreadyExists
                    ? `Using existing sub-category "${cat.name}"`
                    : `Sent "${name}" to admin for review`,
            );
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Request failed');
        } finally {
            setSuggestingSub(false);
        }
    };

    // Dynamic input displays
    const displayParentValue = parentOpen ? parentQuery : (parentById.get(parentId)?.name ?? '');
    const displaySubValue = subOpen ? subQuery : (subById.get(primarySubId)?.name ?? '');
    const parentLocked = disabled || lockParent;
    const subLocked = disabled || !parentId;
    const subCategoryMissing =
        value.length > 0 && !!parentId && !primarySubId && value.some((id) => parentById.has(id));

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-[13px] font-bold text-[#181725] mb-1">{label}</label>
                {helper && <p className="text-[11px] text-gray-400 mt-0.5">{helper}</p>}
            </div>

            <div className="flex flex-col lg:flex-row lg:items-start items-stretch gap-4 w-full">
                {/* Step 1: Parent Category */}
                <div ref={parentRef} className="flex-1 min-w-0 relative">
                    <label className="block text-[12px] font-semibold text-[#181725] mb-1.5">
                        Parent Category <span className="text-[#E74C3C]">*</span>
                    </label>
                    
                    <div className={cn(
                        "relative flex items-center bg-white border border-[#EEEEEE] rounded-[10px] transition-all duration-200",
                        "focus-within:border-primary/40",
                        parentLocked && "bg-gray-50 cursor-not-allowed opacity-60"
                    )}>
                        <Search size={14} className="ml-3 text-gray-400 shrink-0" />
                        <input
                            type="text"
                            value={displayParentValue}
                            title={displayParentValue || undefined}
                            onChange={(e) => {
                                setParentQuery(e.target.value);
                                setParentOpen(true);
                            }}
                            onFocus={() => {
                                if (!parentLocked) {
                                    setParentOpen(true);
                                    setParentQuery('');
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (canSuggestParent) {
                                        void submitParentRequest(parentQuery);
                                    }
                                }
                            }}
                            placeholder={loading ? 'Loading...' : 'Search parent category…'}
                            disabled={loading || parentLocked}
                            className="w-full min-w-0 h-[40px] bg-transparent pl-2 pr-8 text-[13px] outline-none border-none disabled:cursor-not-allowed truncate"
                        />
                        {parentId && !parentLocked && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleParentChange('');
                                    setParentQuery('');
                                }}
                                className="absolute right-3 text-gray-400 hover:text-red-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                        {!parentId && (
                            <ChevronDown size={14} className="absolute right-3 text-gray-400 pointer-events-none" />
                        )}
                    </div>

                    {parentOpen && (
                        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#EEEEEE] rounded-[10px] shadow-lg max-h-[220px] overflow-y-auto">
                            {filteredParents.length > 0 ? (
                                <div className="py-1">
                                    {filteredParents.map((p) => {
                                        const isSelected = p.id === parentId;
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                    handleParentChange(p.id);
                                                    setParentOpen(false);
                                                    setParentQuery('');
                                                }}
                                                className={cn(
                                                    "w-full flex items-center justify-between px-3 py-2 text-left text-[13px] transition-colors",
                                                    isSelected 
                                                        ? "bg-primary-light text-primary font-semibold" 
                                                        : "text-[#181725] hover:bg-gray-50"
                                                )}
                                            >
                                                <span>{p.name}</span>
                                                {isSelected && <Check size={12} className="text-primary" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="p-3 text-[12px] text-gray-400 text-center">
                                    No parents found
                                </div>
                            )}
                            
                            {canSuggestParent && (
                                <div className="border-t border-gray-100 p-2 bg-gray-50/50">
                                    <button
                                        type="button"
                                        onClick={() => void submitParentRequest(parentQuery)}
                                        disabled={suggestingParent}
                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] bg-primary-light hover:bg-primary text-primary hover:text-white text-[12px] font-bold transition-all"
                                    >
                                        {suggestingParent ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Plus size={12} />
                                        )}
                                        Request &ldquo;{parentQuery.trim()}&rdquo;
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Connection Arrow 1 */}
                <div className="flex items-center justify-center shrink-0 py-1 lg:py-0 lg:mt-[36px] transition-all duration-300">
                    <ChevronRight className={cn(
                        "hidden lg:block w-5 h-5 transition-all duration-300",
                        parentId 
                            ? "text-primary drop-shadow-[0_0_6px_rgba(107, 29, 46, )] animate-pulse" 
                            : "text-gray-300"
                    )} />
                    <ChevronDown className={cn(
                        "lg:hidden w-5 h-5 transition-all duration-300",
                        parentId 
                            ? "text-primary drop-shadow-[0_0_6px_rgba(107, 29, 46, )] animate-pulse" 
                            : "text-gray-300"
                    )} />
                </div>

                {/* Step 2: Sub-Category */}
                <div ref={subRef} className="flex-1 min-w-0 relative">
                    <label className="block text-[12px] font-semibold text-[#181725] mb-1.5">
                        Sub-Category <span className="text-[#E74C3C]">*</span>
                        <span className="text-[11px] font-normal text-gray-400 ml-1">(primary)</span>
                    </label>

                    <div className={cn(
                        "relative flex items-center bg-white border border-[#EEEEEE] rounded-[10px] transition-all duration-200",
                        "focus-within:border-primary/40",
                        subLocked && "bg-gray-50 cursor-not-allowed opacity-60"
                    )}>
                        <Search size={14} className="ml-3 text-gray-400 shrink-0" />
                        <input
                            type="text"
                            value={displaySubValue}
                            title={displaySubValue || undefined}
                            onChange={(e) => {
                                setSubQuery(e.target.value);
                                setSubOpen(true);
                            }}
                            onFocus={() => {
                                if (parentId && !subLocked) {
                                    setSubOpen(true);
                                    setSubQuery('');
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (canSuggestSub) {
                                        void submitSubRequest(subQuery);
                                    }
                                }
                            }}
                            placeholder={!parentId ? 'Select parent first' : 'Search sub-category…'}
                            disabled={loading || subLocked}
                            className="w-full min-w-0 h-[40px] bg-transparent pl-2 pr-8 text-[13px] outline-none border-none disabled:cursor-not-allowed truncate"
                        />
                        {primarySubId && !subLocked && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrimaryChange('');
                                    setSubQuery('');
                                }}
                                className="absolute right-3 text-gray-400 hover:text-red-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                        {!primarySubId && (
                            <ChevronDown size={14} className="absolute right-3 text-gray-400 pointer-events-none" />
                        )}
                    </div>

                    {subCategoryMissing && (
                        <p className="text-[11px] text-amber-700 font-medium mt-1.5">
                            Sub-category missing — pick one below or fix master catalog data.
                        </p>
                    )}

                    {subOpen && parentId && (
                        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#EEEEEE] rounded-[10px] shadow-lg max-h-[220px] overflow-y-auto">
                            {filteredSubs.length > 0 ? (
                                <div className="py-1">
                                    {filteredSubs.map((c) => {
                                        const isSelected = c.id === primarySubId;
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                    handlePrimaryChange(c.id);
                                                    setSubOpen(false);
                                                    setSubQuery('');
                                                }}
                                                className={cn(
                                                    "w-full flex items-center justify-between px-3 py-2 text-left text-[13px] transition-colors",
                                                    isSelected 
                                                        ? "bg-primary-light text-primary font-semibold" 
                                                        : "text-[#181725] hover:bg-gray-50"
                                                )}
                                            >
                                                <span>{c.name}</span>
                                                {isSelected && <Check size={12} className="text-primary" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="p-3 text-[12px] text-gray-400 text-center">
                                    No sub-categories found
                                </div>
                            )}

                            {canSuggestSub && (
                                <div className="border-t border-gray-100 p-2 bg-gray-50/50">
                                    <button
                                        type="button"
                                        onClick={() => void submitSubRequest(subQuery)}
                                        disabled={suggestingSub}
                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] bg-primary-light hover:bg-primary text-primary hover:text-white text-[12px] font-bold transition-all"
                                    >
                                        {suggestingSub ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Plus size={12} />
                                        )}
                                        Request &ldquo;{subQuery.trim()}&rdquo;
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Connection Arrow 2 */}
                <div className="flex items-center justify-center shrink-0 py-1 lg:py-0 lg:mt-[36px] transition-all duration-300">
                    <ChevronRight className={cn(
                        "hidden lg:block w-5 h-5 transition-all duration-300",
                        primarySubId 
                            ? "text-primary drop-shadow-[0_0_6px_rgba(107, 29, 46, )] animate-pulse" 
                            : "text-gray-300"
                    )} />
                    <ChevronDown className={cn(
                        "lg:hidden w-5 h-5 transition-all duration-300",
                        primarySubId 
                            ? "text-primary drop-shadow-[0_0_6px_rgba(107, 29, 46, )] animate-pulse" 
                            : "text-gray-300"
                    )} />
                </div>

                {/* Step 3: Additional Sub-Categories */}
                <div ref={additionalRef} className="flex-1 min-w-0">
                    <label className="block text-[12px] font-semibold text-[#181725] mb-1.5">
                        Additional Sub-Categories
                        <span className="text-[11px] font-normal text-gray-400 ml-1">(secondary · display/filter only)</span>
                    </label>

                    <div className="relative">
                        <div className={cn(
                            "relative flex items-center bg-white border border-[#EEEEEE] rounded-[10px] transition-all duration-200",
                            "focus-within:border-primary/40",
                            (!primarySubId || disabled || additionalIds.length >= maxAdditional) && "bg-gray-50 cursor-not-allowed opacity-60"
                        )}>
                            <Search size={14} className="ml-3 text-gray-400 shrink-0" />
                            <input
                                type="text"
                                value={additionalQuery}
                                onChange={(e) => {
                                    setAdditionalQuery(e.target.value);
                                    setAdditionalOpen(true);
                                }}
                                onFocus={() => {
                                    if (primarySubId && !disabled && additionalIds.length < maxAdditional) {
                                        setAdditionalOpen(true);
                                    }
                                }}
                                placeholder={
                                    !primarySubId
                                        ? 'Pick a sub-category first'
                                        : additionalIds.length >= maxAdditional
                                        ? `Max ${maxAdditional} added`
                                        : 'Search additional sub-categories…'
                                }
                                disabled={!primarySubId || disabled || additionalIds.length >= maxAdditional}
                                className="w-full h-[40px] bg-transparent pl-2 pr-8 text-[13px] outline-none border-none disabled:cursor-not-allowed"
                            />
                            {additionalQuery && (
                                <button
                                    type="button"
                                    onClick={() => setAdditionalQuery('')}
                                    className="absolute right-3 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {additionalOpen && primarySubId && (
                            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-[#EEEEEE] rounded-[10px] shadow-lg max-h-[220px] overflow-y-auto">
                                {additionalCandidates.length > 0 ? (
                                    <div className="py-1">
                                        {additionalCandidates.slice(0, 40).map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                    addAdditional(c.id);
                                                    setAdditionalOpen(false);
                                                    setAdditionalQuery('');
                                                }}
                                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary-light hover:text-primary text-[#181725] text-left transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Tag size={12} className="text-gray-400 shrink-0" />
                                                    <span className="text-[13px]">{c.name}</span>
                                                </div>
                                                {c.primaryParentCategoryId && parentById.get(c.primaryParentCategoryId) && (
                                                    <span className="text-[10px] text-gray-400">
                                                        in {parentById.get(c.primaryParentCategoryId)?.name}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-3 text-[12px] text-gray-400 text-center">
                                        No candidates found
                                    </div>
                                )}

                                {canSuggestAdditional && (
                                    <div className="border-t border-gray-100 p-2 bg-gray-50/50">
                                        <button
                                            type="button"
                                            onClick={submitAdditionalSuggestion}
                                            disabled={suggesting}
                                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] bg-primary-light hover:bg-primary text-primary hover:text-white text-[12px] font-bold transition-all"
                                        >
                                            {suggesting ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Plus size={12} />
                                            )}
                                            Request &ldquo;{trimmedAdditionalQuery}&rdquo;
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2 min-h-[40px] p-2 mt-2 border border-[#EEEEEE] rounded-[10px] bg-gray-50">
                        {additionalIds.length === 0 && (
                            <span className="text-[12px] text-gray-400 italic px-1">None added</span>
                        )}
                        {additionalIds.map((id) => {
                            const row = subById.get(id);
                            return (
                                <span
                                    key={id}
                                    className="flex items-center gap-1.5 bg-[#e8f5e9] text-primary text-[12px] font-semibold rounded-full px-3 py-1 shadow-sm"
                                >
                                    {row?.name ?? id}
                                    <button
                                        type="button"
                                        onClick={() => removeAdditional(id)}
                                        disabled={disabled}
                                        className="hover:text-red-500 transition-colors"
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                        {additionalIds.length} / {maxAdditional} additional
                    </p>
                </div>
            </div>
        </div>
    );
}
