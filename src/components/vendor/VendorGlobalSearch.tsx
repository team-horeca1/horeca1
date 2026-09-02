'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface SearchResults {
  products: Array<{ id: string; name: string; sku: string | null }>;
  orders: Array<{ id: string; orderNumber: string }>;
  customers: Array<{ id: string; name: string | null }>;
}

export function VendorGlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/v1/vendor/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      if (json.success) setResults(json.data);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const hasResults = results && (results.products.length + results.orders.length + results.customers.length > 0);

  return (
    <div ref={ref} className="relative group w-full max-w-[520px]">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={18} />
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search products, orders, customers…"
        className="w-full bg-[#F5F5F5] border border-[#EEEEEE] rounded-[14px] py-3 pl-11 pr-4 text-[14px] outline-none transition-all placeholder:text-[#AEAEAE] font-medium focus:border-primary/40 focus:bg-white focus:shadow-sm"
      />
      {open && hasResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#EEEEEE] rounded-[12px] shadow-lg z-50 max-h-[320px] overflow-y-auto p-2">
          {results!.products.map((p) => (
            <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F5F5F5] rounded-lg" onClick={() => { router.push('/vendor/products'); setOpen(false); }}>
              Product: {p.name} {p.sku ? `(${p.sku})` : ''}
            </button>
          ))}
          {results!.orders.map((o) => (
            <button key={o.id} type="button" className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F5F5F5] rounded-lg" onClick={() => { router.push(`/vendor/orders/${o.id}`); setOpen(false); }}>
              Order: {o.orderNumber}
            </button>
          ))}
          {results!.customers.map((c) => (
            <button key={c.id} type="button" className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F5F5F5] rounded-lg" onClick={() => { router.push('/vendor/customers'); setOpen(false); }}>
              Customer: {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
