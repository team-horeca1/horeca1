'use client';

// Shared team member list — identical row design across admin / vendor /
// brand team pages. Each row shows avatar (with initials), name + badges
// (Primary / Inactive / HCID), contact, role badge, joined date, and the
// per-action buttons (Edit, Reset Password, Remove). Owner and self rows
// hide destructive actions.

import { Users, Loader2, Pencil, KeyRound, Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';
import type { RoleStyle } from './RoleCardsGrid';

export interface TeamMemberItem {
  id: string;
  isOwner: boolean;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    hcidDisplay: string | null;
    isActive: boolean;
  };
  role: { name: string };
  outletAccess?: string;
}

interface Props {
  title?: string;
  members: TeamMemberItem[];
  loading: boolean;
  accent: string;
  currentUserId: string | undefined;
  getRoleStyle: (roleName: string) => RoleStyle;
  canEdit: boolean;
  canDelete: boolean;
  onEdit?: (member: TeamMemberItem) => void;
  onResetPassword?: (member: TeamMemberItem) => void;
  onRemove?: (member: TeamMemberItem) => void;
  allowOwnerPasswordReset?: boolean;
  HeaderIcon?: ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function TeamMemberList({
  title = 'Team Members',
  members, loading, accent, currentUserId, getRoleStyle,
  canEdit, canDelete, onEdit, onResetPassword, onRemove,
  allowOwnerPasswordReset = false,
  HeaderIcon = Users,
}: Props) {
  return (
    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
      <div className="p-5 border-b border-[#EEEEEE] flex items-center gap-2">
        <HeaderIcon size={18} style={{ color: accent }} />
        <h2 className="text-[16px] font-bold text-[#181725]">{title}</h2>
        <span className="text-[13px] text-[#AEAEAE]">({members.length})</span>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center">
          <Loader2 size={28} className="animate-spin" style={{ color: accent }} />
        </div>
      ) : members.length === 0 ? (
        <div className="p-8 text-center">
          <Users size={32} className="text-[#EEEEEE] mx-auto mb-2" />
          <p className="text-[14px] font-bold text-[#AEAEAE]">No team members yet</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#F5F5F5]">
          {members.map((member) => {
            const look = getRoleStyle(member.role.name);
            const isSelf = member.user.id === currentUserId;
            const isOwnerRow = member.isOwner;
            return (
              <li key={member.id} className="px-4 md:px-6 py-4 flex items-center gap-3 md:gap-4">
                <div className="w-[40px] h-[40px] rounded-full flex items-center justify-center text-[13px] font-[900] shrink-0"
                  style={{ backgroundColor: look.bg, color: look.color }}>
                  {initials(member.user.fullName)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-bold text-[#181725] truncate">{member.user.fullName}</p>
                    {isOwnerRow && (
                      <span className="text-[11px] font-bold text-[#F59E0B] bg-[#FFF7E6] px-2 py-0.5 rounded-[5px]">Primary</span>
                    )}
                    {!member.user.isActive && (
                      <span className="text-[11px] font-bold text-[#AEAEAE] bg-[#F5F5F5] px-2 py-0.5 rounded-[5px]">Inactive</span>
                    )}
                    {member.user.hcidDisplay && (
                      <span className="text-[11px] text-[#AEAEAE] font-mono hidden md:inline">{member.user.hcidDisplay}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#7C7C7C] truncate">
                    {member.user.email ?? member.user.phone ?? '—'}
                  </p>
                  {member.outletAccess && (
                    <p className="text-[11px] font-bold text-[#1D4ED8] mt-0.5">{member.outletAccess}</p>
                  )}
                </div>

                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] shrink-0"
                  style={{ backgroundColor: look.bg, color: look.color }}>
                  <look.Icon size={13} />
                  <span className="text-[12px] font-bold">{member.role.name}</span>
                </div>

                <span className="text-[12px] text-[#AEAEAE] hidden md:block shrink-0 w-[90px] text-right">
                  {new Date(member.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                </span>

                <div className="shrink-0 flex items-center gap-1">
                  {isOwnerRow ? (
                    (allowOwnerPasswordReset || isSelf) && canEdit && onResetPassword ? (
                      <>
                        <span className="text-[11px] text-[#AEAEAE] px-1">{isSelf ? 'You' : 'Owner'}</span>
                        <button onClick={() => onResetPassword(member)}
                          className="p-2 rounded-[8px] hover:bg-gray-100 transition-colors" title="Reset password">
                          <KeyRound size={14} className="text-[#AEAEAE]" />
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] text-[#AEAEAE] px-1">{isSelf ? 'You' : 'Owner'}</span>
                    )
                  ) : isSelf ? (
                    <>
                      <span className="text-[11px] text-[#AEAEAE] px-1">You</span>
                      {canEdit && onResetPassword && (
                        <button onClick={() => onResetPassword(member)}
                          className="p-2 rounded-[8px] hover:bg-gray-100 transition-colors" title="Reset password">
                          <KeyRound size={14} className="text-[#AEAEAE]" />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {canEdit && onEdit && (
                        <button onClick={() => onEdit(member)}
                          className="p-2 rounded-[8px] hover:bg-amber-50 transition-colors" title="Change role">
                          <Pencil size={14} className="text-[#F59E0B]" />
                        </button>
                      )}
                      {canEdit && onResetPassword && (
                        <button onClick={() => onResetPassword(member)}
                          className="p-2 rounded-[8px] hover:bg-gray-100 transition-colors" title="Reset password">
                          <KeyRound size={14} className="text-[#AEAEAE]" />
                        </button>
                      )}
                      {canDelete && onRemove && (
                        <button onClick={() => onRemove(member)}
                          className="p-2 rounded-[8px] hover:bg-red-50 transition-colors" title="Remove member">
                          <Trash2 size={14} style={{ color: accent }} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
