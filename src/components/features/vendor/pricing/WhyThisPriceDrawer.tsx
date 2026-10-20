'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, Loader2, HelpCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { inr, type CustomerTarget } from './types';

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
  customers?: CustomerTarget[];
  products?: Array<{ id: string; name: string; sku?: string | null }>;
  onCustomerChange?: (id: string) => void;
  onProductChange?: (id: string) => void;
}

export function WhyThisPriceDrawer({ open, onClose, customerId, productId, customers: customersProp, products, onCustomerChange, onProductChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExplainData | null>(null);
  const [fetchedCustomers, setFetchedCustomers] = useState<CustomerTarget[]>([]);
  const [selCustomer, setSelCustomer] = useState<string>('');
  const [selProduct, setSelProduct] = useState<string>('');

  const customers = customersProp && customersProp.length > 0 ? customersProp : fetchedCustomers;

  useEffect(() => {
    if (!open) return;
    Promise.resolve().then(() => {
      setSelCustomer(customerId ?? '');
      setSelProduct(productId ?? '');
    });
  }, [open, customerId, productId]);

  useEffect(() => {
    if (!open || (customersProp && customersProp.length > 0)) return;
    let cancelled = false;
    fetch('/api/v1/vendor/pricing-targets')
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.success) setFetchedCustomers(j.data.customers as CustomerTarget[]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, customersProp]);

  // Default to first customer/product so an answer shows immediately
  useEffect(() => {
    if (!open) return;
    if (!selCustomer && customers.length > 0) {
      const id = customers[0].userId;
      Promise.resolve().then(() => { setSelCustomer(id); onCustomerChange?.(id); });
    }
    if (!selProduct && products && products.length > 0) {
      const id = products[0].id;
      Promise.resolve().then(() => { setSelProduct(id); onProductChange?.(id); });
    }
  }, [open, selCustomer, selProduct, customers, products, onCustomerChange, onProductChange]);

  const load = useCallback(async () => {
    if (!open || !selCustomer || !selProduct) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ customerId: selCustomer, productId: selProduct });
      const res = await fetch(`/api/v1/vendor/price-lists/explain?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to explain price');
      setData(json.data as ExplainData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load explanation');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [open, selCustomer, selProduct]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  if (!open) return null;

  const winningIdx = data?.ladder.findIndex((s) => s.matched && s.priceListName && (data.priceListName ? s.priceListName === data.priceListName : true)) ?? -1;
  const productName = products?.find((p) => p.id === selProduct)?.name;
  const customerName = customers.find((c) => c.userId === selCustomer)?.label;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[440px] h-full bg-white shadow-2xl flex flex-col" role="dialog" aria-label="Why this price?">
        <div className="p-5 border-b border-[#E9E3DD] flex items-start justify-between">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#F8E8EC] text-primary flex items-center justify-center shrink-0">
              <HelpCircle size={20} />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-[#181725]">Why this price?</h2>
              <p className="text-[12px] text-[#7C7C7C] mt-0.5">Pick any customer + product to see exactly which price list wins and why.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[#FAF7F2]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 pb-3 space-y-3 border-b border-[#E9E3DD] bg-[#FAF7F2]">
          <label className="block text-[12px] font-semibold text-[#181725]">Customer
            <select aria-label="Explain customer" value={selCustomer} onChange={(e) => { setSelCustomer(e.target.value); onCustomerChange?.(e.target.value); }} className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] bg-white font-normal">
              <option value="">Select a customer…</option>
              {customers.map((c) => <option key={c.userId} value={c.userId}>{c.label}</option>)}
            </select>
          </label>
          <label className="block text-[12px] font-semibold text-[#181725]">Product
            <select aria-label="Explain product" value={selProduct} onChange={(e) => { setSelProduct(e.target.value); onProductChange?.(e.target.value); }} className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] bg-white font-normal">
              <option value="">Select a product…</option>
              {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
            </select>
          </label>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-[#7C7C7C] py-12 justify-center">
              <Loader2 className="animate-spin" size={18} /> Checking price rules…
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="p-4 rounded-[12px] bg-[#FAF7F2] border border-[#E9E3DD]">
                <div className="text-[12px] text-[#7C7C7C]">{customerName ?? 'This customer'} pays (ex-GST)</div>
                <div className="text-[28px] font-bold text-[#181725] tabular-nums">{inr(data.unitPrice)}</div>
                <div className="text-[12px] text-[#7C7C7C] mt-1">
                  For <span className="font-medium text-[#181725]">{productName ?? 'selected product'}</span> · Source: <span className="font-medium text-primary">{data.priceListName ?? data.source}</span>
                  {data.excluded && ' · This product is hidden for this customer, so Base fallback is shown'}
                </div>
              </div>

              <div>
                <h3 className="text-[13px] font-bold text-[#181725] mb-1">How we decided — checked in this order</h3>
                <p className="text-[11px] text-[#7C7C7C] mb-2">The first matching rule below wins. More specific rules (a named customer) beat broad ones (pincode).</p>
                <ol className="space-y-2">
                  {data.ladder.map((step, i) => {
                    const isWinner = i === winningIdx || (winningIdx === -1 && step.matched && !!step.priceListName);
                    return (
                      <li
                        key={`${step.level}-${i}`}
                        className={cn(
                          'p-3 rounded-[12px] border text-[12px]',
                          isWinner ? 'border-primary/40 bg-[#F8E8EC]/50' : step.matched ? 'border-[#E9E3DD] bg-white' : 'border-[#E9E3DD] opacity-60',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-[#181725] capitalize">{i + 1}. {step.level.replace(/_/g, ' ').replace('pricelist:', '')}</div>
                          {isWinner && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary"><CheckCircle2 size={12} /> Winning rule</span>}
                          {!step.matched && <span className="text-[10px] text-[#7C7C7C]">No match</span>}
                        </div>
                        {step.detail && <div className="text-[#7C7C7C] mt-0.5">{step.detail}</div>}
                        {step.priceListName && (
                          <div className="text-primary font-medium mt-1">{step.priceListName}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[#7C7C7C]">Choose a customer and a product above — the price and the rule that produced it will appear here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
