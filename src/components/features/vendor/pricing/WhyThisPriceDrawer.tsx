'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, Loader2, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { inr } from './types';

type ExplainData = {
  unitPrice: number;
  source: string;
  excluded: boolean;
  priceListName?: string;
  ladder: Array<{ level: string; matched: boolean; detail?: string; priceListName?: string }>;
};

interface Props {
  open: boolean;
  onClose: () => void;
  customerId: string | null;
  productId: string | null;
  productLabel?: string;
}

export function WhyThisPriceDrawer({ open, onClose, customerId, productId, productLabel }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExplainData | null>(null);

  const load = useCallback(async () => {
    if (!open || !customerId || !productId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ customerId, productId });
      const res = await fetch(`/api/v1/vendor/price-lists/explain?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to explain price');
      setData(json.data as ExplainData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load explanation');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [open, customerId, productId, onClose]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[420px] h-full bg-white shadow-2xl flex flex-col">
        <div className="p-5 border-b border-[#E9E3DD] flex items-start justify-between">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#F8E8EC] text-primary flex items-center justify-center">
              <HelpCircle size={20} />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-[#181725]">Why this price?</h2>
              {productLabel && <p className="text-[12px] text-[#7C7C7C] mt-0.5">{productLabel}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[#FAF7F2]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-[#7C7C7C] py-12 justify-center">
              <Loader2 className="animate-spin" size={18} /> Loading…
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="p-4 rounded-[12px] bg-[#FAF7F2] border border-[#E9E3DD]">
                <div className="text-[12px] text-[#7C7C7C]">Effective unit price (ex-GST)</div>
                <div className="text-[28px] font-bold text-[#181725] tabular-nums">{inr(data.unitPrice)}</div>
                <div className="text-[12px] text-[#7C7C7C] mt-1">
                  Source: <span className="font-medium text-[#181725]">{data.priceListName ?? data.source}</span>
                  {data.excluded && ' · using base fallback'}
                </div>
              </div>

              <div>
                <h3 className="text-[13px] font-bold text-[#181725] mb-2">Resolution ladder</h3>
                <ol className="space-y-2">
                  {data.ladder.map((step, i) => (
                    <li
                      key={`${step.level}-${i}`}
                      className={cn(
                        'p-3 rounded-[12px] border text-[12px]',
                        step.matched ? 'border-primary/30 bg-[#F8E8EC]/30' : 'border-[#E9E3DD]',
                      )}
                    >
                      <div className="font-semibold text-[#181725] capitalize">{step.level.replace(/_/g, ' ')}</div>
                      {step.detail && <div className="text-[#7C7C7C] mt-0.5">{step.detail}</div>}
                      {step.priceListName && (
                        <div className="text-primary font-medium mt-1">{step.priceListName}</div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[#7C7C7C]">Select a customer and product to explain pricing.</p>
          )}
        </div>
      </div>
    </div>
  );
}
