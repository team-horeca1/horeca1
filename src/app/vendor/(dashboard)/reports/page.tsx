'use client';
import { CDL } from '@/lib/cdl';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Loader2, TrendingUp, ShoppingBag, IndianRupee, Package,
    Users, AlertTriangle, Download, RefreshCw,
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '90d' | '6m';

interface RevenuePoint { key: string; label: string; revenue: number; orders: number; platformFees: number }
interface TopProduct { productId: string; name: string; qty: number; revenue: number }
interface TopCustomer { userId: string; fullName: string; businessName?: string | null; orderCount: number; totalSpend: number }
interface DeadStockItem { productId: string; name: string; qty: number }
interface RiskCustomer { name: string; businessName: string | null; creditUsed: number; daysOverdue: number }
interface AgingBuckets { current: number; '1-30': number; '31-60': number; '61-90': number; '90+': number }

interface SlowMoverItem { id: string; name: string; sku: string | null; basePrice: number; stock: number }
interface SalesByGroup { name: string; revenue: number; units: number }

interface ReportsData {
    period: string;
    totals: { revenue: number; orders: number; platformFees: number };
    revenueByPeriod: RevenuePoint[];
    topProducts: TopProduct[];
    statusBreakdown: Record<string, number>;
    customerAnalytics: {
        totalCustomers: number;
        repeatCustomers: number;
        dormantCount: number;
        aov: number;
        topCustomers: TopCustomer[];
    };
    inventoryAnalytics: {
        fillRate: number;
        lowStockCount: number;
        outOfStockCount: number;
        totalSkus: number;
        deadStock: DeadStockItem[];
    };
    creditAnalytics: {
        aging: AgingBuckets;
        totalOutstanding: number;
        collectionEfficiency: number;
        riskCustomers: RiskCustomer[];
    };
    slowMovers: SlowMoverItem[];
    categorySales: SalesByGroup[];
    brandSales: SalesByGroup[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `₹${n.toLocaleString('en-IN')}`; }

const STATUS_COLOR: Record<string, string> = {
    pending: '#F59E0B', confirmed: '#3B82F6', processing: '#8B5CF6',
    out_for_delivery: '#F97316', delivered: CDL.primary, cancelled: '#EF4444', shipped: '#06B6D4',
};

const PERIOD_LABELS: Record<Period, string> = {
    '7d': '7 Days', '30d': '30 Days', '90d': '90 Days', '6m': '6 Months',
};

// Client-side CSV export from topProducts data
function downloadCsv(data: ReportsData) {
    const periodLabel = PERIOD_LABELS[data.period as Period] ?? data.period;
    const rows = [
        [`HoReCa1 Vendor Report — ${periodLabel}`],
        [],
        ['Summary'],
        ['Metric', 'Value'],
        ['Revenue (₹)', String(data.totals.revenue)],
        ['Orders', String(data.totals.orders)],
        ['Platform fees (₹)', String(data.totals.platformFees ?? 0)],
        [],
        ['Top Products'],
        ['Product', 'Units Sold', 'Revenue (₹)'],
        ...data.topProducts.map(p => [p.name, String(p.qty), String(p.revenue)]),
        [],
        ['Status Breakdown'],
        ['Status', 'Count'],
        ...Object.entries(data.statusBreakdown).map(([s, c]) => [s, String(c)]),
        [],
        ['Top Customers'],
        ['Customer', 'Business', 'Orders', 'Spend (₹)'],
        ...data.customerAnalytics.topCustomers.map(c => [c.fullName, c.businessName ?? '', String(c.orderCount), String(c.totalSpend)]),
        [],
        ['Credit Aging'],
        ['Bucket', 'Outstanding (₹)'],
        ...Object.entries(data.creditAnalytics.aging).map(([k, v]) => [k, String(v)]),
        ['Total outstanding', String(data.creditAnalytics.totalOutstanding)],
        ['Collection efficiency (%)', String(data.creditAnalytics.collectionEfficiency)],
        [],
        ['Credit risk customers'],
        ['Name', 'Business', 'Credit used (₹)', 'Days overdue'],
        ...data.creditAnalytics.riskCustomers.map(r => [r.name, r.businessName ?? '', String(r.creditUsed), String(r.daysOverdue)]),
        [],
        ['Inventory'],
        ['Fill rate (%)', String(data.inventoryAnalytics.fillRate)],
        ['Low stock SKUs', String(data.inventoryAnalytics.lowStockCount)],
        ['Out of stock SKUs', String(data.inventoryAnalytics.outOfStockCount)],
        ['Total SKUs', String(data.inventoryAnalytics.totalSkus)],
        [],
        ['Dead stock'],
        ['Product', 'Qty on hand'],
        ...data.inventoryAnalytics.deadStock.map(d => [d.name, String(d.qty)]),
        [],
        ['Slow movers (no sales in period)'],
        ['Product', 'SKU', 'Stock', 'Base price (₹)'],
        ...data.slowMovers.map(s => [s.name, s.sku ?? '', String(s.stock), String(s.basePrice)]),
        [],
        ['Category sales'],
        ['Category', 'Revenue (₹)', 'Units'],
        ...data.categorySales.map(c => [c.name, String(c.revenue), String(c.units)]),
        [],
        ['Brand sales'],
        ['Brand', 'Revenue (₹)', 'Units'],
        ...data.brandSales.map(b => [b.name, String(b.revenue), String(b.units)]),
        [],
        ['Revenue by period'],
        ['Period', 'Revenue (₹)', 'Orders', 'Platform fees (₹)'],
        ...data.revenueByPeriod.map(r => [r.label, String(r.revenue), String(r.orders), String(r.platformFees ?? 0)]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `horeca1-report-${data.period}.csv`; a.click();
    URL.revokeObjectURL(url);
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function VendorReportsPage() {
    const [data, setData] = useState<ReportsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<Period>('6m');

    const fetchReports = useCallback(async (p: Period) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/vendor/reports?period=${p}`);
            const json = await res.json();
            if (json.success) setData(json.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchReports(period); }, [period, fetchReports]);

    return (
        <div className="space-y-5 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[24px] font-bold text-[#181725]">Reports</h1>
                    <p className="text-[12px] text-[#AEAEAE]">Sales, fees, and inventory for {PERIOD_LABELS[period]}</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Period tabs */}
                    <div className="flex items-center bg-[#F5F5F5] rounded-[10px] p-1 gap-0.5">
                        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={cn(
                                    'h-[30px] px-3 rounded-[8px] text-[12px] font-bold transition-all',
                                    period === p ? 'bg-white text-[#181725] shadow-sm' : 'text-[#7C7C7C] hover:text-[#181725]'
                                )}
                            >
                                {PERIOD_LABELS[p]}
                            </button>
                        ))}
                    </div>
                    {data && (
                        <button
                            onClick={() => downloadCsv(data)}
                            className="h-[38px] px-3 rounded-[10px] border border-[#EEEEEE] bg-white text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-all flex items-center gap-1.5"
                        >
                            <Download size={13} />
                            Export
                        </button>
                    )}
                    <button
                        onClick={() => fetchReports(period)}
                        disabled={loading}
                        className="h-[38px] w-[38px] rounded-[10px] border border-[#EEEEEE] bg-white flex items-center justify-center text-[#7C7C7C] hover:bg-[#F5F5F5] transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {loading && !data ? (
                <div className="flex justify-center items-center h-[40vh]">
                    <Loader2 size={28} className="animate-spin text-primary" />
                </div>
            ) : !data ? (
                <div className="flex justify-center items-center h-[40vh] text-[#AEAEAE] text-[13px]">
                    Failed to load reports
                </div>
            ) : (
                <div className={cn('space-y-5 transition-opacity', loading && 'opacity-50 pointer-events-none')}>
                    {/* ─── Summary cards ─── */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        {[
                            { label: `Revenue (${PERIOD_LABELS[period]})`, value: fmt(data.totals.revenue), icon: IndianRupee, color: CDL.primary },
                            { label: 'Orders', value: String(data.totals.orders), icon: ShoppingBag, color: '#3B82F6' },
                            { label: 'Platform fees', value: fmt(data.totals.platformFees ?? 0), icon: TrendingUp, color: '#F59E0B' },
                            { label: 'Delivered', value: String(data.statusBreakdown['delivered'] ?? 0), icon: Package, color: '#10B981' },
                            { label: 'Cancelled', value: String(data.statusBreakdown['cancelled'] ?? 0), icon: Package, color: '#EF4444' },
                        ].map((s, i) => (
                            <div key={i} className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">{s.label}</p>
                                    <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center"
                                        style={{ backgroundColor: `${s.color}18`, color: s.color }}>
                                        <s.icon size={16} />
                                    </div>
                                </div>
                                <p className="text-[22px] font-extrabold text-[#181725]">{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* ─── Revenue chart ─── */}
                    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                        <h2 className="text-[15px] font-bold text-[#181725] mb-5">Revenue Trend ({PERIOD_LABELS[period]})</h2>
                        {data.revenueByPeriod.length === 0 ? (
                            <p className="text-[13px] text-[#AEAEAE] text-center py-12">No data for this period</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={230}>
                                <AreaChart data={data.revenueByPeriod} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={CDL.primary} stopOpacity={0.18} />
                                            <stop offset="95%" stopColor={CDL.primary} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#AEAEAE' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#AEAEAE' }} axisLine={false} tickLine={false}
                                        tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']}
                                        contentStyle={{ borderRadius: 10, border: '1px solid #EEEEEE', fontSize: 12 }} />
                                    <Area type="monotone" dataKey="revenue" stroke={CDL.primary} strokeWidth={2.5}
                                        fill="url(#revGrad)" dot={{ fill: CDL.primary, r: 3 }} activeDot={{ r: 5 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* ─── Platform fees chart ─── */}
                    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                        <h2 className="text-[15px] font-bold text-[#181725] mb-1">Platform Fees Paid</h2>
                        <p className="text-[11px] text-[#AEAEAE] mb-5">Fees deducted from delivered orders in this period</p>
                        {data.revenueByPeriod.length === 0 ? (
                            <p className="text-[13px] text-[#AEAEAE] text-center py-12">No fee data for this period</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={data.revenueByPeriod} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#AEAEAE' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#AEAEAE' }} axisLine={false} tickLine={false}
                                        tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'Platform fees']}
                                        contentStyle={{ borderRadius: 10, border: '1px solid #EEEEEE', fontSize: 12 }} />
                                    <Bar dataKey="platformFees" fill="#F59E0B" radius={[5, 5, 0, 0]} maxBarSize={36} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* ─── Orders + Status breakdown ─── */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                            <h2 className="text-[15px] font-bold text-[#181725] mb-5">Orders per Period</h2>
                            {data.revenueByPeriod.length === 0 ? (
                                <p className="text-[13px] text-[#AEAEAE] text-center py-10">No data</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={data.revenueByPeriod} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#AEAEAE' }} axisLine={false} tickLine={false} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#AEAEAE' }} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #EEEEEE', fontSize: 12 }} />
                                        <Bar dataKey="orders" fill={CDL.primary} radius={[5, 5, 0, 0]} maxBarSize={36} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                            <h2 className="text-[15px] font-bold text-[#181725] mb-5">Order Status Breakdown</h2>
                            {Object.keys(data.statusBreakdown).length === 0 ? (
                                <p className="text-[13px] text-[#AEAEAE] text-center py-10">No orders yet</p>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(data.statusBreakdown)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([status, count]) => {
                                            const total = Object.values(data.statusBreakdown).reduce((a, b) => a + b, 0);
                                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                            const color = STATUS_COLOR[status] ?? '#AEAEAE';
                                            return (
                                                <div key={status}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[12px] font-bold text-[#181725] capitalize">{status.replace(/_/g, ' ')}</span>
                                                        <span className="text-[12px] font-bold" style={{ color }}>{count} ({pct}%)</span>
                                                    </div>
                                                    <div className="h-[5px] bg-[#F5F5F5] rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ─── Top products ─── */}
                    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                        <h2 className="text-[15px] font-bold text-[#181725] mb-5">Top Products by Revenue</h2>
                        {data.topProducts.length === 0 ? (
                            <p className="text-[13px] text-[#AEAEAE] text-center py-10">No sales yet</p>
                        ) : (
                            <div className="space-y-3">
                                {data.topProducts.map((p, i) => {
                                    const max = Math.max(...data.topProducts.map(x => x.revenue), 1);
                                    return (
                                        <div key={p.productId} className="flex items-center gap-4">
                                            <span className="text-[12px] font-bold text-[#AEAEAE] w-[18px] shrink-0">#{i + 1}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-[13px] font-bold text-[#181725] truncate">{p.name}</p>
                                                    <span className="text-[13px] font-bold text-primary ml-3 shrink-0">{fmt(p.revenue)}</span>
                                                </div>
                                                <div className="h-[5px] bg-[#F5F5F5] rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((p.revenue / max) * 100)}%` }} />
                                                </div>
                                                <p className="text-[11px] text-[#AEAEAE] mt-0.5">{p.qty} units sold</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ─── Customer analytics ─── */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                            <h2 className="text-[15px] font-bold text-[#181725] mb-4">Customer Analytics</h2>
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                {[
                                    { label: 'Unique Customers', value: data.customerAnalytics.totalCustomers, icon: Users, color: '#3B82F6' },
                                    { label: 'Repeat Customers', value: data.customerAnalytics.repeatCustomers, icon: TrendingUp, color: CDL.primary },
                                    { label: 'Avg Order Value', value: fmt(data.customerAnalytics.aov), icon: IndianRupee, color: '#8B5CF6' },
                                    { label: 'Dormant', value: data.customerAnalytics.dormantCount, icon: AlertTriangle, color: '#F59E0B' },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-[#FAFAFA] rounded-[10px] p-4">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <stat.icon size={13} style={{ color: stat.color }} />
                                            <p className="text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wide">{stat.label}</p>
                                        </div>
                                        <p className="text-[18px] font-extrabold text-[#181725]">{stat.value}</p>
                                    </div>
                                ))}
                            </div>
                            {data.customerAnalytics.topCustomers.length > 0 && (
                                <>
                                    <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide mb-3">Top Customers</p>
                                    <div className="space-y-2">
                                        {data.customerAnalytics.topCustomers.slice(0, 5).map((c, i) => (
                                            <div key={c.userId} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-bold text-[#AEAEAE] w-[16px]">#{i + 1}</span>
                                                    <div>
                                                        <p className="text-[12px] font-bold text-[#181725] leading-tight">{c.fullName}</p>
                                                        {c.businessName && <p className="text-[10px] text-[#AEAEAE]">{c.businessName}</p>}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[12px] font-bold text-primary">{fmt(c.totalSpend)}</p>
                                                    <p className="text-[10px] text-[#AEAEAE]">{c.orderCount} orders</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ─── Inventory analytics ─── */}
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                            <h2 className="text-[15px] font-bold text-[#181725] mb-4">Inventory Health</h2>
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                {[
                                    { label: 'Fill Rate', value: `${data.inventoryAnalytics.fillRate}%`, color: data.inventoryAnalytics.fillRate >= 90 ? CDL.primary : '#F59E0B' },
                                    { label: 'Total SKUs', value: String(data.inventoryAnalytics.totalSkus), color: '#181725' },
                                    { label: 'Low Stock', value: String(data.inventoryAnalytics.lowStockCount), color: '#F59E0B' },
                                    { label: 'Out of Stock', value: String(data.inventoryAnalytics.outOfStockCount), color: '#E74C3C' },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-[#FAFAFA] rounded-[10px] p-4">
                                        <p className="text-[10px] font-bold text-[#AEAEAE] uppercase tracking-wide mb-1.5">{stat.label}</p>
                                        <p className="text-[18px] font-extrabold" style={{ color: stat.color }}>{stat.value}</p>
                                    </div>
                                ))}
                            </div>
                            {data.inventoryAnalytics.deadStock.length > 0 ? (
                                <>
                                    <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide mb-3">
                                        Dead Stock — no orders in period
                                    </p>
                                    <div className="space-y-2">
                                        {data.inventoryAnalytics.deadStock.map(item => (
                                            <div key={item.productId} className="flex items-center justify-between">
                                                <p className="text-[12px] font-bold text-[#181725] truncate flex-1 mr-4">{item.name}</p>
                                                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-[6px] shrink-0">
                                                    {item.qty} in stock
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="text-[12px] text-[#AEAEAE] text-center py-4">All stocked SKUs had orders this period</p>
                            )}
                        </div>
                    </div>

                    {/* ─── Credit analytics ─── */}
                    <div className="space-y-5">
                        <div>
                            <h2 className="text-[17px] font-bold text-[#181725]">Credit Analytics</h2>
                            <p className="text-[12px] text-[#AEAEAE]">DiSCCO credit outstanding and collection health</p>
                        </div>

                        {/* Stat cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Total Outstanding</p>
                                    <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center bg-[#EF444418] text-[#EF4444]">
                                        <IndianRupee size={16} />
                                    </div>
                                </div>
                                <p className="text-[22px] font-extrabold text-[#181725]">{fmt(data.creditAnalytics.totalOutstanding)}</p>
                            </div>
                            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wide">Collection Efficiency</p>
                                    <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center"
                                        style={{ backgroundColor: `${data.creditAnalytics.collectionEfficiency >= 80 ? CDL.primary : '#F59E0B'}18`, color: data.creditAnalytics.collectionEfficiency >= 80 ? CDL.primary : '#F59E0B' }}>
                                        <TrendingUp size={16} />
                                    </div>
                                </div>
                                <p className="text-[22px] font-extrabold text-[#181725]">{data.creditAnalytics.collectionEfficiency}%</p>
                            </div>
                        </div>

                        {/* Aging bucket bar chart */}
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                            <h3 className="text-[15px] font-bold text-[#181725] mb-5">Receivables Aging</h3>
                            {data.creditAnalytics.totalOutstanding === 0 ? (
                                <p className="text-[13px] text-[#AEAEAE] text-center py-10">No outstanding credit</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart
                                        data={[
                                            { bucket: 'Current',  amount: data.creditAnalytics.aging.current,   fill: CDL.primary },
                                            { bucket: '1-30d',    amount: data.creditAnalytics.aging['1-30'],   fill: '#F59E0B' },
                                            { bucket: '31-60d',   amount: data.creditAnalytics.aging['31-60'],  fill: '#F97316' },
                                            { bucket: '61-90d',   amount: data.creditAnalytics.aging['61-90'],  fill: '#EF4444' },
                                            { bucket: '90d+',     amount: data.creditAnalytics.aging['90+'],    fill: '#991B1B' },
                                        ]}
                                        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" vertical={false} />
                                        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#AEAEAE' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#AEAEAE' }} axisLine={false} tickLine={false}
                                            tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                        <Tooltip
                                            formatter={(v) => [fmt(Number(v ?? 0)), 'Outstanding']}
                                            contentStyle={{ borderRadius: 10, border: '1px solid #EEEEEE', fontSize: 12 }}
                                        />
                                        <Bar dataKey="amount" radius={[5, 5, 0, 0]} maxBarSize={48}>
                                            {([CDL.primary, '#F59E0B', '#F97316', '#EF4444', '#991B1B'] as const).map((color, index) => (
                                                <Cell key={index} fill={color} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* High-risk customers table */}
                        {data.creditAnalytics.riskCustomers.length > 0 && (
                            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <AlertTriangle size={15} className="text-[#EF4444]" />
                                    <h3 className="text-[15px] font-bold text-[#181725]">High-Risk Customers</h3>
                                    <span className="ml-auto text-[11px] font-bold text-[#EF4444] bg-red-50 px-2.5 py-1 rounded-[6px]">
                                        {data.creditAnalytics.riskCustomers.length} overdue 90d+
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[12px]">
                                        <thead>
                                            <tr className="border-b border-[#EEEEEE]">
                                                <th className="text-left font-bold text-[#AEAEAE] uppercase tracking-wide pb-2 pr-4">Customer</th>
                                                <th className="text-right font-bold text-[#AEAEAE] uppercase tracking-wide pb-2 pr-4">Outstanding</th>
                                                <th className="text-right font-bold text-[#AEAEAE] uppercase tracking-wide pb-2">Days Overdue</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#EEEEEE]">
                                            {data.creditAnalytics.riskCustomers.map((c, i) => (
                                                <tr key={i}>
                                                    <td className="py-2.5 pr-4">
                                                        <p className="font-bold text-[#181725] leading-tight">{c.name}</p>
                                                        {c.businessName && <p className="text-[#AEAEAE] text-[10px]">{c.businessName}</p>}
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-right font-bold text-[#EF4444]">{fmt(c.creditUsed)}</td>
                                                    <td className="py-2.5 text-right">
                                                        <span className="font-bold text-[#EF4444] bg-red-50 px-2 py-0.5 rounded-[5px]">
                                                            {c.daysOverdue}d
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ─── Category & Brand Sales ──────────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Category Sales */}
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
                            <p className="text-[14px] font-bold text-[#181725] mb-4">Sales by Category (30d)</p>
                            {data.categorySales.length === 0 ? (
                                <p className="text-[13px] text-[#AEAEAE] text-center py-4">No sales data yet</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {data.categorySales.map((c) => {
                                        const maxRevenue = data.categorySales[0]?.revenue || 1;
                                        return (
                                            <div key={c.name}>
                                                <div className="flex justify-between text-[12px] mb-1">
                                                    <span className="font-medium text-[#181725] truncate">{c.name}</span>
                                                    <span className="text-[#7C7C7C] ml-2 shrink-0">₹{c.revenue.toFixed(0)}</span>
                                                </div>
                                                <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(c.revenue / maxRevenue) * 100}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Brand Sales */}
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
                            <p className="text-[14px] font-bold text-[#181725] mb-4">Sales by Brand (30d)</p>
                            {data.brandSales.length === 0 ? (
                                <p className="text-[13px] text-[#AEAEAE] text-center py-4">No brand sales data yet</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {data.brandSales.map((b) => {
                                        const maxRevenue = data.brandSales[0]?.revenue || 1;
                                        return (
                                            <div key={b.name}>
                                                <div className="flex justify-between text-[12px] mb-1">
                                                    <span className="font-medium text-[#181725] truncate">{b.name}</span>
                                                    <span className="text-[#7C7C7C] ml-2 shrink-0">₹{b.revenue.toFixed(0)}</span>
                                                </div>
                                                <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                                                    <div className="h-full bg-[#3B82F6] rounded-full transition-all" style={{ width: `${(b.revenue / maxRevenue) * 100}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ─── Slow Movers ─────────────────────────────────────────────── */}
                    {data.slowMovers.length > 0 && (
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[14px] font-bold text-[#181725]">Slow Movers (0 sales in 30d)</p>
                                <span className="text-[12px] text-[#AEAEAE]">{data.slowMovers.length} products</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-[#F5F5F5]">
                                            <th className="text-left pb-2 text-[12px] font-bold text-[#AEAEAE]">Product</th>
                                            <th className="text-right pb-2 text-[12px] font-bold text-[#AEAEAE]">Price</th>
                                            <th className="text-right pb-2 text-[12px] font-bold text-[#AEAEAE]">Stock</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.slowMovers.map(p => (
                                            <tr key={p.id} className="border-b border-[#F5F5F5] last:border-0">
                                                <td className="py-2.5">
                                                    <p className="text-[13px] font-medium text-[#181725] truncate max-w-[200px]">{p.name}</p>
                                                    {p.sku && <p className="text-[11px] text-[#AEAEAE]">{p.sku}</p>}
                                                </td>
                                                <td className="py-2.5 text-right text-[13px] text-[#181725]">₹{p.basePrice.toFixed(2)}</td>
                                                <td className="py-2.5 text-right">
                                                    <span className={cn(
                                                        'text-[12px] font-bold px-2 py-0.5 rounded-full',
                                                        p.stock === 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
                                                    )}>
                                                        {p.stock === 0 ? 'Out of Stock' : p.stock}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
