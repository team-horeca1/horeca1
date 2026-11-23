'use client';

import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';

const STORAGE_KEY = 'admin-credit-explainer-dismissed';

export function AdminCreditExplainer() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  if (dismissed) return null;

  return (
    <div className="bg-[#EFF6FF] border border-[#DBEAFE] rounded-[14px] px-4 py-3 flex gap-3 items-start">
      <Info size={18} className="text-[#1E40AF] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#1C1C1C]">DiSCCO is owed to Horeca1. Supplier credit is owed to that supplier.</p>
      </div>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, '1');
          setDismissed(true);
        }}
        className="shrink-0 p-1 rounded-[6px] text-[#1E40AF] hover:bg-[#DBEAFE] transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
