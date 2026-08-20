'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
    ShoppingCart,
    Users,
    Store,
    Wallet,
    ChevronRight,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AdminDashboardCharts = dynamic(
  () => import('@/components/features/admin/AdminDashboardCharts'),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[411px]">
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] animate-pulse" />
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] animate-pulse" />
      </div>
    ),
  },
);

// Format Indian currency: 115000 → "₹ 1,15,000"
function formatINR(val: number): string {
    return '₹ ' + val.toLocaleString('en-IN');
}


interface DashboardData {
    stats: {
        totalUsers: number;
        totalVendors: number;
        totalOrders: number;
        totalRevenue: number;
        newUsersThisMonth: number;
    };
    ordersByStatus: Record<string, number>;
    monthlyData: { month: string; orders: number; revenue: number }[];
    recentOrders: {
        id: string;
        orderNumber: string;
        status: string;
        totalAmount: number;
        paymentStatus: string;
        createdAt: string;
        vendor: { id: string; businessName: string };
        user: { id: string; fullName: string; email: string };
    }[];
}

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/v1/admin/dashboard')
            .then(res => res.json())
            .then(json => { if (json.success) setData(json.data); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const statCards = data ? [
        { label: 'Total Orders', value: data.stats.totalOrders.toLocaleString('en-IN'), icon: ShoppingCart, color: 'bg-blue-50 text-blue-600', trend: `+${data.stats.newUsersThisMonth} this month`, trendType: 'up' as const },
        { label: 'Total Customers', value: data.stats.totalUsers.toLocaleString('en-IN'), icon: Users, color: 'bg-yellow-50 text-yellow-600', trend: `+${data.stats.newUsersThisMonth}`, trendType: 'up' as const },
        { label: 'Total Vendors', value: data.stats.totalVendors.toLocaleString('en-IN'), icon: Store, color: 'bg-pink-50 text-pink-600', trend: '', trendType: 'up' as const },
        { label: 'Total Revenue', value: formatINR(Number(data.stats.totalRevenue)), icon: Wallet, color: 'bg-green-50 text-green-600', trend: '', trendType: 'up' as const },
    ] : [];

    return (
        <div className="space-y-8 pb-10">
            {/* Page Header */}
            <div>
                <h1 className="text-[26px] font-medium text-[#000000]">Dashboard</h1>
                <p className="text-[#000000] text-[12px] font-light">Whole data about your business here</p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-[#299E60]" size={32} />
                </div>
            ) : (
            <>
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-[14px] border border-[#EEEEEE] shadow-sm hover:shadow-md transition-all h-[145px] flex flex-col justify-between cursor-default">
                        <div className="flex items-center gap-3">
                            <div className={cn("w-11 h-11 rounded-lg flex items-center justify-center shrink-0", stat.color)}>
                                <stat.icon size={22} />
                            </div>
                            <span className="text-[15px] font-bold text-[#4B4B4B]">{stat.label}</span>
                        </div>

                        <div className="flex items-center justify-between">
                            <h4 className="text-[28px] font-[800] text-[#181725] leading-none">{stat.value}</h4>
                            {stat.trend && (
                            <div className={cn(
                                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold",
                                stat.trendType === 'up' ? "bg-[#EEF8F1] text-[#299E60]" : "bg-[#FFF0F0] text-[#E74C3C]"
                            )}>
                                {stat.trend}
                            </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Section — recharts loaded in a deferred chunk */}
            <AdminDashboardCharts monthlyData={data?.monthlyData ?? []} />

            {/* Order Status Breakdown & Recent Vendors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Order Status Breakdown */}
                <div className="bg-white p-6 rounded-[14px] border border-[#EEEEEE] shadow-sm h-fit">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-[18px] font-bold text-[#000000]">Orders by Status</h3>
                        <Link href="/admin/orders" className="text-[#299E60] text-[12px] font-bold hover:underline">See All</Link>
                    </div>
                    {Object.keys(data?.ordersByStatus || {}).length === 0 ? (
                        <div className="py-10 text-center text-gray-400 text-[14px]">No orders yet</div>
                    ) : (
                    <div className="space-y-3">
                        {Object.entries(data?.ordersByStatus || {}).map(([status, count]) => {
                            const total = Object.values(data?.ordersByStatus || {}).reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                            const colorMap: Record<string, string> = {
                                pending: 'bg-yellow-400',
                                confirmed: 'bg-blue-400',
                                processing: 'bg-purple-400',
                                out_for_delivery: 'bg-orange-400',
                                delivered: 'bg-[#299E60]',
                                cancelled: 'bg-red-400',
                            };
                            return (
                                <div key={status} className="flex items-center gap-3">
                                    <span className="text-[13px] font-medium text-[#7C7C7C] w-[140px] capitalize shrink-0">{status.replace(/_/g, ' ')}</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div className={`h-full rounded-full ${colorMap[status] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[13px] font-bold text-[#181725] w-[40px] text-right shrink-0">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                    )}
                </div>

                {/* Active Vendors from recent orders */}
                <div className="bg-white p-6 rounded-[14px] border border-[#EEEEEE] shadow-sm h-fit">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-[18px] font-bold text-[#000000]">Active Vendors</h3>
                        <Link href="/admin/vendors" className="text-[#299E60] text-[12px] font-bold hover:underline">See All</Link>
                    </div>
                    {(!data?.recentOrders || data.recentOrders.length === 0) ? (
                        <div className="py-10 text-center text-gray-400 text-[14px]">No vendor activity yet</div>
                    ) : (
                    <div className="space-y-3">
                        {Array.from(new Map(data.recentOrders.map(o => [o.vendor.id, o.vendor])).values()).slice(0, 6).map((vendor) => (
                            <div key={vendor.id} className="flex items-center justify-between px-4 h-[56px] border border-[#EEEEEE] rounded-[10px] hover:shadow-sm transition-all bg-white">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-[#53B175]/10 flex items-center justify-center shrink-0">
                                        <Store size={16} className="text-[#299E60]" />
                                    </div>
                                    <p className="text-[14px] font-bold text-[#181725]">{vendor.businessName}</p>
                                </div>
                                <Link href={`/admin/vendors/${vendor.id}`} className="text-[12px] font-bold text-[#299E60] hover:underline">
                                    View
                                </Link>
                            </div>
                        ))}
                    </div>
                    )}
                </div>
            </div>

            {/* Recent Activity Table */}
            <div className="bg-white p-10 rounded-[10px] border border-[#DCDCDC] shadow-sm max-w-[1360px]">
                <h3 className="text-[18px] font-bold text-[#000000] mb-8">Recent Activity</h3>
                <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-[#EFEFEF] h-[47px]">
                                <th className="px-6 text-center text-[13px] font-bold text-[#4B4B4B] first:rounded-l-[10px]">Order ID</th>
                                <th className="px-6 text-center text-[13px] font-bold text-[#4B4B4B]">Customer</th>
                                <th className="px-6 text-center text-[13px] font-bold text-[#4B4B4B]">Vendor</th>
                                <th className="px-6 text-center text-[13px] font-bold text-[#4B4B4B]">Status</th>
                                <th className="px-6 text-center text-[13px] font-bold text-[#4B4B4B]">Date</th>
                                <th className="px-6 text-center text-[13px] font-bold text-[#4B4B4B] last:rounded-r-[10px]">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EEEEEE]">
                            {(data?.recentOrders || []).length === 0 ? (
                                <tr><td colSpan={6} className="py-10 text-center text-[14px] text-[#7C7C7C]">No orders yet</td></tr>
                            ) : (
                            data?.recentOrders.map((row) => {
                                const statusStyle = row.status === 'delivered'
                                    ? "bg-[#EEF8F1] text-[#299E60] px-6 py-1.5"
                                    : row.status === 'cancelled'
                                    ? "bg-[#FFF0F0] text-[#E74C3C] px-6 py-1.5"
                                    : "bg-[#FFF4E5] text-[#976538] px-6 py-1.5";
                                return (
                                <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-5 px-6 text-center font-bold text-[14px] text-[#181725]">{row.orderNumber}</td>
                                    <td className="py-5 px-6 text-center text-[14px] text-[#181725] font-medium">{row.user.fullName}</td>
                                    <td className="py-5 px-6 text-center text-[14px] text-[#181725] font-medium">{row.vendor.businessName}</td>
                                    <td className="py-5 px-6 text-center">
                                        <div className="flex justify-center">
                                            <span className={cn("inline-flex items-center justify-center rounded-[10px] text-[14px] font-medium capitalize", statusStyle)}>
                                                {row.status}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-5 px-6 text-center text-[14px] text-[#181725] font-medium">{new Date(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                    <td className="py-5 px-6 text-center">
                                        <div className="flex justify-center">
                                            <Link href={`/admin/orders/${row.id}`} className="bg-[#299E60] hover:bg-[#238b54] text-white text-[12px] font-bold h-[28px] px-4 rounded-[5px] transition-colors cursor-pointer flex items-center justify-center">
                                                View Details
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                                );
                            })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="mt-8 flex justify-center">
                    <Link href="/admin/orders" className="flex items-center justify-center gap-[3px] w-[149px] h-[41px] border border-[#299E60] rounded-[5px] text-[14px] font-bold text-[#299E60] hover:bg-[#EEF8F1] transition-all cursor-pointer">
                        <span>View all</span> <ChevronRight size={14} className="text-[#299E60]" />
                    </Link>
                </div>
            </div>
            </>
            )}
        </div>
    );
}
