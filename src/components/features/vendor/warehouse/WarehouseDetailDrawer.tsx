'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Loader2, Truck, CheckCircle2, XCircle, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { personFirstCustomerLabel } from '@/lib/customerLabel';
import { toast } from 'sonner';
import { WAREHOUSE_STATUS_STYLE, type WarehouseTab, type PicklistItem } from './warehouseConstants';
import { PicklistPrintButton } from './PicklistPrintButton';

interface PicklistDetail {
  id: string;
  status: string;
  notes: string | null;
  items: PicklistItem[];
  canDispatch?: boolean;
  orderId: string | null;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    user?: { fullName: string; businessName: string | null; phone: string | null };
  } | null;
  createdAt: string;
}

interface DispatchDetail {
  id: string;
  status: string;
  driverName: string | null;
  vehicleNumber: string | null;
  notes: string | null;
  orderId: string | null;
  picklistId: string | null;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    deliveryOtp?: string | null;
    user?: { fullName: string; businessName: string | null; phone: string | null };
  } | null;
  createdAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
}

interface GrnDetail {
  id: string;
  status: string;
  referenceNo: string | null;
  supplier: string | null;
  notes: string | null;
  items: Array<{ productId: string; productName?: string; qty: number }>;
  createdAt: string;
  receivedAt: string | null;
}

