'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, IndianRupee, ShoppingBag, Building2, Store } from 'lucide-react';
import { toast } from 'sonner';
import { setEnteredStore } from '@/lib/supplierPortalLevel';

interface DashboardData {
  businessCount: number;
  storeCount: number;
  activeStoreCount: number;
  totalOrders: number;
  totalRevenue: number;
  todaySales: number;
  mtdSales: number;
  ordersByStatus: Record<string, number>;
}

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function SupplierDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/supplier/dashboard', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setData(json.data as DashboardData);
      else toast.error(json.error?.message ?? 'Failed to load dashboard');
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setEnteredStore(false);
    void fetchDashboard();
  }, [fetchDashboard]);

  // Refetch KPIs when returning to the tab/page so newly created businesses show up
  useEffect(() => {
    const onFocus = () => void fetchDashboard();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchDashboard();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-[#299E60]" size={32} />
      </div>
    );
  }

  const d = data ?? {
    businessCount: 0,
    storeCount: 0,
    activeStoreCount: 0,
    totalOrders: 0,
    totalRevenue: 0,
    todaySales: 0,
    mtdSales: 0,
    ordersByStatus: {},
  };

  const statusEntries = Object.entries(d.ordersByStatus).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-[960px] mx-auto space-y-6" data-testid="supplier-dashboard">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-[#AEAEAE]">Supplier</p>
        <h1 className="text-[24px] font-bold text-[#181725] mt-1">Supplier Dashboard</h1>
        <p className="text-[14px] text-[#7C7C7C] mt-1">
          Combined performance across all businesses and online stores.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#EEEEEE] rounded-[16px] p-4">
          <div className="flex items-center gap-2 text-[#AEAEAE]">
            <Building2 size={14} />
            <p className="text-[11px] font-bold uppercase tracking-wider">Businesses</p>
          </div>
          <p className="text-[26px] font-extrabold text-[#181725] mt-1" data-testid="kpi-businesses">
            {d.businessCount}
          </p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-[16px] p-4">
          <div className="flex items-center gap-2 text-[#AEAEAE]">
            <Store size={14} />
            <p className="text-[11px] font-bold uppercase tracking-wider">Stores</p>
          </div>
          <p className="text-[26px] font-extrabold text-[#181725] mt-1" data-testid="kpi-stores">
            {d.storeCount}
          </p>
          <p className="text-[11px] text-[#299E60] font-semibold mt-0.5">{d.activeStoreCount} active</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-[16px] p-4">
          <div className="flex items-center gap-2 text-[#AEAEAE]">
            <ShoppingBag size={14} />
            <p className="text-[11px] font-bold uppercase tracking-wider">Orders</p>
          </div>
          <p className="text-[26px] font-extrabold text-[#181725] mt-1" data-testid="kpi-orders">
            {d.totalOrders}
          </p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-[16px] p-4">
          <div className="flex items-center gap-2 text-[#AEAEAE]">
            <IndianRupee size={14} />
            <p className="text-[11px] font-bold uppercase tracking-wider">Revenue</p>
          </div>
          <p className="text-[22px] font-extrabold text-[#299E60] mt-1" data-testid="kpi-revenue">
            {formatInr(d.totalRevenue)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white border border-[#EEEEEE] rounded-[16px] p-5">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#AEAEAE]">Today&apos;s sales</p>
          <p className="text-[24px] font-extrabold text-[#181725] mt-1">{formatInr(d.todaySales)}</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-[16px] p-5">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#AEAEAE]">Month to date</p>
          <p className="text-[24px] font-extrabold text-[#181725] mt-1">{formatInr(d.mtdSales)}</p>
        </div>
      </div>

      {statusEntries.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[16px] p-5">
          <h2 className="text-[14px] font-bold text-[#181725] mb-3">Orders by status</h2>
          <div className="flex flex-wrap gap-2">
            {statusEntries.map(([status, count]) => (
              <span
                key={status}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F8F9FB] text-[12px] font-semibold text-[#181725]"
              >
                <span className="capitalize">{status.replace(/_/g, ' ')}</span>
                <span className="text-[#299E60]">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-center pt-1">
        <Link
          href="/vendor/all-orders"
          className="inline-flex items-center justify-center px-4 py-2.5 bg-[#299E60] hover:bg-[#238a54] text-white text-[13px] font-bold rounded-[10px] transition-colors"
        >
          View all orders
        </Link>
        <Link
          href="/vendor/businesses"
          className="inline-flex items-center justify-center px-4 py-2.5 border border-[#EEEEEE] hover:bg-[#F8F9FB] text-[#181725] text-[13px] font-bold rounded-[10px] transition-colors"
        >
          Manage businesses
        </Link>
      </div>

      <p className="text-[12px] text-[#AEAEAE] text-center">
        Products and inventory live inside each Online Store — open Businesses to enter a store.
      </p>
    </div>
  );
}
