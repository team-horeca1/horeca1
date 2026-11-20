'use client';

import React, { useEffect, useState } from 'react';
import { Download, IndianRupee, Loader2, ShoppingBag, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { FinanceKpiCard, focusRing, inr } from '@/components/features/finance/financeChrome';

interface OverviewData {
  period: string;
  summary: {
    totalGmv: number;
    orderCount: number;
    averageOrder: number;
    platformRevenue: number;
    returnsRefunded: number;
    pendingSettlements: number;
  };
  salesByVendor: Array<{
    vendorName: string;
    orderCount: number;
    gross: number;
  }>;
  dailyTrend: Array<{ name: string; sales: number; orders: number }>;
}

const PERIODS = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
] as const;

export default function AdminReportsPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/admin/reports?period=${period}`)
      .then((res) => res.json())
      .then((json) => { if (json.success) setData(json.data); })
      .finally(() => setLoading(false));
  }, [period]);

  const orders = data?.summary.orderCount ?? 0;
  const sales = data?.summary.totalGmv ?? 0;
  const average = orders > 0 ? sales / orders : 0;

  return (
    <div className="space-y-6 pb-12 text-[#1C1C1C]">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sales reports</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#667085]">
            Delivered sales for the period. This page is not used to pay suppliers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[#E9E3DD] bg-white p-1" role="group" aria-label="Period">
            {PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={period === item.id}
                onClick={() => setPeriod(item.id)}
                className={cn(
                  'h-9 rounded-lg px-3 text-xs font-semibold',
                  focusRing,
                  period === item.id ? 'bg-[#6B1D2E] text-white' : 'text-[#667085] hover:bg-[#FAF7F2]',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.open(`/api/v1/admin/reports?type=sales_by_vendor&period=${period}&format=csv`, '_blank')}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-xl border border-[#E9E3DD] bg-white px-4 text-xs font-semibold hover:bg-[#FAF7F2]',
              focusRing,
            )}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-[#6B1D2E]">
          <Loader2 className="animate-spin" size={22} />
          <span className="text-sm font-semibold">Loading sales…</span>
        </div>
      ) : data ? (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FinanceKpiCard title="Orders" value={String(orders)} subtext="Delivered in this period" icon={<ShoppingBag className="h-4 w-4" />} iconTone="burgundy" />
            <FinanceKpiCard title="Sales" value={inr(sales)} subtext="Customer total on delivered orders" icon={<IndianRupee className="h-4 w-4" />} variant="hero" iconTone="burgundy" />
            <FinanceKpiCard title="Average order" value={inr(average)} subtext="Sales divided by orders" icon={<TrendingUp className="h-4 w-4" />} iconTone="blue" />
          </section>

          <section className="rounded-2xl border border-[#E9E3DD] bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold">Sales over time</h2>
            <p className="mt-1 text-xs text-[#667085]">Each point is one day of delivered orders.</p>
            {data.dailyTrend.length === 0 ? (
              <p className="py-16 text-center text-sm text-[#667085]">No delivered orders in this period.</p>
            ) : (
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.dailyTrend}>
                    <CartesianGrid stroke="#E9E3DD" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#667085' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#667085' }} tickFormatter={(value) => inr(Number(value))} width={84} />
                    <Tooltip formatter={(value) => inr(Number(value ?? 0))} />
                    <Area type="monotone" dataKey="sales" name="Sales" stroke="#6B1D2E" fill="#F8E8EC" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#E9E3DD] bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold">Top suppliers</h2>
            <p className="mt-1 text-xs text-[#667085]">Highest delivered sales in this period.</p>
            {data.salesByVendor.length === 0 ? (
              <p className="py-16 text-center text-sm text-[#667085]">No suppliers with delivered orders.</p>
            ) : (
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.salesByVendor} layout="vertical" margin={{ left: 16, right: 16 }}>
                    <CartesianGrid stroke="#E9E3DD" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#667085' }} tickFormatter={(value) => inr(Number(value))} />
                    <YAxis type="category" dataKey="vendorName" width={140} tick={{ fontSize: 11, fill: '#1C1C1C' }} />
                    <Tooltip formatter={(value) => inr(Number(value ?? 0))} />
                    <Bar dataKey="gross" name="Sales" fill="#6B1D2E" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white shadow-xs">
            <div className="border-b border-[#E9E3DD] px-5 py-4">
              <h2 className="text-sm font-bold">Supplier sales</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-[#FAF7F2] text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                  <tr>
                    <th className="px-5 py-3">Supplier</th>
                    <th className="px-3 py-3 text-right">Orders</th>
                    <th className="px-5 py-3 text-right">Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E3DD]">
                  {data.salesByVendor.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-12 text-center text-sm text-[#667085]">No delivered orders in this period.</td>
                    </tr>
                  ) : data.salesByVendor.map((vendor) => (
                    <tr key={vendor.vendorName}>
                      <td className="px-5 py-3 font-semibold">{vendor.vendorName}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{vendor.orderCount}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{inr(vendor.gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Could not load sales.</p>
      )}
    </div>
  );
}