interface Props {
  open: boolean;
  tab: WarehouseTab;
  recordId: string | null;
  onClose: () => void;
  onUpdated: () => void;
  onCreateDispatch?: (picklistId: string, orderId: string | null) => void;
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

export function WarehouseDetailDrawer({
  open,
  tab,
  recordId,
  onClose,
  onUpdated,
  onCreateDispatch,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picklist, setPicklist] = useState<PicklistDetail | null>(null);
  const [dispatch, setDispatch] = useState<DispatchDetail | null>(null);
  const [grn, setGrn] = useState<GrnDetail | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const endpoint =
    tab === 'picklists'
      ? `/api/v1/vendor/warehouse/picklists/${recordId}`
      : tab === 'dispatches'
        ? `/api/v1/vendor/warehouse/dispatches/${recordId}`
        : `/api/v1/vendor/warehouse/grn/${recordId}`;

  const load = useCallback(async () => {
    if (!recordId || !open) return;
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      if (tab === 'picklists') setPicklist(json.data);
      else if (tab === 'dispatches') {
        setDispatch(json.data);
        setDeliveryNotes(json.data.notes ?? '');
      } else setGrn(json.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [endpoint, open, onClose, recordId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchPicklist = async (status: string) => {
    if (!recordId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/warehouse/picklists/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Update failed');
      toast.success(
        status === 'picked'
          ? 'Marked as picked — order ready for dispatch'
          : status === 'cancelled'
            ? 'Picklist cancelled'
            : 'Picklist updated',
      );
      onUpdated();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const patchDispatch = async (status: string) => {
    if (!recordId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/warehouse/dispatches/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes: deliveryNotes || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Update failed');
      toast.success(
        status === 'delivered'
          ? 'Dispatch delivered — order marked delivered'
          : 'Dispatch updated',
      );
      onUpdated();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const patchGrn = async (status: string) => {
    if (!recordId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/warehouse/grn/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Update failed');
      toast.success(status === 'received' ? 'Stock received into inventory' : 'GRN cancelled');
      onUpdated();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !recordId) return null;

  const title =
    tab === 'picklists'
      ? picklist?.order?.orderNumber ?? `Picklist ${recordId.slice(0, 8)}`
      : tab === 'dispatches'
        ? dispatch?.order?.orderNumber ?? `Dispatch ${recordId.slice(0, 8)}`
        : grn?.referenceNo ?? `GRN ${recordId.slice(0, 8)}`;

  const status =
    tab === 'picklists' ? picklist?.status : tab === 'dispatches' ? dispatch?.status : grn?.status;

  const items =
    tab === 'picklists'
      ? picklist?.items ?? []
      : tab === 'grn'
        ? grn?.items ?? []
        : [];

  return (
    <div className="fixed inset-0 z-[10002] flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[480px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-[#181725] truncate">{title}</p>
            {status && <div className="mt-1"><StatusChip status={status} /></div>}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[#F5F5F5]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-[#299E60]" size={28} />
            </div>
          ) : (
            <>
              {tab === 'picklists' && picklist?.order && (
                <div className="text-[13px] space-y-1">
                  <p className="text-[#7C7C7C]">
                    Customer:{' '}
                    <span className="font-semibold text-[#181725]">
                      {personFirstCustomerLabel({
                        fullName: picklist.order.user?.fullName,
                        businessName: picklist.order.user?.businessName,
                        fallback: '—',
                      })}
                    </span>
                  </p>
                  <Link href={`/vendor/orders/${picklist.order.id}`} className="text-[#299E60] font-bold text-[12px] hover:underline">
                    View order →
                  </Link>
                </div>
              )}

              {tab === 'dispatches' && dispatch && (
                <div className="text-[13px] space-y-2 bg-[#FAFAFA] rounded-[10px] p-3 border border-[#EEEEEE]">
                  {dispatch.driverName && <p><span className="text-[#7C7C7C]">Driver:</span> <strong>{dispatch.driverName}</strong></p>}
                  {dispatch.vehicleNumber && <p><span className="text-[#7C7C7C]">Vehicle:</span> <strong>{dispatch.vehicleNumber}</strong></p>}
                  {dispatch.order && (
                    <Link href={`/vendor/orders/${dispatch.order.id}`} className="text-[#299E60] font-bold text-[12px] hover:underline block">
                      Order {dispatch.order.orderNumber} →
                    </Link>
                  )}
                  {dispatch.order?.deliveryOtp && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      This order has a delivery OTP issued. Warehouse auto-delivery uses notes proof only.
                    </p>
                  )}
                </div>
              )}

              {tab === 'grn' && grn && (
                <div className="text-[13px] space-y-1">
                  {grn.supplier && <p><span className="text-[#7C7C7C]">Supplier:</span> <strong>{grn.supplier}</strong></p>}
                  {grn.referenceNo && <p><span className="text-[#7C7C7C]">Ref:</span> <strong>{grn.referenceNo}</strong></p>}
                </div>
              )}

              {items.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-bold text-[#7C7C7C] uppercase mb-2 flex items-center gap-1">
                    <Package size={14} /> Line items
                  </h4>
                  <div className="border border-[#EEEEEE] rounded-[10px] divide-y divide-[#F5F5F5]">
                    {items.map((item) => (
                      <div key={item.productId} className="flex justify-between px-3 py-2.5 text-[13px]">
                        <span className="font-medium text-[#181725] pr-2">{item.productName ?? 'Product'}</span>
                        <span className="font-bold shrink-0">×{item.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'dispatches' && dispatch?.status === 'out_for_delivery' && (
                <div>
                  <label className="block text-[11px] font-bold text-[#7C7C7C] uppercase mb-1">Delivery notes</label>
                  <textarea
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional proof notes for customer order"
                    className="w-full border border-[#EEEEEE] rounded-[10px] px-3 py-2 text-[13px] resize-none outline-none focus:border-[#299E60]/40"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {!loading && (
          <div className="p-5 border-t border-[#EEEEEE] flex flex-wrap gap-2">
            {tab === 'picklists' && picklist && picklist.status !== 'cancelled' && (
              <>
                {picklist.orderId && ['draft', 'printed', 'picked'].includes(picklist.status) && (
                  <PicklistPrintButton
                    orderId={picklist.orderId}
                    picklistId={picklist.id}
                    onPrinted={() => { onUpdated(); void load(); }}
                    className="h-[40px] px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold flex items-center gap-1.5"
                  />
                )}
                {['draft', 'printed'].includes(picklist.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patchPicklist('picked')}
                    className="h-[40px] px-4 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Mark picked
                  </button>
                )}
                {picklist.status === 'picked' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onCreateDispatch?.(picklist.id, picklist.orderId);
                      onClose();
                    }}
                    className="h-[40px] px-4 rounded-[10px] bg-[#181725] text-white text-[13px] font-bold flex items-center gap-1.5"
                  >
                    <Truck size={14} />
                    Create dispatch
                  </button>
                )}
                {picklist.status !== 'picked' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (confirm('Cancel this picklist?')) void patchPicklist('cancelled');
                    }}
                    className="h-[40px] px-4 rounded-[10px] border border-[#FEE2E2] text-[#E74C3C] text-[13px] font-bold flex items-center gap-1.5"
                  >
                    <XCircle size={14} />
                    Cancel
                  </button>
                )}
              </>
            )}

            {tab === 'dispatches' && dispatch && dispatch.status === 'out_for_delivery' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => patchDispatch('delivered')}
                className="h-[40px] px-4 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Mark delivered
              </button>
            )}

            {tab === 'dispatches' && dispatch && dispatch.status === 'pending' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => patchDispatch('out_for_delivery')}
                className="h-[40px] px-4 rounded-[10px] bg-[#3B82F6] text-white text-[13px] font-bold disabled:opacity-50"
              >
                Mark out for delivery
              </button>
            )}

            {tab === 'grn' && grn && grn.status === 'draft' && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patchGrn('received')}
                  className="h-[40px] px-4 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Receive stock
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirm('Cancel this GRN?')) void patchGrn('cancelled');
                  }}
                  className="h-[40px] px-4 rounded-[10px] border border-[#FEE2E2] text-[#E74C3C] text-[13px] font-bold"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
