'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
    Users, Plus, Loader2, Search, X, MapPin, Building2, UserPlus, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

const AddVendorWizard = dynamic(
    () => import('@/components/features/admin/AddVendorWizard').then((m) => m.AddVendorWizard),
    { ssr: false },
);

interface AuthorizedDistributor {
    id: string;
    vendorId: string;
    status: 'pending' | 'approved' | 'rejected';
    brandApprovedAt: string | null;
    note: string | null;
    vendor: {
        id: string;
        businessName: string;
        slug: string;
        logoUrl: string | null;
        city: string | null;
        _count?: { products: number };
    };
}

interface SearchVendor {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    city: string | null;
    _count: { products: number };
}

export default function BrandDistributorsPage() {
    const [distributors, setDistributors] = useState<AuthorizedDistributor[]>([]);
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchCity, setSearchCity] = useState('');
    const [searchResults, setSearchResults] = useState<SearchVendor[]>([]);
    const [searching, setSearching] = useState(false);

    const fetchDistributors = useCallback(async () => {
        try {
            setLoading(true);
            const r = await fetch('/api/v1/brand/authorized-distributors');
            const j = await r.json();
            if (j.success) setDistributors(j.data.distributors ?? []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchDistributors(); }, [fetchDistributors]);

    const runSearch = useCallback(async () => {
        if (!searchQuery.trim() && !searchCity.trim()) {
            setSearchResults([]);
            return;
        }
        setSearching(true);
        try {
            const qs = new URLSearchParams();
            if (searchQuery.trim()) qs.set('q', searchQuery.trim());
            if (searchCity.trim()) qs.set('city', searchCity.trim());
            const r = await fetch(`/api/v1/brand/vendors/search?${qs}`);
            const j = await r.json();
            if (j.success) setSearchResults(j.data.vendors ?? []);
        } catch {
            toast.error('Search failed');
        } finally {
            setSearching(false);
        }
    }, [searchQuery, searchCity]);

    useEffect(() => {
        const t = setTimeout(() => { void runSearch(); }, 300);
        return () => clearTimeout(t);
    }, [runSearch]);

    const addDistributor = async (vendorId: string) => {
        setActingId(vendorId);
        try {
            const r = await fetch('/api/v1/brand/authorized-distributors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorId, action: 'add' }),
            });
            const j = await r.json();
            if (!j.success) throw new Error(j.error?.message || 'Failed to add distributor');
            toast.success('Distributor added');
            setSearchResults((prev) => prev.filter((v) => v.id !== vendorId));
            fetchDistributors();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to add distributor');
        } finally {
            setActingId(null);
        }
    };

    const removeDistributor = async (vendorId: string, name: string) => {
        if (!window.confirm(`Remove ${name} from your distributor network?`)) return;
        setActingId(vendorId);
        try {
            const r = await fetch('/api/v1/brand/authorized-distributors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorId, action: 'reject' }),
            });
            const j = await r.json();
            if (!j.success) throw new Error(j.error?.message || 'Failed to remove');
            toast.success('Distributor removed');
            fetchDistributors();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to remove');
        } finally {
            setActingId(null);
        }
    };

    const approved = distributors.filter((d) => d.status === 'approved');

    return (
        <div className="max-w-[1000px] mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-[26px] font-[900] text-[#181725] tracking-tight flex items-center gap-2">
                        <Users size={26} className="text-[#53B175]" /> Distributor Network
                    </h1>
                    <p className="text-[#7C7C7C] font-medium mt-0.5 text-[14px] max-w-2xl">
                        Search marketplace vendors and add them as your distributors, or onboard a new one.
                        Authorized distributors map your products in their vendor portal.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="h-[40px] px-5 bg-[#53B175] text-white rounded-[12px] text-[13px] font-bold hover:bg-[#3d9e5f] transition-colors flex items-center gap-1.5"
                >
                    <UserPlus size={14} /> Create Distributor
                </button>
            </div>

            {/* Search existing vendors */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <h2 className="text-[15px] font-bold text-[#181725] flex items-center gap-2">
                    <Search size={16} className="text-[#53B175]" /> Find &amp; add vendors
                </h2>
                <div className="flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, email, or slug..."
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#53B175]/50"
                        />
                    </div>
                    <input
                        type="text"
                        value={searchCity}
                        onChange={(e) => setSearchCity(e.target.value)}
                        placeholder="City filter"
                        className="w-[140px] px-3 py-2.5 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-[#53B175]/50"
                    />
                </div>

                {searching ? (
                    <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-[#53B175]" /></div>
                ) : searchResults.length > 0 ? (
                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                        {searchResults.map((v) => (
                            <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                                        {v.logoUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={v.logoUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <Building2 size={16} className="text-gray-300" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-bold text-[#181725] truncate">{v.businessName}</p>
                                        <p className="text-[11px] text-gray-500 flex items-center gap-1">
                                            {v.city && <><MapPin size={10} /> {v.city} · </>}
                                            {v._count.products} products
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => addDistributor(v.id)}
                                    disabled={actingId === v.id}
                                    className="h-[32px] px-4 bg-[#53B175] text-white rounded-lg text-[12px] font-bold disabled:opacity-50 flex items-center gap-1"
                                >
                                    {actingId === v.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                    Add
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (searchQuery.trim() || searchCity.trim()) ? (
                    <p className="text-[13px] text-gray-400 text-center py-4">No vendors match — try creating a new distributor.</p>
                ) : null}
            </div>

            {/* Linked distributors */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <h2 className="text-[15px] font-bold text-[#181725]">
                    Your distributors ({approved.length})
                </h2>
                {loading ? (
                    <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-[#53B175]" /></div>
                ) : approved.length === 0 ? (
                    <p className="text-[13px] text-gray-400 py-4">No distributors yet. Search above or create one.</p>
                ) : (
                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                        {approved.map((d) => (
                            <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                                        {d.vendor.logoUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={d.vendor.logoUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <Building2 size={16} className="text-gray-300" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-bold text-[#181725] truncate">{d.vendor.businessName}</p>
                                        <p className="text-[11px] text-gray-500">
                                            {d.vendor.city ?? '—'} · {d.vendor._count?.products ?? 0} mapped products
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeDistributor(d.vendorId, d.vendor.businessName)}
                                    disabled={actingId === d.vendorId}
                                    className="h-[32px] px-3 bg-gray-50 text-gray-600 rounded-lg text-[12px] font-bold hover:bg-red-50 hover:text-red-600 disabled:opacity-50 flex items-center gap-1"
                                >
                                    {actingId === d.vendorId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showCreate && (
                <AddVendorWizard
                    createEndpoint="/api/v1/brand/distributors/create"
                    onClose={() => setShowCreate(false)}
                    onCreated={() => {
                        setShowCreate(false);
                        toast.success('Distributor created and linked');
                        fetchDistributors();
                    }}
                />
            )}
        </div>
    );
}
