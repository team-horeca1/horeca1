'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';

interface OutletOption {
  id: string;
  name: string;
}

interface ProductOption {
  productId: string;
  name: string;
  qtyAvailable: number;
}

interface Props {
  fromOutletId: string;
  fromOutletName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function StockTransferModal({ fromOutletId, fromOutletName, onClose, onSuccess }: Props) {
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [toOutletId, setToOutletId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/vendor/outlets').then((r) => r.json()),
      fetch(`/api/v1/vendor/inventory?outletId=${fromOutletId}`).then((r) => r.json()),
    ])
      .then(([outJson, invJson]) => {
        if (outJson.success) {
          const list = (outJson.data.outlets as OutletOption[]).filter((o) => o.id !== fromOutletId);
          setOutlets(list);
          if (list[0]) setToOutletId(list[0].id);
        }
        if (invJson.success) {
          setProducts(
            (invJson.data as Array<{ productId: string; qtyAvailable: number; product: { name: string } }>)
              .filter((r) => r.qtyAvailable > 0)
              .map((r) => ({ productId: r.productId, name: r.product.name, qtyAvailable: r.qtyAvailable })),
          );
        }
      })
      .finally(() => setLoading(false));
  }, [fromOutletId]);

  const handleSubmit = async () => {
    if (!toOutletId || !productId || qty < 1) {
      toast.error('Select destination, product, and quantity');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/vendor/inventory/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromOutletId,
          toOutletId,
          items: [{ productId, quantity: qty }],
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Transfer failed');
      toast.success('Stock transferred');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-[14px] w-full max-w-md shadow-xl border border-[#EEEEEE]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-[#299E60]" />
            <h2 className="text-[16px] font-bold text-[#181725]">Transfer stock</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[12px] text-[#7C7C7C]">
            From: <span className="font-bold text-[#181725]">{fromOutletName ?? 'this warehouse'}</span>
          </p>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-[#299E60]" size={24} />
            </div>
          ) : (
            <>
              <div>
                <label className="text-[12px] font-bold text-[#181725]">To warehouse</label>
                <select
                  value={toOutletId}
                  onChange={(e) => setToOutletId(e.target.value)}
                  className="mt-1 w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]"
                >
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-bold text-[#181725]">Product</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="mt-1 w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]"
                >
                  <option value="">Select product</option>
                  {products.map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.name} ({p.qtyAvailable} avail.)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-bold text-[#181725]">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="mt-1 w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]"
                />
              </div>
            </>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="h-[40px] px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold">
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || loading}
            onClick={() => void handleSubmit()}
            className="h-[40px] px-4 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold disabled:opacity-50"
          >
            {submitting ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}
