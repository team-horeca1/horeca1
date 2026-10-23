'use client';

import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PriceListCol } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after create with the new list so the parent can open the product picker. */
  onCreated: (list: { id: string; name: string }) => void;
  existingLists: PriceListCol[];
}

export function NewPriceListModal({ open, onClose, onCreated, existingLists }: Props) {
  const [name, setName] = useState('');
  const [cloneFromId, setCloneFromId] = useState('');
  const [adjustPercent, setAdjustPercent] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName('');
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
        const created = cloneJson.data as { id: string; name: string };
        toast.success(`Created "${trimmed}"`);
        reset();
        onCreated({ id: created.id, name: created.name || trimmed });
        onClose();
      } else {
        const res = await fetch('/api/v1/vendor/price-lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed,
            kind: 'selected',
            discountPercent: 0,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error?.message || 'Failed to create list');
        }
        const created = json.data as { id: string; name: string };
        toast.success(`Created "${trimmed}"`);
        reset();
        onCreated({ id: created.id, name: created.name || trimmed });
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-[12px] shadow-xl w-full max-w-md p-6 space-y-4" role="dialog" aria-modal="true" aria-label="New price list">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-[#181725]">New price list</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#FAF7F2]" aria-label="Close">
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
            autoFocus
          />
        </div>

        <div>
          <label className="text-[12px] font-medium text-[#7C7C7C]">Optional: copy products from</label>
          <select
            value={cloneFromId}
            onChange={(e) => setCloneFromId(e.target.value)}
            className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] outline-none focus:border-primary bg-white"
          >
            <option value="">Start empty — pick products next</option>
            {existingLists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {cloneFromId && (
          <div>
            <label className="text-[12px] font-medium text-[#7C7C7C]">Adjust copied prices by (%)</label>
            <input
              type="number"
              value={adjustPercent}
              onChange={(e) => setAdjustPercent(e.target.value)}
              placeholder="e.g. -3"
              className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] outline-none focus:border-primary tabular-nums"
            />
          </div>
        )}

        <p className="text-[12px] text-[#667085]">
          {cloneFromId
            ? 'After create you can still add or remove products.'
            : 'Next you’ll pick which products belong in this list.'}
        </p>

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
            disabled={saving || !name.trim()}
            onClick={() => void submit()}
            className="flex-1 h-11 min-h-[48px] rounded-[12px] bg-primary text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
