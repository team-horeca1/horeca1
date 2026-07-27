'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, ChevronRight, Plus, Minus, Check, AlertCircle, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dal } from '@/lib/dal';
import { toast } from 'sonner';
import type { Vendor, VendorProduct, OrderList } from '@/types';

interface CreateListOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (list: { name: string; items: { productId: string; quantity: number; vendorId: string }[] }) => void;
    initialData?: OrderList | null;
}

export function CreateListOverlay({ isOpen, onClose, onSave, initialData }: CreateListOverlayProps) {
    const [step, setStep] = useState<'vendor' | 'items'>('vendor');
    const [listName, setListName] = useState('');
    const [editingName, setEditingName] = useState(false);
    const [dalVendors, setDalVendors] = useState<Vendor[]>([]);
    const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);
    const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
    // Maps productId -> vendorId so we know which vendor each item belongs to
    const [itemVendorMap, setItemVendorMap] = useState<Record<string, string>>({});
    const [vendorSearchQuery, setVendorSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [vendorProductsMap, setVendorProductsMap] = useState<Record<string, VendorProduct[]>>({});

    // Fetch vendors from DAL on mount
    useEffect(() => {
        dal.vendors.list()
            .then(({ vendors }) => {
                setDalVendors(vendors);
                if (!activeVendor && vendors.length > 0) {
                    setActiveVendor(vendors[0]);
                }
            })
            .catch((err) => console.error('Failed to load vendors:', err));
    }, []);

    // Fetch products when active vendor changes
    useEffect(() => {
        if (!activeVendor) return;
        if (vendorProductsMap[activeVendor.id]) return; // already cached
        dal.vendors.getProducts(activeVendor.id)
            .then(({ products }) => {
                setVendorProductsMap(prev => ({ ...prev, [activeVendor.id]: products }));
            })
            .catch((err) => console.error('Failed to load vendor products:', err));
    }, [activeVendor, vendorProductsMap]);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                Promise.resolve().then(() => setListName(initialData.name));
                const qtys = Object.fromEntries(initialData.items.map(i => [i.productId, i.defaultQty]));
                Promise.resolve().then(() => setSelectedItems(qtys));
                const vmap: Record<string, string> = {};
                initialData.items.forEach(item => {
                    if (item.product?.vendorId) {
                        vmap[item.productId] = item.product.vendorId;
                    }
                });
                Promise.resolve().then(() => setItemVendorMap(vmap));
                const firstVendorId = initialData.items[0]?.product?.vendorId;
                const firstVendor = firstVendorId ? dalVendors.find(v => v.id === firstVendorId) : null;
                Promise.resolve().then(() => setActiveVendor(firstVendor || null));
                Promise.resolve().then(() => setStep('items'));
            } else {
                Promise.resolve().then(() => {
                    setStep('vendor');
                    setListName('');
                    setActiveVendor(null);
                    setSelectedItems({});
                    setItemVendorMap({});
                });
            }
            Promise.resolve().then(() => {
                setVendorSearchQuery('');
                setSelectedCategory(null);
                setSearchQuery('');
                setEditingName(false);
            });
        }
    }, [isOpen, initialData, dalVendors]);

    // Products for active vendor filtered by search
    const vendorProducts = useMemo(() => {
        if (!activeVendor) return [];
        const products = vendorProductsMap[activeVendor.id] || [];
        if (!searchQuery) return products;
        return products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [activeVendor, searchQuery, vendorProductsMap]);

    // All categories across vendors (deduped) — for category-suggestion chips
    const allCategories = useMemo(() => {
        const set = new Set<string>();
        dalVendors.forEach(v => v.categories.forEach(c => set.add(c)));
        return Array.from(set);
    }, [dalVendors]);

    // Categories matching the search query — shown as clickable chips
    const matchingCategories = useMemo(() => {
        const q = vendorSearchQuery.trim().toLowerCase();
        if (!q) return [];
        return allCategories.filter(c => c.toLowerCase().includes(q)).slice(0, 6);
    }, [allCategories, vendorSearchQuery]);

    // Vendors filtered: 1) by selectedCategory if set, 2) else by search query (name or category match)
    const filteredVendors = useMemo(() => {
        if (selectedCategory) {
            return dalVendors.filter(v => v.categories.includes(selectedCategory));
        }
        const q = vendorSearchQuery.trim().toLowerCase();
        if (!q) return dalVendors;
        return dalVendors.filter(v =>
            v.name.toLowerCase().includes(q) ||
            v.categories.some(c => c.toLowerCase().includes(q))
        );
    }, [dalVendors, vendorSearchQuery, selectedCategory]);

    // Count items added per vendor
    const itemsPerVendor = useMemo(() => {
        const counts: Record<string, number> = {};
        Object.entries(selectedItems).forEach(([productId, qty]) => {
            if (qty > 0) {
                const vendorId = itemVendorMap[productId];
                if (vendorId) counts[vendorId] = (counts[vendorId] || 0) + 1;
            }
        });
        return counts;
    }, [selectedItems, itemVendorMap]);

    const totalItemCount = useMemo(
        () => Object.values(selectedItems).filter(q => q > 0).length,
        [selectedItems]
    );

    const vendorCount = Object.keys(itemsPerVendor).length;

    const handleAddItem = (productId: string) => {
        if (!activeVendor) return;
        setSelectedItems(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
        setItemVendorMap(prev => ({ ...prev, [productId]: activeVendor.id }));
    };

    const handleRemoveItem = (productId: string) => {
        setSelectedItems(prev => {
            const next = { ...prev };
            if (next[productId] > 1) {
                next[productId] -= 1;
            } else {
                delete next[productId];
                // Remove from vendor map too
                setItemVendorMap(vm => {
                    const vmNext = { ...vm };
                    delete vmNext[productId];
                    return vmNext;
                });
            }
            return next;
        });
    };

    const handleSave = () => {
        if (!listName.trim()) {
            toast.error('Please enter a list name');
            setStep('vendor');
            return;
        }

        const items = Object.entries(selectedItems)
            .filter(([, qty]) => qty > 0)
            .map(([productId, quantity]) => ({
                productId,
                quantity,
                vendorId: itemVendorMap[productId] || activeVendor?.id || '',
            }));

        if (items.length === 0) {
            toast.error('Please add at least one item');
            return;
        }

        onSave({ name: listName, items });

        // Reset
        setStep('vendor');
        setListName('');
        setActiveVendor(null);
        setSelectedItems({});
        setItemVendorMap({});
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10001] bg-[#181725]/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6 animate-in fade-in duration-300">
            {/* Click to close (Desktop only) */}
            <div className="absolute inset-0 cursor-pointer hidden md:block" onClick={onClose} />
            
            <div className="relative w-full max-w-[750px] bg-white rounded-t-[32px] md:rounded-[32px] max-h-[92vh] md:max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 duration-500 md:duration-300 ease-out overflow-hidden">

                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center justify-between mb-2 gap-3">
                        <h2 className="text-[20px] font-black text-[#181725]">
                            {step === 'vendor' ? 'Choose Vendor' : 'Add Items'}
                        </h2>
                        <button onClick={onClose} className="p-2 -mr-2 bg-gray-50 rounded-full shrink-0">
                            <X size={20} className="text-gray-400" />
                        </button>
                    </div>

                    {/* Editable list name shown on items step */}
                    {step === 'items' && (
                        <div className="mt-1">
                            {editingName ? (
                                <input
                                    type="text"
                                    autoFocus
                                    value={listName}
                                    onChange={(e) => setListName(e.target.value)}
                                    onBlur={() => setEditingName(false)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingName(false); }}
                                    className="w-full bg-[#F7F8FA] border border-[#53B175]/30 rounded-xl px-3 py-2 text-[14px] font-bold text-[#181725] focus:bg-white focus:border-[#53B175] outline-none"
                                />
                            ) : (
                                <button
                                    onClick={() => setEditingName(true)}
                                    className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-[#53B175] transition-colors"
                                >
                                    <span className="font-bold text-[#181725]">{listName || 'Untitled list'}</span>
                                    <span className="text-[11px] text-[#53B175] font-semibold underline">edit</span>
                                </button>
                            )}
                        </div>
                    )}

                    {/* Progress Bar — 2 steps */}
                    <div className="flex gap-1 h-1 mt-4">
                        <div className="flex-1 rounded-full bg-[#53B175]" />
                        <div className={cn("flex-1 rounded-full transition-colors", step === 'items' ? "bg-[#53B175]" : "bg-gray-100")} />
                    </div>
                </div>

                {/* Content — top padding lives on each step's content (or its sticky header)
                    so a sticky child can pin flush to the scroll-container border without a gap
                    where products would otherwise scroll through. */}
                <div className="flex-1 overflow-y-auto px-6 pb-6">

                    {/* ── STEP 1: Choose Vendor ── */}
                    {step === 'vendor' && (
                        <div className="space-y-5 pt-6">
                            {/* List name input */}
                            <div className="space-y-2">
                                <label className="text-[12px] font-bold text-gray-400 uppercase tracking-wider ml-1">List Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Weekly Dairy"
                                    value={listName}
                                    onChange={(e) => setListName(e.target.value)}
                                    className="w-full bg-[#F7F8FA] border border-gray-100 rounded-[16px] px-5 py-3 text-[15px] font-bold text-[#181725] focus:bg-white focus:border-[#53B175] focus:ring-4 focus:ring-[#53B175]/10 outline-none transition-all placeholder:text-gray-300"
                                />
                            </div>

                            {/* Search vendors / categories */}
                            <div className="space-y-2">
                                <label className="text-[12px] font-bold text-gray-400 uppercase tracking-wider ml-1">Search Vendors</label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search by vendor or category..."
                                        value={vendorSearchQuery}
                                        onChange={(e) => {
                                            setVendorSearchQuery(e.target.value);
                                            if (selectedCategory) setSelectedCategory(null);
                                        }}
                                        className="w-full bg-[#F7F8FA] border border-transparent rounded-full pl-12 pr-4 py-3 text-[14px] font-medium text-[#181725] focus:bg-white focus:border-[#53B175]/20 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {/* Active category filter pill */}
                            {selectedCategory && (
                                <div className="flex items-center gap-2 bg-[#53B175]/10 border border-[#53B175]/30 px-3 py-2 rounded-xl">
                                    <span className="text-[11px] font-bold text-gray-500">Category:</span>
                                    <span className="text-[12px] font-bold text-[#53B175]">{selectedCategory}</span>
                                    <button
                                        onClick={() => setSelectedCategory(null)}
                                        className="ml-auto text-[#53B175] hover:text-[#181725]"
                                        title="Clear category filter"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}

                            {/* Matching category chips — clickable to filter vendors */}
                            {!selectedCategory && matchingCategories.length > 0 && (
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Matching categories</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {matchingCategories.map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => {
                                                    setSelectedCategory(cat);
                                                    setVendorSearchQuery('');
                                                }}
                                                className="text-[11px] font-bold bg-white border border-[#53B175]/30 text-[#53B175] hover:bg-[#53B175] hover:text-white rounded-full px-3 py-1 transition-colors"
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Vendor grid */}
                            <div>
                                {filteredVendors.length > 0 ? (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                        {filteredVendors.map(vendor => {
                                            const isActive = activeVendor?.id === vendor.id;
                                            return (
                                                <button
                                                    key={vendor.id}
                                                    onClick={() => setActiveVendor(vendor)}
                                                    className={cn(
                                                        "flex flex-col items-center text-center p-3 rounded-2xl border transition-all active:scale-95",
                                                        isActive
                                                            ? "bg-[#53B175]/10 border-[#53B175] ring-2 ring-[#53B175]/20"
                                                            : "bg-white border-gray-100 hover:border-[#53B175]/40"
                                                    )}
                                                >
                                                    <div className="w-12 h-12 rounded-xl border border-gray-100 p-1 bg-white overflow-hidden mb-2">
                                                        <img src={vendor.logo} alt="" className="w-full h-full object-contain" />
                                                    </div>
                                                    <div className="text-[12px] font-bold text-[#181725] truncate w-full">{vendor.name}</div>
                                                    <div className="text-[10px] text-gray-400 font-medium truncate w-full">{vendor.categories[0]}</div>
                                                    {isActive && <Check size={13} className="text-[#53B175] mt-1" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-10">
                                        <AlertCircle size={32} className="mx-auto text-gray-200 mb-2" />
                                        <p className="text-[13px] text-gray-400 font-medium">No vendors match your search</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── STEP 2: Add Items ── */}
                    {step === 'items' && (
                        <div className="flex flex-col">

                            {/* Sticky header: vendor switcher + summary + search stay pinned while
                                the product list scrolls underneath. -mx-6/px-6 lets the white background
                                span the scroll container's horizontal padding so nothing peeks through. */}
                            <div className="sticky top-0 z-10 -mx-6 px-6 pt-6 pb-3 bg-white space-y-4">

                                {/* Active vendor pill */}
                                {activeVendor && (
                                    <div className="flex items-center justify-between bg-[#53B175]/10 p-3 rounded-2xl border border-[#53B175]/20">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-lg border border-gray-100 p-1 bg-white overflow-hidden shrink-0">
                                                <img src={activeVendor.logo} alt="" className="w-full h-full object-contain" />
                                            </div>
                                            <div className="text-left min-w-0">
                                                <div className="text-[13px] font-bold text-[#53B175] truncate">{activeVendor.name}</div>
                                                <div className="text-[10px] text-[#53B175]/70 font-medium">
                                                    {itemsPerVendor[activeVendor.id]
                                                        ? `${itemsPerVendor[activeVendor.id]} item${itemsPerVendor[activeVendor.id] !== 1 ? 's' : ''} added`
                                                        : 'No items added yet'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { setStep('vendor'); setSearchQuery(''); }}
                                            className="text-[11px] font-bold text-[#53B175] underline shrink-0 ml-2"
                                        >
                                            Change
                                        </button>
                                    </div>
                                )}

                                {/* Summary pill */}
                                {totalItemCount > 0 && (
                                    <div className="flex items-center gap-2 bg-[#181725]/5 px-4 py-2.5 rounded-xl">
                                        <Store size={14} className="text-[#181725]/60 shrink-0" />
                                        <span className="text-[12px] font-bold text-[#181725]">
                                            {totalItemCount} item{totalItemCount !== 1 ? 's' : ''} added
                                        </span>
                                        <span className="text-gray-400 text-[11px]">
                                            from {vendorCount} store{vendorCount !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                )}

                                {/* Add Items label + search */}
                                <div className="space-y-2">
                                    <label className="text-[12px] font-bold text-gray-400 uppercase tracking-wider ml-1 block">Add Items</label>
                                    <div className="relative">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            placeholder={`Search in ${activeVendor?.name || 'vendor'}...`}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-[#F7F8FA] border border-transparent rounded-full pl-12 pr-4 py-3 text-[14px] font-medium text-[#181725] focus:bg-white focus:border-[#53B175]/20 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Product list for active vendor */}
                            <div className="space-y-3 mt-4">
                                {vendorProducts.length > 0 ? (
                                    vendorProducts.map(product => {
                                        const qty = selectedItems[product.id] || 0;
                                        return (
                                            <div key={product.id} className="p-3 bg-[#FCFDFF] border border-gray-50 rounded-2xl">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 p-1 flex items-center justify-center shrink-0">
                                                            <img src={product.images[0]} alt="" className="w-full h-full object-contain" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h4 className="text-[13px] font-bold text-[#181725] truncate">{product.name}</h4>
                                                            <p className="text-[11px] text-gray-700 font-bold">₹{product.price} <span className="text-gray-400 font-medium">/ {product.packSize}</span></p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 shrink-0">
                                                        {qty > 0 ? (
                                                            <div className="flex items-center gap-3 bg-white border border-[#53B175]/20 px-2 py-1.5 rounded-full shadow-sm">
                                                                <button onClick={() => handleRemoveItem(product.id)} className="text-[#53B175] active:scale-75 transition-transform">
                                                                    <Minus size={14} strokeWidth={3} />
                                                                </button>
                                                                <span className="text-[13px] font-extrabold text-[#181725] w-4 text-center">{qty}</span>
                                                                <button onClick={() => handleAddItem(product.id)} className="text-[#53B175] active:scale-75 transition-transform">
                                                                    <Plus size={14} strokeWidth={3} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleAddItem(product.id)}
                                                                className="bg-white border-2 border-dashed border-gray-100 p-2 rounded-full text-gray-300 hover:text-[#53B175] hover:border-[#53B175] transition-all active:scale-90"
                                                            >
                                                                <Plus size={18} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Bulk pricing slabs — click sets qty to slab.minQty (capped at stock) */}
                                                {product.bulkPrices && product.bulkPrices.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-2 pl-[60px] items-center">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bulk:</span>
                                                        {product.bulkPrices.map((slab, idx) => {
                                                            const exceedsStock = slab.minQty > product.stock;
                                                            const active = qty >= slab.minQty;
                                                            return (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    disabled={exceedsStock}
                                                                    onClick={() => {
                                                                        if (!activeVendor) return;
                                                                        const target = Math.min(product.stock, slab.minQty);
                                                                        setSelectedItems(prev => ({ ...prev, [product.id]: target }));
                                                                        setItemVendorMap(prev => ({ ...prev, [product.id]: activeVendor.id }));
                                                                    }}
                                                                    title={exceedsStock ? `Only ${product.stock} in stock` : `Set qty to ${slab.minQty}`}
                                                                    className={`text-[10px] font-bold rounded-full px-2.5 py-0.5 transition-all border ${
                                                                        exceedsStock
                                                                            ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                                                                            : active
                                                                                ? 'bg-[#53B175] border-[#53B175] text-white'
                                                                                : 'bg-[#53B175]/10 border-[#53B175]/30 text-[#53B175] hover:bg-[#53B175] hover:text-white'
                                                                    }`}
                                                                >
                                                                    {slab.minQty}+ @ ₹{slab.price}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center py-10">
                                        <AlertCircle size={32} className="mx-auto text-gray-200 mb-2" />
                                        <p className="text-[13px] text-gray-400 font-medium">No products found for this search</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-gray-50 bg-gray-50/30 shrink-0">
                    {step === 'vendor' && (
                        <button
                            disabled={!listName.trim() || !activeVendor}
                            onClick={() => setStep('items')}
                            className="w-full bg-[#181725] text-white py-[18px] rounded-[22px] font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
                        >
                            Continue
                            <ChevronRight size={18} />
                        </button>
                    )}
                    {step === 'items' && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setStep('vendor'); setSearchQuery(''); }}
                                className="flex-1 bg-white border border-gray-200 text-[#181725] py-[18px] rounded-[22px] font-bold text-[16px] transition-all active:scale-95"
                            >
                                Back
                            </button>
                            <button
                                disabled={totalItemCount === 0}
                                onClick={handleSave}
                                className="flex-[2] bg-[#53B175] text-white py-[18px] rounded-[22px] font-bold text-[16px] flex items-center justify-center shadow-lg shadow-green-100 disabled:opacity-50 transition-all active:scale-95"
                            >
                                <Plus size={20} className="mr-2" />
                                {initialData ? 'Update Order List' : 'Create Order List'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
