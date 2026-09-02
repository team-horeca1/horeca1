'use client';

// Shared header for admin / vendor / brand team pages so all three sit at the
// same visual hierarchy: title + subtitle on the left, Manage Roles + Add
// Member on the right. The portal's brand colour is passed in as `accent`.

import { Plus, Settings2 } from 'lucide-react';

interface TeamPageHeaderProps {
  title: string;
  subtitle: string;
  accent: string;            // primary button bg, e.g. '#E74C3C' for admin
  accentHover: string;       // primary button hover bg
  addLabel: string;          // "Add Admin" / "Add Member"
  canEdit: boolean;
  canInvite: boolean;
  onManageRolesClick: () => void;
  onAddMemberClick: () => void;
}

export function TeamPageHeader({
  title, subtitle, accent, accentHover, addLabel,
  canEdit, canInvite, onManageRolesClick, onAddMemberClick,
}: TeamPageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-[clamp(1.25rem,4vw,1.75rem)] font-semibold text-[#181725] leading-none mb-1">{title}</h1>
        <p className="text-[#7C7C7C] text-[14px] font-medium">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
        {canEdit && (
          <button onClick={onManageRolesClick}
            className="min-h-12 flex-1 sm:flex-none px-4 bg-white border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[14px] font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
            <Settings2 size={16} /> Manage Roles
          </button>
        )}
        {canInvite && (
          <button onClick={onAddMemberClick} style={{ backgroundColor: accent }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = accentHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = accent; }}
            className="min-h-12 flex-1 sm:flex-none px-5 text-white rounded-[12px] text-[14px] font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm">
            <Plus size={16} /> {addLabel}
          </button>
        )}
      </div>
    </div>
  );
}
