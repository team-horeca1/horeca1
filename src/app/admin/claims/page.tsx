'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, FileWarning, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ClaimRow {
  id: string;
  type: string;
  status: string;
  amount: string | null;
  notes: string | null;
  vendor: { businessName: string };
  order: { orderNumber: string; totalAmount: string };
}

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : '';
      const res = await fetch(`/api/v1/admin/claims${qs}`);
      const json = await res.json();
      if (json.success) setClaims(json.data);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, status: 'approved' | 'rejected' | 'resolved') => {
    const res = await fetch(`/api/v1/admin/claims/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (res.ok) {
      toast.success(`Claim ${status}`);
      load();
    } else {
      toast.error(json?.error?.message ?? 'Failed');
    }
  };

  return (
    <div className="p-[clamp(1rem,2.5vw,2rem)] space-y-6 pb-12">
      <div>
        <h1 className="text-[clamp(1.25rem,2vw+0.75rem,1.75rem)] font-bold text-[#181725]">Delivery Disputes</h1>
        <p className="text-[12px] text-[#7C7C7C]">Vendor-filed shortage, damage, and quality claims — platform review</p>
      </div>

      <div className="flex gap-2">
        {['pending', 'approved', 'rejected', 'resolved'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-bold capitalize',
              filter === s ? 'bg-[#181725] text-white' : 'bg-white border border-[#EEEEEE] text-[#7C7C7C]',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#299E60]" /></div>
        ) : claims.length === 0 ? (
          <div className="py-16 text-center text-[#AEAEAE]">
            <FileWarning className="mx-auto mb-2" />
            <p>No claims in this queue</p>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#FAFAFA] border-b">
                <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Vendor</th>
                <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Order</th>
                <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Type</th>
                <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Amount</th>
                <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F5F5]">
              {claims.map((c) => (
                <tr key={c.id} className="hover:bg-[#FAFAFA]">
                  <td className="px-4 py-3 font-semibold">{c.vendor.businessName}</td>
                  <td className="px-4 py-3 font-mono">{c.order.orderNumber}</td>
                  <td className="px-4 py-3 capitalize">{c.type}</td>
                  <td className="px-4 py-3 text-right">{c.amount ? `₹${Number(c.amount).toLocaleString('en-IN')}` : '—'}</td>
                  <td className="px-4 py-3 capitalize">{c.status}</td>
                  <td className="px-4 py-3 text-right">
                    {c.status === 'pending' && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => review(c.id, 'approved')} className="p-1.5 rounded-lg bg-[#EEF8F1] text-[#299E60]" title="Approve">
                          <Check size={14} />
                        </button>
                        <button onClick={() => review(c.id, 'rejected')} className="p-1.5 rounded-lg bg-[#FFF0F0] text-[#E74C3C]" title="Reject">
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
