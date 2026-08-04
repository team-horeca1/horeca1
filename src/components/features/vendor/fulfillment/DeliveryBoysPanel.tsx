'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Loader2,
  Phone,
  Plus,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  copyText,
  deliveryStatusLabel,
  deliveryStatusStyle,
  magicLinkAbsoluteUrl,
  type FulfilmentListRow,
} from './fulfillmentConstants';

type BoyRow = {
  id: string;
  type: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  openOrderCount: number;
  openDeliveryCount?: number;
  openPickupCount?: number;
  boyPortal: { token: string; path: string; expiresAt: string | Date } | null;
};

type Props = {
  boyId: string | null;
  onSelectBoy: (id: string | null) => void;
};

export function DeliveryBoysPanel({ boyId, onSelectBoy }: Props) {
  const [boys, setBoys] = useState<BoyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<FulfilmentListRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [portalBusy, setPortalBusy] = useState(false);

  const selected = boys.find((b) => b.id === boyId) ?? null;

  const loadBoys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/fulfilments/resources');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setBoys(json.data as BoyRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load delivery boys');
      setBoys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async (resourceId: string) => {
    setOrdersLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '50',
        deliveryResourceId: resourceId,
      });
      const res = await fetch(`/api/v1/vendor/fulfilments?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load orders');
      setOrders(json.data as FulfilmentListRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load orders');
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoys();
  }, [loadBoys]);

  useEffect(() => {
    if (boyId) void loadOrders(boyId);
    else setOrders([]);
  }, [boyId, loadOrders]);

  async function createBoy() {
    if (!newName.trim() || newPhone.trim().length < 8) {
      toast.error('Enter name and a valid phone');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/v1/vendor/fulfilments/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'executive',
          name: newName.trim(),
          phone: newPhone.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Could not create');
      toast.success('Delivery boy added');
      setNewName('');
      setNewPhone('');
      setShowCreate(false);
      await loadBoys();
      onSelectBoy((json.data as BoyRow).id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create');
    } finally {
      setCreating(false);
    }
  }

  async function ensurePortal(resourceId: string) {
    setPortalBusy(true);
    try {
      const res = await fetch(
        `/api/v1/vendor/fulfilments/resources/${resourceId}/portal`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Could not create portal link');
      await loadBoys();
      toast.success('Portal link ready');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create portal link');
    } finally {
      setPortalBusy(false);
    }
  }

  async function copyPortal(path: string) {
    const ok = await copyText(magicLinkAbsoluteUrl(path));
    if (ok) toast.success('Portal link copied');
    else toast.error('Could not copy');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#0F766E]" />
      </div>
    );
  }

  if (selected) {
    const portal = selected.boyPortal;
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onSelectBoy(null)}
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#0F766E]"
        >
          <ArrowLeft size={14} />
          All delivery boys
        </button>

        <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <p className="text-[18px] font-bold text-[#181725]">{selected.name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#7C7C7C]">
                <Phone size={13} />
                {selected.phone || 'No phone'}
              </p>
              <p className="mt-1 text-[12px] text-[#AEAEAE]">
                {selected.openOrderCount} open{' '}
                {selected.openOrderCount === 1 ? 'task' : 'tasks'}
                {(selected.openDeliveryCount != null || selected.openPickupCount != null) && (
                  <>
                    {' '}
                    (
                    {selected.openDeliveryCount ?? 0} deliver
                    {(selected.openDeliveryCount ?? 0) === 1 ? 'y' : 'ies'}
                    {(selected.openPickupCount ?? 0) > 0
                      ? `, ${selected.openPickupCount} pickup${(selected.openPickupCount ?? 0) === 1 ? '' : 's'}`
                      : ''}
                    )
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {portal ? (
                <>
                  <a
                    href={magicLinkAbsoluteUrl(portal.path)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-[36px] items-center gap-1.5 rounded-[10px] border border-[#0F766E]/25 px-3 text-[12px] font-bold text-[#0F766E]"
                  >
                    <ExternalLink size={13} />
                    Open portal
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyPortal(portal.path)}
                    className="inline-flex h-[36px] items-center gap-1.5 rounded-[10px] bg-[#0F766E] px-3 text-[12px] font-bold text-white"
                  >
                    <Copy size={13} />
                    Copy portal link
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={portalBusy}
                  onClick={() => void ensurePortal(selected.id)}
                  className="inline-flex h-[36px] items-center gap-1.5 rounded-[10px] bg-[#0F766E] px-3 text-[12px] font-bold text-white disabled:opacity-50"
                >
                  {portalBusy ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
                  Generate portal link
                </button>
              )}
            </div>
          </div>
          {portal && (
            <p className="truncate rounded-[10px] bg-[#F4F7F6] px-3 py-2 font-mono text-[11px] text-[#3D3D3D]">
              {magicLinkAbsoluteUrl(portal.path)}
            </p>
          )}
        </div>

        <div className="rounded-[14px] border border-[#EEEEEE] bg-white overflow-hidden">
          <div className="border-b border-[#EEEEEE] px-4 py-3">
            <p className="text-[13px] font-bold text-[#181725]">Assigned orders</p>
          </div>
          {ordersLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[#0F766E]" />
            </div>
          ) : orders.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-[#AEAEAE]">
              No assigned orders yet
            </p>
          ) : (
            <ul className="divide-y divide-[#F5F5F5]">
              {orders.map((row) => (
                <li key={row.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-bold">{row.order.orderNumber}</p>
                    <p className="text-[12px] text-[#7C7C7C]">
                      {row.order.user.fullName || row.order.user.businessName || 'Customer'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase',
                      deliveryStatusStyle(row.status),
                    )}
                  >
                    {deliveryStatusLabel(row.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-[#7C7C7C]">
          {boys.length} delivery {boys.length === 1 ? 'boy' : 'boys'}
        </p>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex h-[36px] items-center gap-1.5 rounded-[10px] bg-[#0F766E] px-3 text-[12px] font-bold text-white"
        >
          <Plus size={14} />
          Add boy
        </button>
      </div>

      {showCreate && (
        <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#0F766E]/40"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone"
            className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#0F766E]/40"
          />
          <button
            type="button"
            disabled={creating}
            onClick={() => void createBoy()}
            className="h-[40px] px-4 rounded-[10px] bg-[#0F766E] text-white text-[13px] font-bold disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin inline" /> : 'Save'}
          </button>
        </div>
      )}

      {boys.length === 0 ? (
        <div className="rounded-[14px] border border-[#EEEEEE] bg-white py-14 text-center">
          <User className="mx-auto h-8 w-8 text-[#AEAEAE]" />
          <p className="mt-3 text-[14px] font-bold text-[#181725]">No delivery boys yet</p>
          <p className="mt-1 text-[12px] text-[#7C7C7C]">
            Add one here, or assign a boy when dispatching an order.
          </p>
        </div>
      ) : (
        <ul className="rounded-[14px] border border-[#EEEEEE] bg-white divide-y divide-[#F5F5F5] overflow-hidden">
          {boys.map((boy) => (
            <li key={boy.id}>
              <button
                type="button"
                onClick={() => onSelectBoy(boy.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-[#0F766E]/[0.04] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-[#181725] truncate">{boy.name}</p>
                  <p className="text-[12px] text-[#7C7C7C] flex items-center gap-1 mt-0.5">
                    <Phone size={12} />
                    {boy.phone || '—'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#F4F7F6] px-2.5 py-1 text-[11px] font-bold text-[#0F766E]">
                  {boy.openOrderCount} open
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
