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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 min-h-[220px] lg:min-h-[411px]">
        <div className="bg-white rounded-[16px] border border-divider animate-pulse" />
        <div className="bg-white rounded-[16px] border border-divider animate-pulse" />
      </div>
    ),
  },
);

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
        { label: 'Total Orders', value: data.stats.totalOrders.toLocaleString('en-IN'), icon: ShoppingCart, trend: `+${data.stats.newUsersThisMonth} this month` },
        { label: 'Total Customers', value: data.stats.totalUsers.toLocaleString('en-IN'), icon: Users, trend: `+${data.stats.newUsersThisMonth}` },
        { label: 'Total Vendors', value: data.stats.totalVendors.toLocaleString('en-IN'), icon: Store, trend: '' },
        { label: 'Total Revenue', value: formatINR(Number(data.stats.totalRevenue)), icon: Wallet, trend: '' },
    ] : [];

    return (
        <div className="space-y-5 lg:space-y-8">
            <div>
                <h1 className="text-[clamp(1.25rem,4vw,1.625rem)] font-semibold text-[#111827] text-balance">Dashboard</h1>
                <p className="text-[#667085] text-[13px] lg:text-[14px] font-medium text-pretty">Whole data about your business here</p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-primary" size={32} />
                </div>
            ) : (
            <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
                {statCards.map((stat) => (
                    <div key={stat.label} className="bg-white p-4 lg:p-6 rounded-[16px] border border-divider shadow-sm flex flex-col justify-between min-h-[120px] lg:min-h-[145px]">
                        <div className="flex items-center gap-2.5">
                            <div className="size-9 lg:size-11 rounded-[12px] flex items-center justify-center shrink-0 bg-primary-light text-primary">
                                <stat.icon size={20} />
                            </div>
                            <span className="text-[12px] lg:text-[15px] font-semibold text-[#4B5563] leading-tight">{stat.label}</span>
                        </div>

                        <div className="flex items-end justify-between gap-2 mt-3">
                            <h4 className="text-[clamp(1.25rem,3vw,1.75rem)] font-bold text-[#111827] leading-none tabular-nums">{stat.value}</h4>
                            {stat.trend && (
                            <div className="hidden sm:flex items-center px-2 py-1 rounded-full text-[11px] font-semibold bg-primary-light text-primary">
                                {stat.trend}
                            </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <AdminDashboardCharts monthlyData={data?.monthlyData ?? []} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <div className="bg-white p-4 lg:p-6 rounded-[16px] border border-divider shadow-sm h-fit">
                    <div className="flex items-center justify-between mb-5 lg:mb-8">
                        <h3 className="text-[16px] lg:text-[18px] font-bold text-[#111827]">Orders by Status</h3>
                        <Link href="/admin/orders" className="text-primary text-[12px] font-semibold">See all</Link>
                    </div>
                    {Object.keys(data?.ordersByStatus || {}).length === 0 ? (
                        <div className="py-10 text-center text-[#6B7280] text-[14px]">No orders yet</div>
                    ) : (
                    <div className="space-y-3">
                        {Object.entries(data?.ordersByStatus || {}).map(([status, count]) => {
                            const total = Object.values(data?.ordersByStatus || {}).reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                            const colorMap: Record<string, string> = {
                                pending: 'bg-warning',
                                confirmed: 'bg-info',
                                processing: 'bg-primary',
                                out_for_delivery: 'bg-warning',
                                delivered: 'bg-success',
                                cancelled: 'bg-error',
                            };
                            return (
                                <div key={status} className="flex items-center gap-3">
                                    <span className="text-[12px] lg:text-[13px] font-medium text-[#667085] w-[7.5rem] capitalize shrink-0">{status.replace(/_/g, ' ')}</span>
                                    <div className="flex-1 bg-ivory rounded-full h-2 overflow-hidden">
                                        <div className={`h-full rounded-full ${colorMap[status] || 'bg-[#9CA3AF]'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[13px] font-bold text-[#111827] w-8 text-right shrink-0 tabular-nums">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                    )}
                </div>

                <div className="bg-white p-4 lg:p-6 rounded-[16px] border border-divider shadow-sm h-fit">
                    <div className="flex items-center justify-between mb-5 lg:mb-8">
                        <h3 className="text-[16px] lg:text-[18px] font-bold text-[#111827]">Active Vendors</h3>
                        <Link href="/admin/vendors" className="text-primary text-[12px] font-semibold">See all</Link>
                    </div>
                    {(!data?.recentOrders || data.recentOrders.length === 0) ? (
                        <div className="py-10 text-center text-[#6B7280] text-[14px]">No vendor activity yet</div>
                    ) : (
                    <div className="space-y-2.5">
                        {Array.from(new Map(data.recentOrders.map(o => [o.vendor.id, o.vendor])).values()).slice(0, 6).map((vendor) => (
                            <div key={vendor.id} className="flex items-center justify-between px-3 min-h-14 border border-divider rounded-[12px] bg-white">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="size-9 rounded-[10px] bg-primary-light flex items-center justify-center shrink-0">
                                        <Store size={16} className="text-primary" />
                                    </div>
                                    <p className="text-[14px] font-semibold text-[#111827] truncate">{vendor.businessName}</p>
                                </div>
                                <Link href={`/admin/vendors/${vendor.id}`} className="text-[12px] font-semibold text-primary shrink-0 min-h-12 px-3 flex items-center">
                                    View
                                </Link>
                            </div>
                        ))}
                    </div>
                    )}
                </div>
            </div>

            <div className="bg-white p-4 lg:p-8 rounded-[16px] border border-divider shadow-sm">
                <h3 className="text-[16px] lg:text-[18px] font-bold text-[#111827] mb-4 lg:mb-8">Recent Activity</h3>

                <div className="md:hidden space-y-3">
                    {(data?.recentOrders || []).length === 0 ? (
                        <p className="py-8 text-center text-[14px] text-[#667085]">No orders yet</p>
                    ) : (
                        data?.recentOrders.map((row) => (
                            <Link
                                key={row.id}
                                href={`/admin/orders/${row.id}`}
                                className="block rounded-[12px] border border-divider p-4 active:scale-[0.99] transition-transform"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[14px] font-bold text-[#111827] tabular-nums">{row.orderNumber}</p>
                                        <p className="text-[13px] text-[#667085] truncate mt-0.5">{row.user.fullName}</p>
                                        <p className="text-[12px] text-[#6B7280] truncate">{row.vendor.businessName}</p>
                                    </div>
                                    <span className={cn(
                                        'shrink-0 inline-flex items-center capitalize rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                        row.status === 'delivered' ? 'bg-success-light text-success'
                                        : row.status === 'cancelled' ? 'bg-[#FEE2E2] text-error'
                                        : 'bg-[#FEF3C7] text-[#B45309]',
                                    )}>
                                        {row.status.replace(/_/g, ' ')}
                                    </span>
                                </div>
                                <p className="text-[12px] text-[#6B7280] mt-2">
                                    {new Date(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                            </Link>
                        ))
                    )}
                </div>

                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-ivory h-12">
                                <th className="px-4 text-left text-[12px] font-semibold text-[#4B5563] first:rounded-l-[10px]">Order ID</th>
                                <th className="px-4 text-left text-[12px] font-semibold text-[#4B5563]">Customer</th>
                                <th className="px-4 text-left text-[12px] font-semibold text-[#4B5563]">Vendor</th>
                                <th className="px-4 text-left text-[12px] font-semibold text-[#4B5563]">Status</th>
                                <th className="px-4 text-left text-[12px] font-semibold text-[#4B5563]">Date</th>
                                <th className="px-4 text-right text-[12px] font-semibold text-[#4B5563] last:rounded-r-[10px]">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data?.recentOrders || []).length === 0 ? (
                                <tr><td colSpan={6} className="py-10 text-center text-[14px] text-[#667085]">No orders yet</td></tr>
                            ) : (
                            data?.recentOrders.map((row) => {
                                const statusStyle = row.status === 'delivered'
                                    ? "bg-success-light text-success"
                                    : row.status === 'cancelled'
                                    ? "bg-[#FEE2E2] text-error"
                                    : "bg-[#FEF3C7] text-[#B45309]";
                                return (
                                <tr key={row.id} className="border-b border-divider">
                                    <td className="py-4 px-4 font-semibold text-[14px] text-[#111827] tabular-nums">{row.orderNumber}</td>
                                    <td className="py-4 px-4 text-[14px] text-[#111827] font-medium">{row.user.fullName}</td>
                                    <td className="py-4 px-4 text-[14px] text-[#111827] font-medium">{row.vendor.businessName}</td>
                                    <td className="py-4 px-4">
                                        <span className={cn("inline-flex items-center rounded-full text-[12px] font-semibold capitalize px-2.5 py-1", statusStyle)}>
                                            {row.status.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-[14px] text-[#111827] font-medium">{new Date(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                    <td className="py-4 px-4 text-right">
                                        <Link href={`/admin/orders/${row.id}`} className="inline-flex items-center justify-center bg-primary hover:bg-primary-dark text-white text-[12px] font-semibold min-h-10 px-4 rounded-[8px] active:scale-[0.97] transition-transform">
                                            View details
                                        </Link>
                                    </td>
                                </tr>
                                );
                            })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="mt-6 flex justify-center">
                    <Link href="/admin/orders" className="inline-flex items-center justify-center gap-1 min-h-12 px-5 border border-primary rounded-[12px] text-[14px] font-semibold text-primary hover:bg-primary-light active:scale-[0.97] transition-transform">
                        <span>View all</span> <ChevronRight size={14} />
                    </Link>
                </div>
            </div>
            </>
            )}
        </div>
    );
}
