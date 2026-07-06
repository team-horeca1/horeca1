'use client';

import { Save } from 'lucide-react';

interface Props {
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  label?: string;
}

export function VendorSettingsSaveBar({ saving, saved, onSave, label = 'Save changes' }: Props) {
  return (
    <div className="sticky bottom-0 z-10 -mx-6 px-6 py-4 mt-6 bg-white/95 backdrop-blur border-t border-[#EEEEEE] flex items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="h-[44px] px-8 bg-[#299E60] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#238a54] transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
      >
        <Save size={16} />
        {saving ? 'Saving...' : label}
      </button>
      {saved && <span className="text-[14px] font-bold text-[#299E60] animate-pulse">Saved successfully!</span>}
    </div>
  );
}
