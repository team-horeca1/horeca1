'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { setEnteredStore } from '@/lib/supplierPortalLevel';

interface SupplierOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number | string;
  paymentStatus: string;
  createdAt: string;
  vendorId: string;
  storeName: string;
  businessName: string;
  customerName: string;
  itemCount: number;
}

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function SupplierAllOrdersPage() {
  const { switchOnlineStore } = useBusinessAccountSwitcher();
  const [orders, setOrders] = useState<SupplierOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const fetchOrders = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '20');

    const res = await fetch(`/api/v1/supplier/orders?${params.toString()}`);
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message ?? 'Failed to load orders');
    }
    return json.data as {
      orders: SupplierOrderRow[];
      nextCursor: string | null;
      hasMore: boolean;
    };
  }, [search, status]);

  useEffect(() => {
    setEnteredStore(false);
    let cancelled = false;
    setLoading(true);
    void fetchOrders()
      .then((data) => {
        if (cancelled) return;
        setOrders(data.orders);
        setNextCursor(data.nextCursor);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load orders');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchOrders]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchOrders(nextCursor);
      setOrders((prev) => [...prev, ...data.orders]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const openOrder = async (order: SupplierOrderRow) => {
    setOpeningId(order.id);
    try {
      setEnteredStore(true);
      await switchOnlineStore(order.vendorId);
      window.location.assign(`/vendor/orders/${order.id}`);
    } catch (err) {
      setEnteredStore(false);
      toast.error(err instanceof Error ? err.message : 'Failed to open order');
      setOpeningId(null);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" data-testid="supplier-all-orders">
      <div>
        <Link
          href="/vendor/overview"
          className="text-[13px] font-bold text-[#299E60] hover:text-[#238a54]"
        >
          ← Supplier Dashboard
        </Link>
        <h1 className="text-[24px] font-bold text-[#181725] mt-1">All Orders</h1>
        <p className="text-[14px] text-[#7C7C7C] mt-1">
          Orders from every business and online store, in one place.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSearch(searchInput.trim());
            }}
            placeholder="Search order # or customer…"
            className="w-full pl-9 pr-3 py-2.5 border border-[#EEEEEE] rounded-[10px] text-[14px] outline-none focus:border-[#299E60]"
          />
        </div>
        <button
          type="button"
          onClick={() => setSearch(searchInput.trim())}
          className="px-4 py-2.5 bg-[#299E60] hover:bg-[#238a54] text-white text-[13px] font-bold rounded-[10px]"
        >
          Search
        </button>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2.5 border border-[#EEEEEE] rounded-[10px] text-[14px] outline-none focus:border-[#299E60] bg-white"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-[#299E60]" size={32} />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[16px] p-12 text-center">
          <ShoppingBag size={28} className="text-[#AEAEAE] mx-auto mb-3" />
          <p className="text-[14px] text-[#7C7C7C]">No orders found across your stores.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-[16px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F9FAFB] text-[#6B7280] uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-bold">Order</th>
                  <th className="px-4 py-3 font-bold">Business</th>
                  <th className="px-4 py-3 font-bold">Store</th>
                  <th className="px-4 py-3 font-bold">Customer</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Amount</th>
                  <th className="px-4 py-3 font-bold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-[#FAFBFC] cursor-pointer"
                    onClick={() => void openOrder(order)}
                    data-testid="supplier-order-row"
                  >
                    <td className="px-4 py-3 font-semibold text-[#181725]">
                      {openingId === order.id ? (
                        <Loader2 size={14} className="animate-spin text-[#299E60]" />
                      ) : (
                        order.orderNumber
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#181725] truncate max-w-[140px]">{order.businessName}</td>
                    <td className="px-4 py-3 text-[#7C7C7C] truncate max-w-[140px]">{order.storeName}</td>
                    <td className="px-4 py-3 text-[#181725] truncate max-w-[140px]">{order.customerName}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-[12px] font-semibold text-[#299E60]">
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#181725]">
                      {formatInr(Number(order.totalAmount))}
                    </td>
                    <td className="px-4 py-3 text-[#7C7C7C] whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextCursor && (
            <div className="px-4 py-3 border-t border-[#F0F0F0] text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="text-[13px] font-bold text-[#299E60] hover:text-[#238a54] disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
