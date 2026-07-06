'use client';

import React, { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Package, Truck, ClipboardList, Plus, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useVendorOutletScope } from '@/hooks/useVendorOutletScope';
import { cn } from '@/lib/utils';
import { WarehouseLookupInput } from '@/components/features/vendor/warehouse/WarehouseLookupInput';
import { WarehouseDetailDrawer } from '@/components/features/vendor/warehouse/WarehouseDetailDrawer';
import { GrnLineEditor } from '@/components/features/vendor/warehouse/GrnLineEditor';
import {
  WAREHOUSE_STATUS_STYLE,
  type WarehouseTab,
  type OrderLookup,
  type GrnLine,
} from '@/components/features/vendor/warehouse/warehouseConstants';

interface ListRow {
  id: string;
  status: string;
  createdAt: string;
  order?: { orderNumber: string; status?: string };
  referenceNo?: string | null;
  supplier?: string | null;
  driverName?: string | null;
  vehicleNumber?: string | null;
  itemCount?: number;
  canDispatch?: boolean;
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border capitalize',
        WAREHOUSE_STATUS_STYLE[status] ?? 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function WarehousePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentOutlet, outletQuery, scopeVersion } = useVendorOutletScope();

  const initialTab = (searchParams.get('tab') as WarehouseTab) || 'picklists';
  const [tab, setTab] = useState<WarehouseTab>(
    ['picklists', 'dispatches', 'grn'].includes(initialTab) ? initialTab : 'picklists',
  );
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(searchParams.get('open'));
  const [recentOrders, setRecentOrders] = useState<OrderLookup[]>([]);

  const [selectedOrder, setSelectedOrder] = useState<OrderLookup | null>(null);
  const [dispatchOrder, setDispatchOrder] = useState<OrderLookup | null>(null);
  const [picklistIdForDispatch, setPicklistIdForDispatch] = useState<string | null>(
    searchParams.get('picklistId'),
  );
  const [driverName, setDriverName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');

  const [grnLines, setGrnLines] = useState<GrnLine[]>([]);
  const [grnRef, setGrnRef] = useState('');
  const [grnSupplier, setGrnSupplier] = useState('');
  const [grnReceive, setGrnReceive] = useState(true);

    const endpoint =
    tab === 'picklists'
      ? '/api/v1/vendor/warehouse/picklists'
      : tab === 'dispatches'
        ? '/api/v1/vendor/warehouse/dispatches'
        : '/api/v1/vendor/warehouse/grn';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      const json = await res.json();
      if (json.success) setRows(json.data);
    } catch {
      toast.error('Failed to load warehouse data');
    } finally {
      setLoading(false);
    }
  }, [endpoint, scopeVersion]);

  const loadRecentOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/vendor/warehouse/lookup?type=orders&q=');
      const json = await res.json();
      if (json.success) setRecentOrders((json.data.orders ?? []).slice(0, 5));
    } catch {
      /* non-blocking */
    }
  }, [scopeVersion]);

  useEffect(() => {
    void load();
    void loadRecentOrders();
  }, [load, loadRecentOrders]);

  useEffect(() => {
    const orderId = searchParams.get('orderId');
    if (!orderId) return;
    fetch(`/api/v1/vendor/orders/${orderId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) return;
        const o: OrderLookup = {
          id: json.data.id,
          orderNumber: json.data.orderNumber,
          status: json.data.status,
        };
        if (tab === 'picklists') setSelectedOrder(o);
        else if (tab === 'dispatches') setDispatchOrder(o);
      })
      .catch(() => undefined);
  }, [searchParams, tab]);

  const setTabWithUrl = (t: WarehouseTab) => {
    setTab(t);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    params.delete('open');
    router.replace(`/vendor/warehouse?${params.toString()}`);
  };

  const openDrawer = (id: string) => {
    setDrawerId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('open', id);
    router.replace(`/vendor/warehouse?${params.toString()}`);
  };

  const closeDrawer = () => {
    setDrawerId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('open');
    router.replace(`/vendor/warehouse?${params.toString()}`);
  };

  const createPicklist = async (andPrint = false) => {
    if (!selectedOrder) {
      toast.error('Select an order first');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/vendor/warehouse/picklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrder.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      toast.success(json.data.reused ? 'Using existing picklist' : 'Picklist created');
      setSelectedOrder(null);
      void load();
      if (andPrint && selectedOrder.id) {
        if (json.data.status === 'draft') {
          await fetch(`/api/v1/vendor/warehouse/picklists/${json.data.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'printed' }),
          });
        }
        window.open(`/api/v1/vendor/orders/${selectedOrder.id}/picklist`, '_blank');
      }
      openDrawer(json.data.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const createDispatch = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/vendor/warehouse/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: dispatchOrder?.id,
          picklistId: picklistIdForDispatch ?? undefined,
          driverName: driverName || undefined,
          vehicleNumber: vehicleNumber || undefined,
          notes: dispatchNotes || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      toast.success('Dispatch created — order marked shipped');
      setDispatchOrder(null);
      setPicklistIdForDispatch(null);
      setDriverName('');
      setVehicleNumber('');
      setDispatchNotes('');
      void load();
      openDrawer(json.data.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const createGrn = async () => {
    if (grnLines.length === 0) {
      toast.error('Add at least one product line');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/vendor/warehouse/grn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceNo: grnRef || undefined,
          supplier: grnSupplier || undefined,
          receive: grnReceive,
          items: grnLines.map((l) => ({ productId: l.productId, productName: l.productName, qty: l.qty })),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      toast.success(grnReceive ? 'GRN received — stock updated' : 'GRN draft saved');
      setGrnLines([]);
      setGrnRef('');
      setGrnSupplier('');
      void load();
      openDrawer(json.data.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDispatchFromPicklist = (picklistId: string, orderId: string | null) => {
    setPicklistIdForDispatch(picklistId);
    setTabWithUrl('dispatches');
    if (orderId) {
      const fromRows = rows.find((r) => r.id === picklistId);
      if (fromRows?.order) {
        setDispatchOrder({
          id: orderId,
          orderNumber: fromRows.order.orderNumber,
          status: fromRows.order.status ?? '',
        });
      }
    }
  };

  const tabs: { id: WarehouseTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'picklists', label: 'Picklists', icon: ClipboardList },
    { id: 'dispatches', label: 'Dispatch', icon: Truck },
    { id: 'grn', label: 'GRN', icon: Package },
  ];

  const refLabel = (r: ListRow) =>
    r.order?.orderNumber ?? r.referenceNo ?? r.supplier ?? '—';

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-[24px] font-bold text-[#181725]">Warehouse Ops</h1>
        <p className="text-[12px] text-[#AEAEAE]">Picklists, dispatch tracking, and goods receipt</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTabWithUrl(t.id)}
            className={cn(
              'h-[40px] px-4 rounded-[10px] text-[13px] font-bold flex items-center gap-2 border transition-all',
              tab === t.id ? 'bg-[#181725] text-white border-[#181725]' : 'bg-white text-[#7C7C7C] border-[#EEEEEE]',
            )}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-5 shadow-sm space-y-3">
        <h2 className="text-[14px] font-bold text-[#181725] flex items-center gap-2">
          <Plus size={16} />
          Create {tab === 'grn' ? 'GRN' : tab === 'picklists' ? 'picklist' : 'dispatch'}
        </h2>

        {tab === 'picklists' && (
          <div className="space-y-3">
            <WarehouseLookupInput type="orders" value={selectedOrder} onChange={(v) => setSelectedOrder(v as OrderLookup | null)} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => createPicklist(false)}
                disabled={submitting || !selectedOrder}
                className="h-[40px] px-4 bg-[#299E60] text-white rounded-[10px] text-[13px] font-bold disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Create picklist'}
              </button>
              <button
                type="button"
                onClick={() => createPicklist(true)}
                disabled={submitting || !selectedOrder}
                className="h-[40px] px-4 border border-[#299E60] text-[#299E60] rounded-[10px] text-[13px] font-bold disabled:opacity-50"
              >
                Create &amp; print
              </button>
            </div>
          </div>
        )}

        {tab === 'dispatches' && (
          <div className="space-y-3">
            {picklistIdForDispatch && (
              <p className="text-[12px] text-[#299E60] font-semibold bg-[#EEF8F1] border border-[#D1FAE5] rounded-[8px] px-3 py-2">
                Linked to picklist {picklistIdForDispatch.slice(0, 8)}… — mark picklist as picked first if dispatch fails.
              </p>
            )}
            <WarehouseLookupInput
              type="orders"
              value={dispatchOrder}
              onChange={(v) => setDispatchOrder(v as OrderLookup | null)}
              placeholder="Search order (optional if from picklist)"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Driver name"
                className="h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]"
              />
              <input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="Vehicle number"
                className="h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]"
              />
            </div>
            <button
              type="button"
              onClick={createDispatch}
              disabled={submitting || (!dispatchOrder && !picklistIdForDispatch)}
              className="h-[40px] px-4 bg-[#299E60] text-white rounded-[10px] text-[13px] font-bold disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create dispatch'}
            </button>
          </div>
        )}

        {tab === 'grn' && (
          <div className="space-y-3">
            <GrnLineEditor lines={grnLines} onChange={setGrnLines} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={grnSupplier}
                onChange={(e) => setGrnSupplier(e.target.value)}
                placeholder="Supplier"
                className="h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]"
              />
              <input
                value={grnRef}
                onChange={(e) => setGrnRef(e.target.value)}
                placeholder="Reference no."
                className="h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]"
              />
            </div>
            <label className="flex items-center gap-2 text-[13px] font-semibold text-[#181725]">
              <input
                type="checkbox"
                checked={grnReceive}
                onChange={(e) => setGrnReceive(e.target.checked)}
                className="w-4 h-4"
              />
              Receive now (add stock)
            </label>
            <button
              type="button"
              onClick={createGrn}
              disabled={submitting || grnLines.length === 0}
              className="h-[40px] px-4 bg-[#299E60] text-white rounded-[10px] text-[13px] font-bold disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save GRN'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-[#299E60]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 px-5 text-center space-y-4">
            <p className="text-[#AEAEAE] text-[13px]">No records yet.</p>
            {recentOrders.length > 0 && tab === 'picklists' && (
              <div className="text-left max-w-md mx-auto">
                <p className="text-[12px] font-bold text-[#7C7C7C] mb-2">Pick from a recent order:</p>
                <div className="space-y-1">
                  {recentOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOrder(o)}
                      className="w-full text-left px-3 py-2 rounded-[8px] border border-[#EEEEEE] text-[13px] font-semibold hover:bg-[#FAFAFA]"
                    >
                      {o.orderNumber}
                      <span className="ml-2 text-[10px] text-[#AEAEAE] uppercase">{o.status.replace(/_/g, ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Link href="/vendor/orders" className="text-[#299E60] font-bold text-[13px]">
              View orders →
            </Link>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-[#F5F5F5] p-3 space-y-0">
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openDrawer(r.id)}
                  className="w-full text-left bg-[#FAFAFA] rounded-[12px] border border-[#EEEEEE] p-4 mb-3 last:mb-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-bold text-[#181725]">{refLabel(r)}</p>
                    <ChevronRight size={16} className="text-[#AEAEAE] shrink-0" />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <StatusChip status={r.status} />
                    {r.itemCount != null && (
                      <span className="text-[11px] text-[#AEAEAE]">{r.itemCount} items</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#AEAEAE] mt-1">
                    {new Date(r.createdAt).toLocaleDateString('en-IN')}
                  </p>
                </button>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                    <th className="px-5 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Details</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F5]">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-[#FAFAFA]/50 cursor-pointer" onClick={() => openDrawer(r.id)}>
                      <td className="px-5 py-3 font-bold text-[#181725]">{refLabel(r)}</td>
                      <td className="px-4 py-3">
                        <StatusChip status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-[#7C7C7C]">
                        {r.driverName && <span>{r.driverName}</span>}
                        {r.vehicleNumber && <span className="ml-1">· {r.vehicleNumber}</span>}
                        {r.itemCount != null && !r.driverName && <span>{r.itemCount} items</span>}
                        {r.canDispatch && (
                          <span className="ml-2 text-[10px] font-bold text-[#299E60]">Ready to dispatch</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#AEAEAE]">
                        {new Date(r.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={16} className="inline text-[#AEAEAE]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <WarehouseDetailDrawer
        open={!!drawerId}
        tab={tab}
        recordId={drawerId}
        onClose={closeDrawer}
        onUpdated={load}
        onCreateDispatch={handleCreateDispatchFromPicklist}
      />
    </div>
  );
}

export default function VendorWarehousePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[#299E60]" />
        </div>
      }
    >
      <WarehousePageInner />
    </Suspense>
  );
}
