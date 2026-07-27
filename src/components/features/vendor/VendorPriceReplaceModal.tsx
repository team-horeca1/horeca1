'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload, FileDown, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function VendorPriceReplaceModal({ open, onClose, onComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    updated: number;
    errors: Array<{ row: number; message: string }>;
    errorReport?: string;
  } | null>(null);

  if (!open) return null;

  const downloadTemplate = () => {
    window.open('/api/v1/vendor/products/price-update?template=true', '_blank');
  };

  const onFile = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/v1/vendor/products/price-update', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Upload failed');
      const data = json.data as {
        updated: number;
        errors: Array<{ row: number; message: string }>;
        errorReport?: string;
      };
      setResult(data);
      if (data.updated > 0) {
        toast.success(`Replace Prices: ${data.updated} product(s) updated`);
        onComplete();
      }
      if (data.errors?.length) {
        toast.error(`${data.errors.length} row(s) had errors`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const downloadErrorReport = () => {
    if (!result?.errorReport) return;
    const blob = new Blob([result.errorReport], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'price_update_errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[480px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
          <div>
            <h2 className="text-[16px] font-bold text-[#181725]">Replace Prices</h2>
            <p className="text-[12px] text-[#7C7C7C] mt-0.5">
              Updates selling price and bulk slabs only — not stock or product names.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F5F5F5]">
            <X size={16} className="text-[#AEAEAE]" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <button
            type="button"
            onClick={downloadTemplate}
            className="w-full h-10 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#181725] hover:bg-[#F5F5F5] flex items-center justify-center gap-2"
          >
            <FileDown size={14} />
            Download price template
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
            {uploading ? 'Applying…' : 'Upload & Replace Prices'}
          </button>
          {result && (
            <div className="rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] p-3 text-[12px] space-y-1">
              <p className="font-bold text-[#181725]">Updated: {result.updated}</p>
              {result.errors.length > 0 && (
                <>
                  <p className="text-[#E74C3C] font-semibold">Errors: {result.errors.length}</p>
                  <ul className="max-h-28 overflow-y-auto text-[#7C7C7C] space-y-0.5">
                    {result.errors.slice(0, 8).map((e) => (
                      <li key={`${e.row}-${e.message}`}>
                        Row {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
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
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#EEEEEE] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-[8px] text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
