'use client';

import { useRef } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VendorDocument } from './types';
import { DOC_TYPE_LABELS } from './types';

export interface DocumentsTabProps {
  documents: VendorDocument[];
  docType: VendorDocument['type'];
  setDocType: (v: VendorDocument['type']) => void;
  docFile: File | null;
  setDocFile: (f: File | null) => void;
  uploadingDoc: boolean;
  onUpload: () => void;
}

export function DocumentsTab({ documents, docType, setDocType, docFile, setDocFile, uploadingDoc, onUpload }: DocumentsTabProps) {
  const docFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 pb-1 border-b border-[#F5F5F5]">
        <FileText size={18} className="text-[#299E60]" />
        <h2 className="text-[16px] font-bold text-[#181725]">Verification documents</h2>
      </div>
      <p className="text-[13px] text-[#7C7C7C]">FSSAI, GST, PAN, and bank proof for store verification.</p>

      {documents.length > 0 && (
        <div className="divide-y divide-[#F5F5F5] border border-[#EEEEEE] rounded-[10px] overflow-hidden">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
              <FileText size={16} className="text-[#AEAEAE] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[#181725] truncate">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</p>
                <p className="text-[11px] text-[#AEAEAE] truncate">{doc.fileName}</p>
              </div>
              {doc.status === 'verified' ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-[5px] shrink-0"><CheckCircle2 size={11} /> Verified</span>
              ) : doc.status === 'rejected' ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-[5px] shrink-0"><AlertCircle size={11} /> Rejected</span>
              ) : (
                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-[5px] shrink-0">Pending</span>
              )}
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-[#299E60] hover:underline shrink-0">View</a>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select value={docType} onChange={(e) => setDocType(e.target.value as VendorDocument['type'])} className="h-[44px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px] bg-white outline-none focus:border-[#299E60]/40">
          {Object.entries(DOC_TYPE_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </select>
        <input ref={docFileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} className="hidden" />
        <button type="button" onClick={() => docFileRef.current?.click()} className="h-[44px] flex items-center gap-2 border border-dashed border-[#299E60]/40 rounded-[10px] px-4 text-[14px] text-left hover:bg-[#EEF8F1]/40">
          <FileText size={15} className="text-[#299E60] shrink-0" />
          <span className={cn('truncate', docFile ? 'text-[#181725] font-bold' : 'text-[#AEAEAE]')}>{docFile ? docFile.name : 'Choose file…'}</span>
        </button>
      </div>
      <p className="text-[11px] text-[#AEAEAE]">PDF, JPG, PNG, WebP · max 10MB</p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onUpload} disabled={uploadingDoc || !docFile} className="flex items-center gap-2 px-5 py-2.5 bg-[#299E60] text-white text-[13px] font-bold rounded-[10px] disabled:opacity-50">
          {uploadingDoc ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Upload document
        </button>
        {docFile && !uploadingDoc && (
          <button type="button" onClick={() => { setDocFile(null); if (docFileRef.current) docFileRef.current.value = ''; }} className="flex items-center gap-1 text-[12px] font-bold text-[#AEAEAE] hover:text-[#EF4444]">
            <X size={13} /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
