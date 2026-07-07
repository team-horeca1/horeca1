'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, FileWarning, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface ClaimRow {
  id: string;
  type: string;
  status: string;
  amount: string | null;
  notes: string | null;
  order: { orderNumber: string; status: string };
}

export default function VendorClaimsPage() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/claims');
      const json = await res.json();
      if (json.success) setClaims(json.data);
    } catch {
      toast.error('Failed to load claims');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold text-[#181725]">Delivery Disputes</h1>
          <p className="text-[12px] text-[#AEAEAE]">File shortage or damage claims — HoReCa1 reviews and resolves</p>
        </div>
        <Link href="/vendor/orders" className="inline-flex items-center gap-2 h-[40px] px-4 bg-[#181725] text-white rounded-[10px] text-[13px] font-bold">
          <Plus size={14} /> File from order
        </Link>
      </div>
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#299E60]" /></div>
        ) : claims.length === 0 ? (
          <div className="py-16 text-center text-[#AEAEAE] px-4">
            <FileWarning className="mx-auto mb-2" />
            <p className="text-[14px] font-semibold text-[#7C7C7C]">No claims yet</p>
            <p className="text-[12px] mt-1">Open a delivered order and use &quot;File claim&quot;</p>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-[#F5F5F5] p-3 space-y-3">
              {claims.map((c) => (
                <div key={c.id} className="bg-[#FAFAFA] rounded-[12px] border border-[#EEEEEE] p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <p className="text-[14px] font-bold">{c.order.orderNumber}</p>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#F5F5F5]">{c.status}</span>
                  </div>
                  <p className="text-[12px] capitalize text-[#7C7C7C]">{c.type}</p>
                  {c.amount && <p className="text-[13px] font-bold">₹{c.amount}</p>}
                  {c.status === 'pending' && (
                    <p className="text-[11px] text-amber-600 font-semibold">Awaiting platform review</p>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                    <th className="px-5 py-3 text-left">Order</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F5]">
                  {claims.map((c) => (
                    <tr key={c.id}>
                      <td className="px-5 py-3 font-bold">{c.order.orderNumber}</td>
                      <td className="px-4 py-3 capitalize">{c.type}</td>
                      <td className="px-4 py-3 capitalize">{c.status}</td>
                      <td className="px-4 py-3 text-right">{c.amount ? `₹${c.amount}` : '—'}</td>
                      <td className="px-4 py-3 text-center text-[11px] text-[#7C7C7C]">
                        {c.status === 'pending' ? 'Awaiting platform review' : c.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
