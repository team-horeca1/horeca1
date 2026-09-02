'use client';

import { useRef, useState } from 'react';
import { Download, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface ImportResult {
  created: number;
  updated: number;
  totalRows: number;
  errors: Array<{ row: number; message: string }>;
}

export default function BrandProductImportModal({ open, onClose, onComplete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  const downloadTemplate = () => {
    window.open('/api/v1/brand/products/import?template=true', '_blank');
  };

  const downloadExport = () => {
    window.open('/api/v1/brand/products/export', '_blank');
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/brand/products/import', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Import failed');
      }
      const data = json.data as ImportResult;
      setResult(data);
      if (data.errors.length === 0) {
        toast.success(`Imported ${data.created + data.updated} product(s)`);
        onComplete();
      } else {
        toast.warning(`Imported with ${data.errors.length} error(s)`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-[16px] w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
          <h2 className="text-[16px] font-bold text-[#181725]">Import Brand Products</h2>
          <button type="button" onClick={handleClose} className="p-1 rounded hover:bg-[#F5F5F5]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[13px] text-[#7C7C7C]">
            Upload the Brand Store Excel template. Columns: Item Name, SKU, Parent Category, Sub-Category,
            Usage unit (pack size), Unit Name (container), Image URL, Alias Name.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold border border-[#EEEEEE] rounded-[8px] hover:bg-[#F8F9FB]"
            >
              <Download size={14} /> Download template
            </button>
            <button
              type="button"
              onClick={downloadExport}
              className="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold border border-[#EEEEEE] rounded-[8px] hover:bg-[#F8F9FB]"
            >
              <Download size={14} /> Export current catalog
            </button>
          </div>

          <div
            className="border-2 border-dashed border-[#EEEEEE] rounded-[12px] p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => !uploading && fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            ) : (
              <>
                <Upload className="w-8 h-8 text-[#AEAEAE] mx-auto mb-2" />
                <p className="text-[13px] font-semibold text-[#181725]">Click to upload .xlsx</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
            />
          </div>

          {result && (
            <div className="rounded-[10px] bg-[#F8F9FB] p-4 text-[13px] space-y-2">
              <p>
                <span className="font-bold">{result.created}</span> created,{' '}
                <span className="font-bold">{result.updated}</span> updated of{' '}
                <span className="font-bold">{result.totalRows}</span> rows.
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {result.errors.map((err) => (
                    <p key={`${err.row}-${err.message}`} className="text-red-600">
                      Row {err.row}: {err.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
