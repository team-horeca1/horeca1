'use client';

import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PriceListCol } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  existingLists: PriceListCol[];
}

export function NewPriceListModal({ open, onClose, onCreated, existingLists }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'selected' | 'percent'>('selected');
  const [discountPercent, setDiscountPercent] = useState('5');
  const [cloneFromId, setCloneFromId] = useState('');
  const [adjustPercent, setAdjustPercent] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName('');
    setKind('selected');
    setDiscountPercent('5');
    setCloneFromId('');
    setAdjustPercent('');
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (cloneFromId) {
        const cloneRes = await fetch(`/api/v1/vendor/price-lists/${cloneFromId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed,
            adjustPercent: adjustPercent !== '' ? Number(adjustPercent) : undefined,
          }),
        });
        const cloneJson = await cloneRes.json();
        if (!cloneJson.success) {
          throw new Error(cloneJson.error?.message || 'Failed to clone list');
        }
      } else {
        const res = await fetch('/api/v1/vendor/price-lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed,
            kind,
            discountPercent: kind === 'percent' ? Number(discountPercent) || 0 : 0,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error?.message || 'Failed to create list');
        }
      }

      toast.success(`Created "${trimmed}"`);
      reset();
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-[12px] shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-[#181725]">New price list</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#FAF7F2]">
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="text-[12px] font-medium text-[#7C7C7C]">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] outline-none focus:border-primary"
            placeholder="e.g. Hotel contract"
          />
        </div>

        {!cloneFromId && (
          <div className="space-y-2">
            <span className="text-[12px] font-medium text-[#7C7C7C]">What kind of list?</span>
            <label className="flex items-start gap-2 p-3 rounded-[12px] border border-[#E9E3DD] cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-[#F8E8EC]/40">
              <input type="radio" name="list-kind" checked={kind === 'selected'} onChange={() => setKind('selected')} className="mt-0.5" />
              <span>
                <span className="block text-[13px] font-bold text-[#181725]">Selected products</span>
                <span className="block text-[12px] text-[#7C7C7C]">You add products and set each price. Everything else stays at Base price. (Recommended)</span>
              </span>
            </label>
            <label className="flex items-start gap-2 p-3 rounded-[12px] border border-[#E9E3DD] cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-[#F8E8EC]/40">
              <input type="radio" name="list-kind" checked={kind === 'percent'} onChange={() => setKind('percent')} className="mt-0.5" />
              <span>
                <span className="block text-[13px] font-bold text-[#181725]">All products − %</span>
                <span className="block text-[12px] text-[#7C7C7C]">Every product gets the same % off Base. You can still override single products later.</span>
              </span>
            </label>
          </div>
        )}

        {kind === 'percent' && !cloneFromId && (
          <div>
            <label className="text-[12px] font-medium text-[#7C7C7C]">Discount off Base for every product (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] outline-none focus:border-primary tabular-nums"
            />
          </div>
        )}

        <div>
          <label className="text-[12px] font-medium text-[#7C7C7C]">Optional: clone prices from</label>
          <select
            value={cloneFromId}
            onChange={(e) => setCloneFromId(e.target.value)}
            className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] outline-none focus:border-primary bg-white"
          >
            <option value="">Start empty (base fallback only)</option>
            {existingLists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {cloneFromId && (
          <div>
            <label className="text-[12px] font-medium text-[#7C7C7C]">Adjust cloned prices by (%)</label>
            <input
              type="number"
              value={adjustPercent}
              onChange={(e) => setAdjustPercent(e.target.value)}
              placeholder="e.g. -3"
              className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] outline-none focus:border-primary tabular-nums"
            />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-[12px] border border-[#E9E3DD] font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !name.trim() || (!cloneFromId && kind === 'percent' && !(Number(discountPercent) > 0))}
            onClick={() => void submit()}
            className="flex-1 h-11 rounded-[12px] bg-primary text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
