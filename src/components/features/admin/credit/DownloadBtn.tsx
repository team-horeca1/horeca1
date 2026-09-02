'use client';

import { Download } from 'lucide-react';

export function DownloadBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 h-[40px] px-4 rounded-[10px] bg-[#F8E8EC] text-[#6B1D2E] text-[13px] font-bold hover:bg-[#6B1D2E] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
    >
      <Download size={15} /> Download CSV
    </button>
  );
}
