'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
    Users, Plus, Loader2, Search, MapPin, Building2, UserPlus, Trash2, Check, X, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import DistributorMappedProductsModal from '@/components/features/brand/DistributorMappedProductsModal';

const AddVendorWizard = dynamic(
    () => import('@/components/features/admin/AddVendorWizard').then((m) => m.AddVendorWizard),
    { ssr: false },
);

type MappingPreview = {
    vendorId: string;
    vendorName: string;
    status: 'pending' | 'approved';
};

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

function VendorAvatar({ logoUrl }: { logoUrl: string | null }) {
    return (
        <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
            {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
                <Building2 size={16} className="text-gray-300" />
            )}
        </div>
    );
}

function mappedLabel(count: number) {
    return `${count} of your SKU${count === 1 ? '' : 's'} mapped`;
}

function MappedCountControl({
    count,
    onOpen,
}: {
    count: number;
    onOpen: () => void;
}) {
    const label = mappedLabel(count);
    if (count <= 0) {
        return <span>{label}</span>;
    }
    return (
        <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-0.5 text-primary font-semibold underline underline-offset-2 hover:text-primary-dark"
        >
            {label}
            <ChevronRight size={12} className="shrink-0" />
        </button>
    );
}

export default function BrandDistributorsPage() {
    const [distributors, setDistributors] = useState<AuthorizedDistributor[]>([]);
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [mappingPreview, setMappingPreview] = useState<MappingPreview | null>(null);

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

    const postAction = async (vendorId: string, action: 'add' | 'approve' | 'reject' | 'unapprove') => {
        const r = await fetch('/api/v1/brand/authorized-distributors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendorId, action }),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error?.message || 'Action failed');
        return j;
    };

    const addDistributor = async (vendorId: string) => {
        setActingId(vendorId);
        try {
            await postAction(vendorId, 'add');
            toast.success('Distributor added');
            setSearchResults((prev) => prev.filter((v) => v.id !== vendorId));
            fetchDistributors();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to add distributor');
        } finally {
            setActingId(null);
        }
    };

    const approveRequest = async (vendorId: string, name: string) => {
        setActingId(vendorId);
        try {
            await postAction(vendorId, 'approve');
            toast.success(`${name} approved as distributor`);
            setMappingPreview(null);
            fetchDistributors();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to approve');
        } finally {
            setActingId(null);
        }
    };

    const unlinkRequest = async (vendorId: string) => {
        setActingId(vendorId);
        try {
            await postAction(vendorId, 'reject');
            toast.success('Distributor unlinked');
            setMappingPreview(null);
            fetchDistributors();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to unlink');
        } finally {
            setActingId(null);
        }
    };

    const removeDistributor = async (vendorId: string) => {
        setActingId(vendorId);
        try {
            await postAction(vendorId, 'unapprove');
            toast.success('Moved to Requests');
            fetchDistributors();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to remove');
        } finally {
            setActingId(null);
        }
    };

    const approved = distributors.filter((d) => d.status === 'approved');
    const pending = distributors.filter((d) => d.status === 'pending');

    return (
        <div className="max-w-[1100px] mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-[26px] font-[900] text-[#181725] tracking-tight flex items-center gap-2">
                        <Users size={26} className="text-primary" /> Distributor Network
                    </h1>
                    <p className="text-[#7C7C7C] font-medium mt-0.5 text-[14px] max-w-2xl">
                        Search marketplace vendors and add them as your distributors, or onboard a new one.
                        Approved distributors appear in your public brand store; pending requests come from vendors who mapped your SKUs.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="h-[40px] px-5 bg-primary text-white rounded-[12px] text-[13px] font-bold hover:bg-primary-dark transition-colors flex items-center gap-1.5"
                >
                    <UserPlus size={14} /> Create Distributor
                </button>
            </div>

            {/* Search existing vendors */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <h2 className="text-[15px] font-bold text-[#181725] flex items-center gap-2">
                    <Search size={16} className="text-primary" /> Find &amp; add vendors
                </h2>
                <div className="flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, email, or slug..."
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-primary/50"
                        />
                    </div>
                    <input
                        type="text"
                        value={searchCity}
                        onChange={(e) => setSearchCity(e.target.value)}
                        placeholder="City filter"
                        className="w-[140px] px-3 py-2.5 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-primary/50"
                    />
                </div>

                {searching ? (
                    <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-primary" /></div>
                ) : searchResults.length > 0 ? (
                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                        {searchResults.map((v) => (
                            <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3 min-w-0">
                                    <VendorAvatar logoUrl={v.logoUrl} />
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
                                    className="h-[32px] px-4 bg-primary text-white rounded-lg text-[12px] font-bold disabled:opacity-50 flex items-center gap-1"
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

            {/* Approved (left) + Pending requests (right) */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-primary" /></div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Left — approved distributors (public brand store) */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 min-h-[240px]">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-[15px] font-bold text-[#181725]">
                                Your distributors
                            </h2>
                            <span className="text-[12px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                                {approved.length}
                            </span>
                        </div>
                        <p className="text-[12px] text-gray-400 -mt-2">
                            Shown in your public brand store.
                        </p>
                        {approved.length === 0 ? (
                            <p className="text-[13px] text-gray-400 py-6 text-center">
                                No distributors yet. Search above, create one, or approve a request.
                            </p>
                        ) : (
                            <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                                {approved.map((d) => {
                                    const mapped = d.vendor._count?.products ?? 0;
                                    return (
                                        <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <VendorAvatar logoUrl={d.vendor.logoUrl} />
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-bold text-[#181725] truncate">{d.vendor.businessName}</p>
                                                    <p className="text-[11px] text-gray-500 flex items-center gap-1 flex-wrap">
                                                        {d.vendor.city && (
                                                            <span className="inline-flex items-center gap-0.5">
                                                                <MapPin size={10} /> {d.vendor.city}
                                                            </span>
                                                        )}
                                                        {d.vendor.city && <span>·</span>}
                                                        <MappedCountControl
                                                            count={mapped}
                                                            onOpen={() => setMappingPreview({
                                                                vendorId: d.vendorId,
                                                                vendorName: d.vendor.businessName,
                                                                status: 'approved',
                                                            })}
                                                        />
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeDistributor(d.vendorId)}
                                                disabled={actingId === d.vendorId}
                                                className="h-[32px] px-3 bg-gray-50 text-gray-600 rounded-lg text-[12px] font-bold hover:bg-red-50 hover:text-red-600 disabled:opacity-50 flex items-center gap-1"
                                            >
                                                {actingId === d.vendorId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                Remove
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Right — pending requests from vendor mapping activity */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 min-h-[240px]">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-[15px] font-bold text-[#181725]">
                                Requests
                            </h2>
                            <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${
                                pending.length > 0
                                    ? 'text-amber-700 bg-amber-50'
                                    : 'text-gray-500 bg-gray-50'
                            }`}>
                                {pending.length}
                            </span>
                        </div>
                        <p className="text-[12px] text-gray-400 -mt-2">
                            Vendors who mapped your SKUs and are waiting for approval.
                        </p>
                        {pending.length === 0 ? (
                            <p className="text-[13px] text-gray-400 py-6 text-center">
                                No pending requests.
                            </p>
                        ) : (
                            <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                                {pending.map((d) => {
                                    const mapped = d.vendor._count?.products ?? 0;
                                    const busy = actingId === d.vendorId;
                                    return (
                                        <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <VendorAvatar logoUrl={d.vendor.logoUrl} />
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-bold text-[#181725] truncate">{d.vendor.businessName}</p>
                                                    <p className="text-[11px] text-gray-500 flex items-center gap-1 flex-wrap">
                                                        {d.vendor.city && (
                                                            <span className="inline-flex items-center gap-0.5">
                                                                <MapPin size={10} /> {d.vendor.city}
                                                            </span>
                                                        )}
                                                        {d.vendor.city && <span>·</span>}
                                                        <MappedCountControl
                                                            count={mapped}
                                                            onOpen={() => setMappingPreview({
                                                                vendorId: d.vendorId,
                                                                vendorName: d.vendor.businessName,
                                                                status: 'pending',
                                                            })}
                                                        />
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    onClick={() => approveRequest(d.vendorId, d.vendor.businessName)}
                                                    disabled={busy}
                                                    className="h-[32px] px-3 bg-primary text-white rounded-lg text-[12px] font-bold hover:bg-primary-dark disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => unlinkRequest(d.vendorId)}
                                                    disabled={busy}
                                                    className="h-[32px] px-3 bg-gray-50 text-gray-600 rounded-lg text-[12px] font-bold hover:bg-red-50 hover:text-red-600 disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <X size={12} />
                                                    Unlink
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

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

            {mappingPreview && (
                <DistributorMappedProductsModal
                    vendorId={mappingPreview.vendorId}
                    vendorName={mappingPreview.vendorName}
                    authStatus={mappingPreview.status}
                    onClose={() => setMappingPreview(null)}
                    onApprove={
                        mappingPreview.status === 'pending'
                            ? () => {
                                void approveRequest(mappingPreview.vendorId, mappingPreview.vendorName);
                            }
                            : undefined
                    }
                    onUnlink={
                        mappingPreview.status === 'pending'
                            ? () => {
                                void unlinkRequest(mappingPreview.vendorId);
                            }
                            : undefined
                    }
                    busy={actingId === mappingPreview.vendorId}
                />
            )}
        </div>
    );
}
