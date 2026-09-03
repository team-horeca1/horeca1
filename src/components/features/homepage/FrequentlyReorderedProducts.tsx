'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStableSession } from '@/hooks/useStableSession';
import { useCart } from '@/context/CartContext';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { VendorProduct } from '@/types';

interface OrderItemRow {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string | number;
  product?: { imageUrl: string | null; images: string[] } | null;
}

interface OrderRow {
  id: string;
  vendorId?: string;
  vendor?: { id: string; businessName: string; logoUrl: string | null };
  items: OrderItemRow[];
}

interface FreqProduct {
  productId: string;
  vendorId: string;
  name: string;
  image: string | null;
  price: number;
  count: number;
  vendorName: string;
}

function toMinimalProduct(p: FreqProduct): VendorProduct {
  const price = p.price;
  return {
    id: p.productId,
    name: p.name,
    description: '',
    price,
    images: p.image ? [p.image] : [],
    category: '',
    packSize: '',
    unit: '',
    stock: 999,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    vendorId: p.vendorId,
    vendorName: p.vendorName,
    bulkPrices: [],
    creditBadge: false,
    minOrderQuantity: 1,
    frequentlyOrdered: true,
  };
}

export function FrequentlyReorderedProducts() {
  const { isAuthenticated } = useStableSession();
  const { addToCart } = useCart();
  const [products, setProducts] = useState<FreqProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      queueMicrotask(() => {
        setProducts([]);
        setLoading(false);
      });
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch('/api/v1/orders?limit=20', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const orders: OrderRow[] = json?.data?.orders ?? [];
        const freq = new Map<string, FreqProduct>();

        for (const order of orders) {
          const vendorId = order.vendorId || order.vendor?.id;
          if (!vendorId) continue;
          for (const item of order.items ?? []) {
            if (!item.productId) continue;
            const existing = freq.get(item.productId);
            const img = item.product?.imageUrl || item.product?.images?.[0] || null;
            const price = Number(item.unitPrice) || 0;
            if (existing) {
              existing.count += item.quantity || 1;
            } else {
              freq.set(item.productId, {
                productId: item.productId,
                vendorId,
                name: item.productName || 'Product',
                image: img,
                price,
                count: item.quantity || 1,
                vendorName: order.vendor?.businessName || 'Vendor',
              });
            }
          }
        }

        const top = Array.from(freq.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);

        setProducts(top);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const handleAdd = (p: FreqProduct) => {
    setAddingId(p.productId);
    try {
      addToCart(toMinimalProduct(p), 1);
      toast.success(`Added ${p.name}`);
    } catch {
      toast.error('Could not add to cart');
    } finally {
      queueMicrotask(() => setAddingId(null));
    }
  };

  if (!isAuthenticated || (!loading && products.length === 0)) return null;

  return (
    <section className="w-full py-4 md:py-6 bg-background">
      <div className="max-w-[var(--container-max)] mx-auto overflow-hidden">
        <div className="px-4 md:px-[var(--container-padding)] mb-2 md:mb-3">
          <SectionHeader
            title="Frequently Reordered"
            subtitle="Your kitchen staples, one tap away"
            actionLabel="Orders →"
            actionHref="/orders"
          />
        </div>

        <div className="overflow-x-auto no-scrollbar scroll-smooth">
          <div className="flex gap-2.5 md:gap-3 px-4 md:px-[var(--container-padding)] py-1 w-max">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[96px] md:w-[110px] h-[128px] rounded-[10px] bg-white border border-divider animate-pulse shrink-0"
                  />
                ))
              : products.map((p) => (
                  <div
                    key={p.productId}
                    className="w-[96px] md:w-[110px] shrink-0 bg-white border border-divider rounded-[10px] p-1.5 shadow-cdl-1"
                  >
                    <Link href={`/product/${p.productId}`} className="block">
                      <div className="relative h-11 md:h-12 rounded-md bg-ivory overflow-hidden mb-1.5">
                        {p.image ? (
                          <Image src={p.image} alt="" fill className="object-contain p-0.5" sizes="96px" />
                        ) : (
                          <div className="w-full h-full bg-[#E9E3DD]" />
                        )}
                      </div>
                      <p className="text-[10px] md:text-[11px] font-medium text-[#1C1C1C] line-clamp-2 leading-tight min-h-[2.2em]">
                        {p.name}
                      </p>
                    </Link>
                    <div className="flex items-center justify-between gap-1 mt-1.5">
                      <span className="text-[11px] md:text-[12px] font-bold text-primary tabular-nums">
                        ₹{Math.round(p.price).toLocaleString('en-IN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAdd(p)}
                        disabled={addingId === p.productId}
                        className="size-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all disabled:opacity-60"
                        aria-label={`Add ${p.name} to cart`}
                      >
                        {addingId === p.productId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Plus size={14} strokeWidth={2.5} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </section>
  );
}
