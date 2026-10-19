'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Loader2,
  ShoppingBag,
  Clock,
  CheckCircle2,
  IndianRupee,
  Eye,
  Calendar,
  ArrowUpRight,
  ShoppingBasket,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { personFirstCustomerLabel } from '@/lib/customerLabel';
import { isAbandonedCart } from '@/lib/abandonedOrder';
import { OrderListFilters } from '@/components/features/orders/OrderListFilters';
import { OrderPaymentBadge } from '@/components/features/orders/OrderPaymentBadge';
import { OrderStatusBadge, OrderStatusSelect } from '@/components/features/orders/OrderStatusSelect';
import { orderStatusLabel } from '@/components/features/orders/orderStatus';

interface AdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod?: string | null;
  createdAt: string;
  vendor: { id: string; businessName: string };
  user: { id: string; fullName: string; email: string; businessName?: string | null };
  outlet?: { id: string; name: string } | null;
  abandonedAt?: string | null;
  items: { id: string; productName: string; quantity: number; unitPrice: number; totalPrice: number }[];
}

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [vendorIdFilter, setVendorIdFilter] = useState('');
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const hasActiveFilters =
    Boolean(dateFrom || dateTo || paymentStatusFilter || paymentMethodFilter || vendorIdFilter);
  const isFirstPage = cursorStack.length === 0;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/admin/vendors?limit=100')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json.success) return;
        const list = (json.data?.vendors ?? []) as Array<{
          id: string;
          businessName?: string;
          displayName?: string | null;
        }>;
        if (!Array.isArray(list)) return;
        setVendors(
          list.map((v) => ({
            id: v.id,
            name: v.displayName || v.businessName || v.id,
          })),
        );
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchOrders = useCallback(
    (opts: {
      tab: string;
      q: string;
      cur?: string | null;
      from?: string;
      to?: string;
      payment?: string;
      paymentMethod?: string;
      vendorId?: string;
    }) => {
      setLoading(true);
      const url = new URL('/api/v1/admin/orders', window.location.origin);
      url.searchParams.set('limit', String(PAGE_SIZE));
      if (opts.tab !== 'all') url.searchParams.set('status', opts.tab);
      if (opts.q.trim()) url.searchParams.set('q', opts.q.trim());
      if (opts.cur) url.searchParams.set('cursor', opts.cur);
      if (opts.from) url.searchParams.set('dateFrom', opts.from);
      if (opts.to) url.searchParams.set('dateTo', opts.to);
      if (opts.payment) url.searchParams.set('paymentStatus', opts.payment);
      if (opts.paymentMethod) url.searchParams.set('paymentMethod', opts.paymentMethod);
      if (opts.vendorId) url.searchParams.set('vendorId', opts.vendorId);

      fetch(url.toString())
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setOrders(json.data.orders);
            setCursor(json.data.nextCursor);
            setHasMore(json.data.hasMore);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    setCursorStack([]);
    fetchOrders({
      tab: activeTab,
      q: searchQuery,
      from: dateFrom,
      to: dateTo,
      payment: paymentStatusFilter,
      paymentMethod: paymentMethodFilter,
      vendorId: vendorIdFilter,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursorStack([]);
      fetchOrders({
        tab: activeTab,
        q: searchQuery,
        from: dateFrom,
        to: dateTo,
        payment: paymentStatusFilter,
        paymentMethod: paymentMethodFilter,
        vendorId: vendorIdFilter,
      });
    }, searchQuery ? 300 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    setCursorStack([]);
    fetchOrders({
      tab: activeTab,
      q: searchQuery,
      from: dateFrom,
      to: dateTo,
      payment: paymentStatusFilter,
      paymentMethod: paymentMethodFilter,
      vendorId: vendorIdFilter,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, paymentStatusFilter, paymentMethodFilter, vendorIdFilter]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setPaymentStatusFilter('');
    setPaymentMethodFilter('');
    setVendorIdFilter('');
  };

  const handleNextPage = () => {
    if (!cursor) return;
    setCursorStack((prev) => [...prev, orders[0]?.id ?? '']);
    fetchOrders({
      tab: activeTab,
      q: searchQuery,
      cur: cursor,
      from: dateFrom,
      to: dateTo,
      payment: paymentStatusFilter,
      paymentMethod: paymentMethodFilter,
      vendorId: vendorIdFilter,
    });
  };

  const handlePrevPage = () => {
    const stack = [...cursorStack];
    stack.pop();
    setCursorStack(stack);
    fetchOrders({
      tab: activeTab,
      q: searchQuery,
      cur: stack[stack.length - 1] ?? null,
      from: dateFrom,
      to: dateTo,
      payment: paymentStatusFilter,
      paymentMethod: paymentMethodFilter,
      vendorId: vendorIdFilter,
    });
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    const prev = orders.find((o) => o.id === orderId)?.status;
    if (!prev || prev === newStatus) return;
    setBusyId(orderId);
    setOrders((os) => os.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    try {
      const res = await fetch(`/api/v1/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.message || 'Failed to update status');
      }
      toast.success(`Order set to ${orderStatusLabel(newStatus)}`);
    } catch (e) {
      setOrders((os) => os.map((o) => (o.id === orderId ? { ...o, status: prev } : o)));
      toast.error(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setBusyId(null);
    }
  };

  const totalOrdersCount = orders.length;
  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'pending' || o.status === 'confirmed',
  ).length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

  return (
    <div className="space-y-5 lg:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-divider pb-4">
        <div>
          <h1 className="text-[clamp(1.25rem,4vw,1.875rem)] font-semibold text-[#111827] text-balance mb-1">
            Orders Registry
          </h1>
          <p className="text-[#667085] text-[13px] lg:text-[14px] font-medium text-pretty">
            Monitor purchase requests, shipment status, and order details
          </p>
        </div>

        <div className="relative w-full md:w-[280px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
          <input
            type="text"
            placeholder="Order / Customer / Vendor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 w-full bg-white border border-divider rounded-[12px] pl-10 pr-4 text-[13px] outline-none placeholder:text-[#9CA3AF] font-medium focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
        <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
          <div className="w-12 h-12 rounded-[12px] bg-[#F8E8EC] flex items-center justify-center text-[#6B1D2E]">
            <ShoppingBag size={22} />
          </div>
          <div>
            <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">
              Total POs
            </span>
            <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">
              {totalOrdersCount}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
          <div className="w-12 h-12 rounded-[12px] bg-[#FFF8EB] flex items-center justify-center text-[#D97706]">
            <Clock size={22} />
          </div>
          <div>
            <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">
              Pending Queue
            </span>
            <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">
              {pendingOrdersCount}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-[12px] bg-success-light flex items-center justify-center text-success">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">
              Delivered
            </span>
            <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">
              {deliveredCount}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
          <div className="w-12 h-12 rounded-[12px] bg-[#FDF2F2] flex items-center justify-center text-[#EF4444]">
            <IndianRupee size={22} />
          </div>
          <div>
            <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">
              Total Value
            </span>
            <span className="text-[20px] font-black text-[#1F2937] leading-none mt-1.5 inline-block tabular-nums">
              ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      <OrderListFilters
        activeTab={activeTab}
        onTabChange={handleTabChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        paymentStatus={paymentStatusFilter}
        onPaymentStatusChange={setPaymentStatusFilter}
        paymentMethod={paymentMethodFilter}
        onPaymentMethodChange={setPaymentMethodFilter}
        vendorId={vendorIdFilter}
        onVendorIdChange={setVendorIdFilter}
        vendors={vendors}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        today={today}
      />

      <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-[#EEEEEE] flex items-center justify-between">
          <h3 className="text-[16px] font-extrabold text-[#111827] flex items-center gap-2">
            <ShoppingBasket size={18} className="text-primary" />
            All Orders
          </h3>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="animate-spin text-primary" size={36} />
            <span className="text-[13px] font-bold text-[#6B7280]">Loading orders registry...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-20 text-center bg-white">
            <ShoppingBag size={40} className="text-[#D1D5DB] mx-auto mb-3" />
            <h4 className="text-[15px] font-bold text-[#374151]">No orders found</h4>
            <p className="text-[13px] text-[#9CA3AF] mt-1">
              {searchQuery || hasActiveFilters || activeTab !== 'all'
                ? 'No orders matched the current filters.'
                : 'No orders recorded yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-divider">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="block p-4 active:bg-ivory"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-[#111827] tabular-nums">
                        {order.orderNumber}
                      </p>
                      <p className="text-[13px] text-[#667085] truncate mt-0.5">
                        {personFirstCustomerLabel({
                          fullName: order.user.fullName,
                          businessName: order.user.businessName,
                          outletName: order.outlet?.name,
                        })}
                      </p>
                      <p className="text-[12px] text-[#6B7280] truncate">
                        {order.vendor.businessName}
                      </p>
                    </div>
                    <OrderStatusBadge
                      status={order.status}
                      abandoned={isAbandonedCart(order)}
                      className="shrink-0 rounded-full px-2.5 py-1"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[14px] font-bold text-[#111827] tabular-nums">
                      ₹{Number(order.totalAmount).toLocaleString('en-IN')}
                    </p>
                    <p className="text-[12px] text-[#6B7280]">
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto w-full">
              <table className="w-full border-collapse text-left text-[13px] min-w-[1100px]">
                <thead>
                  <tr className="bg-[#F9FAFB] border-b border-[#EEEEEE] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold text-left w-[160px]">Order ID</th>
                    <th className="px-6 py-4 font-bold min-w-[200px]">Customer</th>
                    <th className="px-6 py-4 font-bold min-w-[160px]">Vendor Partner</th>
                    <th className="px-6 py-4 font-bold w-[120px] text-right">Total Amount</th>
                    <th className="px-6 py-4 font-bold w-[140px] text-center">Date Created</th>
                    <th className="px-6 py-4 font-bold w-[110px] text-center">Payment</th>
                    <th className="px-6 py-4 font-bold w-[180px] text-center">Status</th>
                    <th className="px-6 py-4 font-bold text-right pr-8 w-[160px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {orders.map((order) => {
                    const abandoned = isAbandonedCart(order);
                    return (
                      <tr key={order.id} className="group hover:bg-[#F9FAFB]/50 transition-colors">
                        <td className="px-6 py-4 text-left font-bold text-[#111827] text-[13px] font-mono tabular-nums">
                          {order.orderNumber}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-[#374151]">
                              {personFirstCustomerLabel({
                                fullName: order.user.fullName,
                                businessName: order.user.businessName,
                                outletName: order.outlet?.name,
                              })}
                            </span>
                            <span className="text-[11px] text-[#9CA3AF] font-medium max-w-[180px] truncate">
                              {order.user.email}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[13px] font-semibold text-[#374151]">
                            {order.vendor.businessName}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-black text-[#111827] text-[14px] tabular-nums">
                          ₹
                          {Number(order.totalAmount).toLocaleString('en-IN', {
                            minimumFractionDigits: 0,
                          })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4B5563]">
                            <Calendar size={13} className="text-[#9CA3AF]" />
                            <span>
                              {new Date(order.createdAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <OrderPaymentBadge paymentStatus={order.paymentStatus} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <OrderStatusSelect
                            status={order.status}
                            abandoned={abandoned}
                            busy={busyId === order.id}
                            title={
                              abandoned
                                ? 'Abandoned cart. Payment turns this into a normal order.'
                                : undefined
                            }
                            onChange={(next) => updateOrderStatus(order.id, next)}
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end pr-2">
                            <Link
                              href={`/admin/orders/${order.id}`}
                              className={cn(
                                'min-h-12 px-3.5 bg-primary-light border border-primary/20',
                                'hover:bg-primary hover:text-white text-primary text-[12px] font-semibold',
                                'rounded-[10px] flex items-center justify-center gap-1 whitespace-nowrap',
                              )}
                            >
                              <Eye size={13} />
                              <span>View Details</span>
                              <ArrowUpRight size={11} className="opacity-65" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && (orders.length > 0 || !isFirstPage) && (
          <div className="px-5 py-3 border-t border-[#EEEEEE] flex items-center justify-between">
            <p className="text-[12px] text-[#AEAEAE]">
              Showing {orders.length} order{orders.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={isFirstPage}
                className="h-8 w-8 rounded-[8px] border border-[#EEEEEE] flex items-center justify-center text-[#7C7C7C] hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={!hasMore}
                className="h-8 w-8 rounded-[8px] border border-[#EEEEEE] flex items-center justify-center text-[#7C7C7C] hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
