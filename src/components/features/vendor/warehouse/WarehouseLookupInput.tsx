'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrderLookup, ProductLookup } from './warehouseConstants';

interface Props {
  type: 'orders' | 'products';
  value: OrderLookup | ProductLookup | null;
  onChange: (value: OrderLookup | ProductLookup | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function WarehouseLookupInput({ type, value, onChange, placeholder, disabled }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderLookup[]>([]);
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) return;
    Promise.resolve().then(() => {
      if (type === 'orders') {
        const o = value as OrderLookup;
        setQ(o.orderNumber);
      } else {
        const p = value as ProductLookup;
        setQ(p.sku ? `${p.name} (${p.sku})` : p.name);
      }
    });
  }, [value, type]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/v1/vendor/warehouse/lookup?type=${type}&q=${encodeURIComponent(query)}`,
        );
        const json = await res.json();
        if (json.success) {
          if (type === 'orders') setOrders(json.data.orders ?? []);
          else setProducts(json.data.products ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, type, open]);

  const results = type === 'orders' ? orders : products;
  const displayLabel =
    value && type === 'orders'
      ? (value as OrderLookup).orderNumber
      : value && type === 'products'
        ? (value as ProductLookup).name
        : '';

  return (
    <div ref={ref} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={16} />
        <input
          type="text"
          value={open ? q : displayLabel || q}
          onChange={(e) => {
            setQ(e.target.value);
            onChange(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? (type === 'orders' ? 'Search order number…' : 'Search product name or SKU…')}
          disabled={disabled}
          className="w-full h-[40px] pl-9 pr-9 border border-[#EEEEEE] rounded-[10px] text-[13px] outline-none focus:border-primary/40 disabled:opacity-50"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQ('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#AEAEAE] hover:text-[#7C7C7C]"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#EEEEEE] rounded-[10px] shadow-lg max-h-[240px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 size={18} className="animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-[#AEAEAE]">
              {type === 'orders' ? 'No fulfillable orders found' : 'Type to search products'}
            </p>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-[#F5F5F5] border-b border-[#F5F5F5] last:border-0"
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  if (type === 'orders') setQ((item as OrderLookup).orderNumber);
                  else {
                    const p = item as ProductLookup;
                    setQ(p.sku ? `${p.name} (${p.sku})` : p.name);
                  }
                }}
              >
                {type === 'orders' ? (
                  <>
                    <span className="font-bold text-[#181725]">{(item as OrderLookup).orderNumber}</span>
                    <span className={cn('ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border', 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]')}>
                      {(item as OrderLookup).status.replace(/_/g, ' ')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-[#181725]">{(item as ProductLookup).name}</span>
                    {(item as ProductLookup).sku && (
                      <span className="ml-2 text-[11px] text-[#AEAEAE]">{(item as ProductLookup).sku}</span>
                    )}
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
