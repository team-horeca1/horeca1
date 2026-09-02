'use client';
import { CDL } from '@/lib/cdl';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
    BarChart3, Users, Package, MapPin, ShoppingCart,
    IndianRupee, TrendingUp, Loader2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Headline {
    masterProductCount: number;
    mappedDistributorProductCount: number;
    distributorCount: number;
    servicedPincodeCount: number;
    last30dOrders: number;
    last30dRevenue: number;
}

interface TopProduct {
    id: string;
    name: string;
    imageUrl: string | null;
    packSize: string | null;
    qty: number;
    revenue: number;
}

interface TopDistributor {
    id: string;
    name: string;
    logoUrl: string | null;
    orderCount: number;
    revenue: number;
}

interface MonthRow {
    month: string;
    orders: number;
    revenue: number;
}

interface Analytics {
    headline: Headline;
    topProducts: TopProduct[];
    topDistributors: TopDistributor[];
    monthlyTrend: MonthRow[];
    pincodes: string[];
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short' });
};

export default function BrandAnalyticsPage() {
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/v1/brand/analytics')
            .then(r => r.json())
            .then(j => {
                if (!j.success) throw new Error(j.error?.message ?? 'Failed to load');
                setData(j.data);
            })
            .catch(e => setError(e instanceof Error ? e.message : 'Network error'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 size={32} className="animate-spin text-primary" />
        </div>
    );

    if (error || !data) return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-2 text-center">
            <AlertCircle size={32} className="text-amber-500" />
            <p className="text-[14px] font-bold text-gray-700">{error ?? 'No analytics data'}</p>
        </div>
    );

    const maxRevenue = Math.max(...data.monthlyTrend.map(m => m.revenue), 1);

    const tiles = [
        { label: 'Distributors', value: data.headline.distributorCount, icon: Users, color: '#3B82F6', bg: '#EFF6FF' },
        { label: 'Pincode reach', value: data.headline.servicedPincodeCount, icon: MapPin, color: '#8B5CF6', bg: '#F3F0FF' },
        { label: 'Mapped distributor products', value: data.headline.mappedDistributorProductCount, icon: Package, color: '#F59E0B', bg: '#FFF7E6' },
        { label: 'Brand products', value: data.headline.masterProductCount, icon: BarChart3, color: CDL.primary, bg: CDL.primaryLight },
        { label: 'Orders (30d)', value: data.headline.last30dOrders, icon: ShoppingCart, color: '#EC4899', bg: '#FDF2F8' },
        { label: 'Revenue (30d)', value: inr(data.headline.last30dRevenue), icon: IndianRupee, color: '#10B981', bg: CDL.successLight },
    ];

    return (
        <div className="max-w-[1200px] mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h1 className="text-[26px] font-[900] text-[#181725] tracking-tight flex items-center gap-2">
                    <BarChart3 size={26} className="text-primary" /> Analytics
                </h1>
                <p className="text-[#7C7C7C] font-medium mt-0.5 text-[14px]">
                    Reach, distributor activity, and order trends — based on verified mappings only.
                </p>
            </div>

            {/* Headline tiles */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {tiles.map(t => (
                    <div key={t.label} className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.bg }}>
                                <t.icon size={14} style={{ color: t.color }} />
                            </div>
                        </div>
                        <p className="text-[20px] font-[900] text-[#181725] truncate">{t.value}</p>
                        <p className="text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wider mt-0.5">{t.label}</p>
                    </div>
                ))}
            </div>

            {/* Monthly trend (revenue bars) */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-[15px] font-bold text-[#181725] flex items-center gap-1.5">
                            <TrendingUp size={15} className="text-primary" />
                            Monthly trend (last 6 months)
                        </h2>
                        <p className="text-[12px] text-gray-500">Revenue from orders containing your brand-mapped products</p>
                    </div>
                </div>
                {data.monthlyTrend.every(m => m.revenue === 0) ? (
                    <div className="text-center py-10 text-[13px] text-gray-400">
                        No order activity yet — once distributors fulfil their first orders, this chart fills up.
                    </div>
                ) : (
                    <div className="flex items-end gap-3 h-[160px]">
                        {data.monthlyTrend.map(m => {
                            const heightPct = (m.revenue / maxRevenue) * 100;
                            return (
                                <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
                                    <div className="text-[10px] font-bold text-[#181725]">{inr(m.revenue)}</div>
                                    <div className="w-full bg-gray-50 rounded-t-lg flex-1 flex items-end overflow-hidden">
                                        <div
                                            className="w-full bg-gradient-to-t from-primary to-primary-dark rounded-t-lg transition-all"
                                            style={{ height: `${Math.max(heightPct, 2)}%` }}
                                        />
                                    </div>
                                    <div className="text-[11px] font-semibold text-gray-400">{monthLabel(m.month)}</div>
                                    <div className="text-[10px] text-gray-400">{m.orders} order{m.orders !== 1 ? 's' : ''}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Top products */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                        <h2 className="text-[15px] font-bold text-[#181725]">Top selling products</h2>
                        <p className="text-[12px] text-gray-500">By revenue (last 6 months)</p>
                    </div>
                    {data.topProducts.length === 0 ? (
                        <p className="text-center py-10 text-[13px] text-gray-400">No sales yet</p>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {data.topProducts.map((p, i) => (
                                <div key={p.id} className="p-4 flex items-center gap-3">
                                    <span className="text-[12px] font-black text-gray-300 w-5">#{i + 1}</span>
                                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-50 shrink-0 relative">
                                        {p.imageUrl ? (
                                            <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center"><Package size={14} className="text-gray-300" /></div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-bold text-[#181725] truncate">{p.name}</p>
                                        <p className="text-[10px] text-gray-400">{p.packSize ?? '—'} · {p.qty} units sold</p>
                                    </div>
                                    <p className="text-[13px] font-[900] text-primary shrink-0">{inr(p.revenue)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top distributors */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                        <h2 className="text-[15px] font-bold text-[#181725]">Top distributors</h2>
                        <p className="text-[12px] text-gray-500">By revenue contribution to your brand</p>
                    </div>
                    {data.topDistributors.length === 0 ? (
                        <p className="text-center py-10 text-[13px] text-gray-400">No distributors selling yet</p>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {data.topDistributors.map((d, i) => (
                                <div key={d.id} className="p-4 flex items-center gap-3">
                                    <span className="text-[12px] font-black text-gray-300 w-5">#{i + 1}</span>
                                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-50 shrink-0 relative">
                                        {d.logoUrl ? (
                                            <Image src={d.logoUrl} alt="" fill sizes="40px" className="object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center"><Users size={14} className="text-gray-300" /></div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-bold text-[#181725] truncate">{d.name}</p>
                                        <p className="text-[10px] text-gray-400">{d.orderCount} order{d.orderCount !== 1 ? 's' : ''}</p>
                                    </div>
                                    <p className="text-[13px] font-[900] text-primary shrink-0">{inr(d.revenue)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Pincode reach list */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                    <h2 className="text-[15px] font-bold text-[#181725] flex items-center gap-1.5">
                        <MapPin size={15} className="text-primary" /> Pincode reach
                    </h2>
                    <p className="text-[12px] text-gray-500">{data.pincodes.length} pincodes have at least one distributor selling your products</p>
                </div>
                {data.pincodes.length === 0 ? (
                    <p className="text-center py-10 text-[13px] text-gray-400">No pincode coverage yet</p>
                ) : (
                    <div className="p-4 flex flex-wrap gap-1.5">
                        {data.pincodes.map(p => (
                            <span key={p} className={cn(
                                "px-2.5 py-1 text-[11px] font-bold rounded-md border",
                                "bg-primary-light text-primary border-primary/20"
                            )}>
                                {p}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
