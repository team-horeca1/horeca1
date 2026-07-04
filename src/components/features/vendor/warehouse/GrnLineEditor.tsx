'use client';

import React, { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { WarehouseLookupInput } from './WarehouseLookupInput';
import type { GrnLine, ProductLookup } from './warehouseConstants';

interface Props {
  lines: GrnLine[];
  onChange: (lines: GrnLine[]) => void;
}

export function GrnLineEditor({ lines, onChange }: Props) {
  const [pickerProduct, setPickerProduct] = useState<ProductLookup | null>(null);
  const [pickerQty, setPickerQty] = useState('1');

  const addLine = () => {
    if (!pickerProduct) return;
    const qty = Math.max(1, parseInt(pickerQty, 10) || 1);
    const existing = lines.find((l) => l.productId === pickerProduct.id);
    if (existing) {
      onChange(
        lines.map((l) =>
          l.productId === pickerProduct.id ? { ...l, qty: l.qty + qty } : l,
        ),
      );
    } else {
      onChange([
        ...lines,
        { productId: pickerProduct.id, productName: pickerProduct.name, qty },
      ]);
    }
    setPickerProduct(null);
    setPickerQty('1');
  };

  const updateQty = (productId: string, delta: number) => {
    onChange(
      lines
        .map((l) =>
          l.productId === productId ? { ...l, qty: Math.max(1, l.qty + delta) } : l,
        )
        .filter((l) => l.qty > 0),
    );
  };

  const removeLine = (productId: string) => {
    onChange(lines.filter((l) => l.productId !== productId));
  };

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <WarehouseLookupInput
            type="products"
            value={pickerProduct}
            onChange={(v) => setPickerProduct(v as ProductLookup | null)}
          />
        </div>
        <input
          type="number"
          min={1}
          value={pickerQty}
          onChange={(e) => setPickerQty(e.target.value)}
          className="w-full sm:w-[80px] h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]"
          placeholder="Qty"
        />
        <button
          type="button"
          onClick={addLine}
          disabled={!pickerProduct}
          className="h-[40px] px-4 rounded-[10px] bg-[#181725] text-white text-[13px] font-bold disabled:opacity-40"
        >
          Add line
        </button>
      </div>

      {lines.length > 0 ? (
        <div className="border border-[#EEEEEE] rounded-[10px] divide-y divide-[#F5F5F5]">
          {lines.map((line) => (
            <div key={line.productId} className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#181725] truncate">{line.productName}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => updateQty(line.productId, -1)} className="w-7 h-7 rounded border border-[#EEEEEE] flex items-center justify-center">
                  <Minus size={12} />
                </button>
                <span className="w-8 text-center text-[13px] font-bold">{line.qty}</span>
                <button type="button" onClick={() => updateQty(line.productId, 1)} className="w-7 h-7 rounded border border-[#EEEEEE] flex items-center justify-center">
                  <Plus size={12} />
                </button>
                <button type="button" onClick={() => removeLine(line.productId)} className="w-7 h-7 rounded text-[#E74C3C] flex items-center justify-center ml-1">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          <div className="px-3 py-2 bg-[#FAFAFA] text-[12px] font-bold text-[#7C7C7C]">
            {lines.length} SKU{lines.length !== 1 ? 's' : ''} · {totalQty} units total
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-[#AEAEAE]">Add products to receive into stock.</p>
      )}
    </div>
  );
}
