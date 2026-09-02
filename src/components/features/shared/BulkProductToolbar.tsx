'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, FileDown, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BulkWorkspaceTab = 'import' | 'spreadsheet' | null;

interface BulkProductToolbarProps {
  vendors?: { id: string; businessName: string }[];
  gridVendorId: string;
  onGridVendorChange: (id: string) => void;
  onImport: () => void;
  onSpreadsheet: () => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  spreadsheetLoading?: boolean;
  canWrite?: boolean;
  showVendorPicker?: boolean;
  /** When true, Spreadsheet is disabled until a vendor is selected (vendor portal). */
  requireVendorForSpreadsheet?: boolean;
  activeTab?: BulkWorkspaceTab;
}

/**
 * Bulk toolbar: vendor filter + spreadsheet on the left; import + export grouped on the right.
 */
export default function BulkProductToolbar({
  vendors = [],
  gridVendorId,
  onGridVendorChange,
  onImport,
  onSpreadsheet,
  onExportCsv,
  onExportXlsx,
  spreadsheetLoading = false,
  canWrite = true,
  showVendorPicker = false,
  requireVendorForSpreadsheet = false,
  activeTab = null,
}: BulkProductToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportOpen]);

  if (!canWrite) return null;

  const actionBtn = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    opts?: { active?: boolean; disabled?: boolean; title?: string },
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={opts?.disabled}
      title={opts?.title}
      className={cn(
        'h-[40px] px-4 rounded-[10px] text-[12px] font-bold flex items-center gap-2 transition-all border shrink-0',
        opts?.active
          ? 'bg-primary text-white border-primary shadow-sm'
          : 'bg-white text-[#181725] border-[#EEEEEE] hover:bg-[#F8F9FB] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-white',
      )}
    >
      {icon}
      {label}
    </button>
  );

  const spreadsheetDisabled = requireVendorForSpreadsheet && !gridVendorId;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[#EEEEEE] bg-[#F8F9FB] px-2 py-1.5"
      role="group"
      aria-label="Bulk product operations"
    >
      <span className="hidden lg:inline text-[10px] font-bold uppercase tracking-wider text-[#AEAEAE] px-2 shrink-0">
        Bulk
      </span>

      {showVendorPicker && (
        <>
          <select
            value={gridVendorId}
            onChange={(e) => onGridVendorChange(e.target.value)}
            className="h-[40px] min-w-[200px] max-w-[240px] px-3 border border-[#EEEEEE] rounded-[10px] text-[12px] font-semibold text-[#181725] bg-white"
            aria-label="Filter by vendor (optional)"
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.businessName}</option>
            ))}
          </select>
          <div className="hidden sm:block w-px h-7 bg-[#E5E7EB] shrink-0" aria-hidden />
        </>
      )}

      {actionBtn(
        'Spreadsheet',
        spreadsheetLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />,
        onSpreadsheet,
        {
          active: activeTab === 'spreadsheet',
          disabled: spreadsheetDisabled,
          title: spreadsheetDisabled ? 'Select a vendor first' : 'Edit products in a spreadsheet grid',
        },
      )}

      <div className="flex items-center gap-2 ml-auto shrink-0">
        {actionBtn('Import', <Upload size={14} />, onImport, { active: activeTab === 'import' })}

        <div className="relative shrink-0" ref={exportRef}>
        <button
          type="button"
          onClick={() => setExportOpen((o) => !o)}
          className="h-[40px] px-4 rounded-[10px] text-[12px] font-bold flex items-center gap-2 transition-all border bg-white text-[#181725] border-[#EEEEEE] hover:bg-white hover:border-[#D1D5DB] shadow-sm"
          title={gridVendorId ? 'Export this vendor’s listings' : 'Export all products (current filters)'}
        >
          <FileDown size={14} />
          Export
          <ChevronDown size={13} className={cn('transition-transform text-[#9CA3AF]', exportOpen && 'rotate-180')} />
        </button>
        {exportOpen && (
          <div className="absolute right-0 top-[46px] w-[200px] bg-white border border-[#EEEEEE] rounded-[12px] shadow-lg z-50 overflow-hidden">
            <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-[#AEAEAE] border-b border-[#F3F4F6]">
              {gridVendorId ? 'Vendor listings' : 'All products'}
            </p>
            <button
              type="button"
              onClick={() => { onExportXlsx(); setExportOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-[12px] font-semibold text-[#181725] hover:bg-[#F8F9FB] transition-colors"
            >
              <FileSpreadsheet size={15} className="text-[#3B82F6]" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => { onExportCsv(); setExportOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-[12px] font-semibold text-[#181725] hover:bg-[#F8F9FB] transition-colors border-t border-[#F3F4F6]"
            >
              <FileSpreadsheet size={15} className="text-primary" />
              CSV
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
