'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload, FileDown, X, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type PreviewItem = {
  row: number;
  sku: string;
  name: string;
  productId: string | null;
  moq: number;
  basePrice: number;
  taxPercent: number;
  gross: number;
  slabs: Array<{ minQty: number; price: number }>;
  matched: boolean;
  error: string | null;
  skip: boolean;
};

function calcGross(taxable: number, taxPercent: number): number {
  return Math.round(taxable * (1 + (taxPercent || 0) / 100) * 100) / 100;
}

export default function VendorPriceReplaceModal({ open, onClose, onComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [result, setResult] = useState<{
    updated: number;
    errors: Array<{ row: number; message: string }>;
    errorReport?: string;
  } | null>(null);

  if (!open) return null;

  const reset = () => {
    setStep('upload');
    setItems([]);
    setResult(null);
    setUploading(false);
    setCommitting(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    window.open('/api/v1/vendor/products/price-update', '_blank');
  };

  const onFile = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'preview');
      const res = await fetch('/api/v1/vendor/products/price-update', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Upload failed');
      const data = json.data as {
        items: PreviewItem[];
        matched: number;
        errored: number;
      };
      setItems(
        (data.items || []).map((i) => ({
          ...i,
          gross: calcGross(Number(i.basePrice) || 0, Number(i.taxPercent) || 0),
        }))
      );
      setStep('review');
      if (data.errored > 0) {
        toast.message(`Preview ready — ${data.matched} matched, ${data.errored} with issues`);
      } else {
        toast.success(`Preview ready — ${data.matched} product(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const updateItem = (row: number, patch: Partial<PreviewItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.row !== row) return item;
        const next = { ...item, ...patch };
        next.gross = calcGross(Number(next.basePrice) || 0, Number(next.taxPercent) || 0);
        return next;
      })
    );
  };

  const readyCount = items.filter((i) => i.matched && !i.skip && !i.error).length;

  const commit = async () => {
    const payload = items
      .filter((i) => i.matched && !i.skip && !i.error)
      .map((i) => ({
        row: i.row,
        sku: i.sku,
        moq: i.moq,
        basePrice: Number(i.basePrice),
        taxPercent: Number(i.taxPercent),
        slabs: i.slabs || [],
      }));

    if (payload.length === 0) {
      toast.error('No valid rows to update');
      return;
    }

    setCommitting(true);
    try {
      const res = await fetch('/api/v1/vendor/products/price-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: 'commit', items: payload }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Update failed');
      const data = json.data as {
        updated: number;
        errors: Array<{ row: number; message: string }>;
        errorReport?: string;
      };
      setResult(data);
      setStep('done');
      if (data.updated > 0) {
        toast.success(`Price Bulk Update: ${data.updated} product(s) updated`);
        onComplete();
      }
      if (data.errors?.length) {
        toast.error(`${data.errors.length} row(s) had errors`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setCommitting(false);
    }
  };

  const downloadErrorReport = () => {
    if (!result?.errorReport) return;
    const blob = new Blob([result.errorReport], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'price_bulk_update_errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/40 p-4">
      <div
        className={`bg-white rounded-[16px] w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          step === 'review' ? 'max-w-[920px]' : 'max-w-[480px]'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE] shrink-0">
          <div>
            <h2 className="text-[16px] font-bold text-[#181725]">Price Bulk Update</h2>
            <p className="text-[12px] text-[#7C7C7C] mt-0.5">
              {step === 'upload' &&
                'Download current prices, edit Main Price + Tax % in the sheet (Gross auto-calcs), then upload to review before applying. Products without a SKU use product id.'}
              {step === 'review' &&
                'Review and edit Main Price / Tax %. Gross updates automatically. Skip bad rows, then confirm.'}
              {step === 'done' && 'Update complete.'}
            </p>
          </div>
          <button type="button" onClick={handleClose} className="p-1.5 rounded-lg hover:bg-[#F5F5F5]">
            <X size={16} className="text-[#AEAEAE]" />
          </button>
        </div>

        {step === 'upload' && (
          <div className="p-5 space-y-3">
            <button
              type="button"
              onClick={downloadTemplate}
              className="w-full h-10 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#181725] hover:bg-[#F5F5F5] flex items-center justify-center gap-2"
            >
              <FileDown size={14} />
              Download current prices
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="w-full h-11 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {uploading ? 'Reading file…' : 'Upload for preview'}
            </button>
            <p className="text-[11px] text-[#7C7C7C] leading-relaxed">
              Edit <span className="font-semibold text-[#181725]">Main Price</span> (taxable) and{' '}
              <span className="font-semibold text-[#181725]">Tax %</span> only. Gross columns use Excel
              formulas and are ignored on upload. Leave bulk slabs blank for a simple price update.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="w-full h-10 text-[13px] font-bold text-[#7C7C7C] hover:text-[#181725]"
            >
              Close
            </button>
          </div>
        )}

        {step === 'review' && (
          <>
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#FAFAFA] border-b border-[#EEEEEE]">
                  <tr className="text-left text-[#7C7C7C]">
                    <th className="px-3 py-2 font-semibold w-10">Skip</th>
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">SKU</th>
                    <th className="px-3 py-2 font-semibold">Product</th>
                    <th className="px-3 py-2 font-semibold">MOQ</th>
                    <th className="px-3 py-2 font-semibold">Main Price</th>
                    <th className="px-3 py-2 font-semibold">Tax %</th>
                    <th className="px-3 py-2 font-semibold">Gross</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const disabled = !item.matched || !!item.error;
                    return (
                      <tr
                        key={`${item.row}-${item.sku}`}
                        className={`border-b border-[#F0F0F0] ${
                          item.skip || item.error ? 'bg-[#FFF8F8]' : ''
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={item.skip}
                            disabled={disabled && !item.matched}
                            onChange={(e) => updateItem(item.row, { skip: e.target.checked })}
                            className="accent-[#299E60]"
                          />
                        </td>
                        <td className="px-3 py-2 text-[#7C7C7C]">{item.row}</td>
                        <td className="px-3 py-2 font-mono text-[11px] max-w-[140px] truncate" title={item.sku}>
                          {item.sku || '—'}
                        </td>
                        <td className="px-3 py-2 max-w-[180px] truncate" title={item.name}>
                          {item.name || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            disabled={item.skip || disabled}
                            value={item.moq}
                            onChange={(e) =>
                              updateItem(item.row, { moq: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className="w-16 h-8 rounded border border-[#EEEEEE] px-2 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={item.skip || disabled}
                            value={item.basePrice}
                            onChange={(e) =>
                              updateItem(item.row, { basePrice: Number(e.target.value) || 0 })
                            }
                            className="w-24 h-8 rounded border border-[#EEEEEE] px-2 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={item.skip || disabled}
                            value={item.taxPercent}
                            onChange={(e) =>
                              updateItem(item.row, { taxPercent: Number(e.target.value) || 0 })
                            }
                            className="w-16 h-8 rounded border border-[#EEEEEE] px-2 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold text-[#181725]">
                          {calcGross(item.basePrice, item.taxPercent).toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          {item.error ? (
                            <span className="text-[#E74C3C] font-semibold">{item.error}</span>
                          ) : item.matched ? (
                            <span className="text-[#299E60] font-semibold">Ready</span>
                          ) : (
                            <span className="text-[#7C7C7C]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4 border-t border-[#EEEEEE] flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={reset}
                className="h-10 px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#181725] hover:bg-[#F5F5F5]"
              >
                Back
              </button>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#7C7C7C]">
                  {readyCount} product{readyCount === 1 ? '' : 's'} will update
                </span>
                <button
                  type="button"
                  disabled={committing || readyCount === 0}
                  onClick={() => void commit()}
                  className="h-10 px-5 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] flex items-center gap-2 disabled:opacity-60"
                >
                  {committing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  {committing ? 'Updating…' : 'Confirm update'}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <div className="p-5 space-y-3">
            <div className="rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] p-3 text-[12px] space-y-1">
              <p className="font-bold text-[#181725]">Updated: {result.updated}</p>
              {result.errors.length > 0 && (
                <>
                  <p className="text-[#E74C3C] font-semibold">Errors: {result.errors.length}</p>
                  {result.errorReport && (
                    <button
                      type="button"
                      onClick={downloadErrorReport}
                      className="text-[#299E60] font-bold underline"
                    >
                      Download error report
                    </button>
                  )}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-full h-10 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
