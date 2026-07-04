'use client';

import React, { useState, useEffect } from 'react';
import {
    Wallet,
    TrendingUp,
    Coins,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Clock,
    CreditCard,
    Building2,
    Calendar,
    Download,
    CheckCircle,
    Archive,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

function formatINR(val: number): string {
    return '₹ ' + val.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

interface FinanceData {
    stats: {
        totalRevenue: number;
        thisMonthRevenue: number;
        monthTrend: string;
        commission: number;
    };
    monthlyData: { name: string; total: number }[];
    recentPayments: {
        id: string;
        vendor: string;
        vendorId: string;
        amount: number;
        status: string;
        method: string;
        date: string;
    }[];
}

export default function FinancePage() {
    const [data, setData] = useState<FinanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isMounted, setIsMounted] = useState(false);
    const [activePayoutTab, setActivePayoutTab] = useState<'pending' | 'completed'>('pending');

    useEffect(() => {
        Promise.resolve().then(() => setIsMounted(true));
        fetch('/api/v1/admin/finance')
            .then(res => res.json())
            .then(json => { if (json.success) setData(json.data); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);



    const payments = data?.recentPayments || [];
    const filteredPayments = payments.filter(p => {
        const matchesTab = activePayoutTab === 'completed'
            ? p.status === 'captured' || p.status === 'settled'
            : p.status !== 'captured' && p.status !== 'settled';
        return matchesTab && p.vendor.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const pendingCount = payments.filter(p => p.status !== 'captured' && p.status !== 'settled').length;
    const completedCount = payments.filter(p => p.status === 'captured' || p.status === 'settled').length;

    const trendPositive = parseFloat(data?.stats.monthTrend || '0') >= 0;

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500 pb-12 text-[#181725]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[28px] font-[900] tracking-tight">Finance Management</h1>
                    <p className="text-[#7C7C7C] font-medium mt-1">Monitor revenue, platform earnings, and vendor payments</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="h-[44px] px-6 bg-white border border-[#EEEEEE] rounded-[12px] text-[14px] font-bold hover:bg-gray-50 transition-all flex items-center gap-2">
                        <Calendar size={18} />
                        Select Date
                    </button>
                    <button className="h-[44px] px-6 bg-[#299E60] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#238a54] transition-all flex items-center gap-2 shadow-sm shadow-[#299E60]/20">
                        <Download size={18} />
                        Export Ledger
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-[#299E60]" size={32} />
                </div>
            ) : (
            <>
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    {
                        label: 'Total Revenue',
                        value: formatINR(data?.stats.totalRevenue || 0),
                        trend: `${trendPositive ? '+' : ''}${data?.stats.monthTrend || '0'}% this month`,
                        isPositive: trendPositive,
                        icon: Wallet,
                        color: '#299E60',
                        bgColor: '#EEF8F1',
                    },
                    {
                        label: 'This Month Revenue',
                        value: formatINR(data?.stats.thisMonthRevenue || 0),
                        trend: `${trendPositive ? '+' : ''}${data?.stats.monthTrend || '0'}% vs last month`,
                        isPositive: trendPositive,
                        icon: TrendingUp,
                        color: '#3B82F6',
                        bgColor: '#EFF6FF',
                    },
                    {
                        label: 'Platform Commission (5%)',
                        value: formatINR(data?.stats.commission || 0),
                        trend: 'on total revenue',
                        isPositive: true,
                        icon: Coins,
                        color: '#F59E0B',
                        bgColor: '#FFF7E6',
                    },
                ].map((stat, idx) => (
                    <div
                        key={idx}
                        className="bg-white p-6 rounded-[24px] border border-[#EEEEEE] shadow-sm flex items-center gap-6"
                    >
                        <div
                            className="w-[68px] h-[68px] rounded-[20px] flex items-center justify-center shrink-0"
                            style={{ backgroundColor: stat.bgColor, color: stat.color }}
                        >
                            <stat.icon size={34} strokeWidth={2.5} />
                        </div>
                        <div className="flex-1">
                            <p className="text-[13px] font-bold text-[#AEAEAE] mb-1 uppercase tracking-wider">{stat.label}</p>
                            <div className="flex items-end justify-between">
                                <h3 className="text-[24px] font-[900] text-[#181725] leading-none">{stat.value}</h3>
                                <div className={cn(
                                    "flex items-center gap-0.5 text-[12px] font-extrabold px-2 py-1 rounded-full",
                                    stat.isPositive ? "bg-[#EEF8F1] text-[#299E60]" : "bg-[#FFF2F0] text-[#E74C3C]"
                                )}>
                                    {stat.isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                    {stat.trend}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Revenue Chart */}
            <div className="bg-white p-8 rounded-[32px] border border-[#EEEEEE] shadow-sm">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-[20px] font-[900] text-[#181725]">Monthly Revenue</h2>
                        <p className="text-[14px] text-[#AEAEAE] font-medium">Past 8 months of confirmed order revenue</p>
                    </div>
                </div>

                <div className="h-[360px] w-full mt-4">
                    {(!data?.monthlyData || data.monthlyData.length === 0) ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <TrendingUp size={40} className="mb-3 opacity-30" />
                            <p className="text-[14px] font-medium">No revenue data yet</p>
                        </div>
                    ) : isMounted && (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#299E60" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#299E60" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#AEAEAE', fontSize: 13, fontWeight: 600 }}
                                    dy={15}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#AEAEAE', fontSize: 13, fontWeight: 600 }}
                                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                                />
                                <Tooltip
                                    formatter={(val) => [formatINR(Number(val)), 'Revenue']}
                                    contentStyle={{
                                        borderRadius: '16px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                        padding: '12px 16px'
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="total"
                                    stroke="#299E60"
                                    strokeWidth={4}
                                    fillOpacity={1}
                                    fill="url(#colorTotal)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Payment Records */}
            <div className="bg-white rounded-[28px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-8 border-b border-[#EEEEEE]">
                    <div className="flex flex-col gap-8">
                        {/* Tab Switcher */}
                        <div className="flex items-center gap-2 bg-[#F8F9FB] p-1.5 rounded-[16px] w-fit">
                            <button
                                onClick={() => setActivePayoutTab('pending')}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-2.5 rounded-[12px] text-[14px] font-bold transition-all",
                                    activePayoutTab === 'pending'
                                        ? "bg-white text-[#181725] shadow-sm"
                                        : "text-[#AEAEAE] hover:text-[#7C7C7C]"
                                )}
                            >
                                <Clock size={18} strokeWidth={2.5} />
                                Pending
                                <span className={cn(
                                    "px-2 py-0.5 rounded-[6px] text-[11px] font-[900]",
                                    activePayoutTab === 'pending' ? "bg-[#299E60] text-white" : "bg-[#EEEEEE] text-[#AEAEAE]"
                                )}>{pendingCount}</span>
                            </button>
                            <button
                                onClick={() => setActivePayoutTab('completed')}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-2.5 rounded-[12px] text-[14px] font-bold transition-all",
                                    activePayoutTab === 'completed'
                                        ? "bg-white text-[#181725] shadow-sm"
                                        : "text-[#AEAEAE] hover:text-[#7C7C7C]"
                                )}
                            >
                                <Archive size={18} strokeWidth={2.5} />
                                Completed
                                <span className={cn(
                                    "px-2 py-0.5 rounded-[6px] text-[11px] font-[900]",
                                    activePayoutTab === 'completed' ? "bg-[#299E60] text-white" : "bg-[#EEEEEE] text-[#AEAEAE]"
                                )}>{completedCount}</span>
                            </button>
                        </div>

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-3">
                                <div className="w-[48px] h-[48px] bg-[#EEF8F1] rounded-[14px] flex items-center justify-center text-[#299E60]">
                                    {activePayoutTab === 'pending' ? <CreditCard size={24} /> : <CheckCircle size={24} />}
                                </div>
                                <div>
                                    <h2 className="text-[20px] font-[900] text-[#181725]">
                                        {activePayoutTab === 'pending' ? 'Pending Payments' : 'Completed Payments'}
                                    </h2>
                                    <p className="text-[14px] text-[#AEAEAE] font-medium">
                                        Payment records from Razorpay and other methods
                                    </p>
                                </div>
                            </div>

                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search vendor..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-[260px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[14px] py-2.5 pl-11 pr-4 text-[14px] outline-none transition-all placeholder:text-[#AEAEAE] font-medium focus:border-[#299E60]/40 focus:bg-white"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[300px]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#F8F9FB]">
                                <th className="px-8 py-5 text-[13px] font-bold text-[#7C7C7C] uppercase tracking-wider">Vendor</th>
                                <th className="px-6 py-5 text-[13px] font-bold text-[#7C7C7C] uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-5 text-[13px] font-bold text-[#7C7C7C] uppercase tracking-wider">Method</th>
                                <th className="px-6 py-5 text-[13px] font-bold text-[#7C7C7C] uppercase tracking-wider">Date</th>
                                <th className="px-6 py-5 text-[13px] font-bold text-[#7C7C7C] uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EEEEEE]">
                            {filteredPayments.length > 0 ? filteredPayments.map((p) => (
                                <tr key={p.id} className="hover:bg-[#F8F9FB] transition-colors">
                                    <td className="px-8 py-5">
                                        <Link href={`/admin/vendors/${p.vendorId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                                            <div className="w-9 h-9 rounded-[10px] bg-[#EEF8F1] flex items-center justify-center shrink-0">
                                                <Building2 size={16} className="text-[#299E60]" />
                                            </div>
                                            <span className="text-[15px] font-extrabold text-[#181725]">{p.vendor}</span>
                                        </Link>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-[16px] font-[900] text-[#181725]">{formatINR(p.amount)}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-[14px] font-medium text-[#7C7C7C] capitalize">{p.method}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-[13px] text-[#AEAEAE] font-bold">
                                            {new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-[900] uppercase tracking-wider border capitalize",
                                            p.status === 'captured' || p.status === 'settled'
                                                ? "bg-[#EEF8F1] text-[#299E60] border-[#299E60]/10"
                                                : p.status === 'created'
                                                ? "bg-[#FFF7E6] text-[#F59E0B] border-[#F59E0B]/10"
                                                : "bg-[#EFF6FF] text-[#3B82F6] border-[#3B82F6]/10"
                                        )}>
                                            <span className={cn(
                                                "w-1.5 h-1.5 rounded-full",
                                                p.status === 'captured' || p.status === 'settled' ? "bg-[#299E60]" :
                                                p.status === 'created' ? "bg-[#F59E0B] animate-pulse" : "bg-[#3B82F6]"
                                            )} />
                                            {p.status}
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-16 h-16 bg-[#F8F9FB] rounded-full flex items-center justify-center text-[#AEAEAE]">
                                                {activePayoutTab === 'pending' ? <CreditCard size={32} /> : <Archive size={32} />}
                                            </div>
                                            <p className="text-[#AEAEAE] font-bold uppercase tracking-widest text-[12px]">
                                                No {activePayoutTab} payments found
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <VendorSettlementsPanel />

            </>
            )}


        </div>
    );
}

interface SettlementRow {
    id: string;
    vendorName: string;
    netAmount: number;
    status: string;
    bankReference: string | null;
    periodStart: string;
    periodEnd: string;
    orderCount: number;
}

function VendorSettlementsPanel() {
    const [settlements, setSettlements] = useState<SettlementRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        fetch('/api/v1/admin/settlements?status=pending')
            .then((r) => r.json())
            .then((j) => { if (j.success) setSettlements(j.data.settlements); })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const markTransferred = async (id: string) => {
        const ref = prompt('Bank reference / UTR:');
        if (!ref) return;
        const res = await fetch(`/api/v1/admin/settlements/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'settled', bankReference: ref }),
        });
        const json = await res.json();
        if (json.success) load();
    };

    return (
        <div className="bg-white rounded-[24px] border border-[#EEEEEE] shadow-sm overflow-hidden mt-8">
            <div className="px-8 py-6 border-b border-[#EEEEEE] flex items-center justify-between">
                <div>
                    <h2 className="text-[20px] font-[900] text-[#181725]">Vendor Settlement Batches</h2>
                    <p className="text-[13px] text-[#7C7C7C] mt-1">Pending payouts to vendor bank accounts</p>
                </div>
            </div>
            {loading ? (
                <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-[#299E60]" /></div>
            ) : settlements.length === 0 ? (
                <p className="p-8 text-center text-[#AEAEAE] text-sm font-bold">No pending settlement batches</p>
            ) : (
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-[#F8F9FB]">
                            <th className="px-8 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Vendor</th>
                            <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Period</th>
                            <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Net</th>
                            <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Orders</th>
                            <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEEEEE]">
                        {settlements.map((s) => (
                            <tr key={s.id}>
                                <td className="px-8 py-4 font-bold text-[#181725]">{s.vendorName}</td>
                                <td className="px-6 py-4 text-sm text-[#7C7C7C]">
                                    {new Date(s.periodStart).toLocaleDateString('en-IN')} – {new Date(s.periodEnd).toLocaleDateString('en-IN')}
                                </td>
                                <td className="px-6 py-4 font-[900]">{formatINR(s.netAmount)}</td>
                                <td className="px-6 py-4">{s.orderCount}</td>
                                <td className="px-6 py-4">
                                    <button
                                        type="button"
                                        onClick={() => markTransferred(s.id)}
                                        className="px-4 py-2 bg-[#299E60] text-white text-xs font-bold rounded-lg hover:bg-[#238c54]"
                                    >
                                        Mark Transferred
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
