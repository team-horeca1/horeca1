'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Users, Loader2 } from 'lucide-react';
import { AdminPasswordResetButton } from '@/components/features/admin/AdminPasswordResetButton';

interface AccountMember {
  id: string;
  isPrimary: boolean;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    isActive: boolean;
    userRoles: Array<{ role: { name: string } }>;
  };
}

interface Props {
  businessAccountId: string;
  accent?: string;
}

export function AdminAccountTeamPanel({ businessAccountId, accent = '#6B1D2E' }: Props) {
  const { data: session } = useSession();
  const perms = (session?.user as { permissions?: string[] } | undefined)?.permissions;
  const canView = !!perms?.includes('customers.view');

  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/admin/business-accounts/${businessAccountId}/users`);
      const json = await res.json();
      if (json.success) setMembers(json.data ?? []);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [businessAccountId]);

  useEffect(() => {
    if (canView) void fetchMembers();
  }, [canView, fetchMembers]);

  if (!canView) return null;

  return (
    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center gap-2">
        <Users size={18} className="text-[#6B1D2E]" />
        <h3 className="font-[800] text-[16px] text-[#181725]">Account Team</h3>
        <span className="text-[13px] text-[#AEAEAE]">({members.length})</span>
      </div>
      {loading ? (
        <div className="p-8 flex justify-center">
          <Loader2 size={28} className="animate-spin text-[#6B1D2E]" />
        </div>
      ) : members.length === 0 ? (
        <p className="p-6 text-[13px] text-[#AEAEAE] text-center">No team members on this account.</p>
      ) : (
        <ul className="divide-y divide-[#F5F5F5]">
          {members.map((m) => (
            <li key={m.id} className="px-6 py-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-bold text-[#181725] truncate">{m.user.fullName}</p>
                  {m.isPrimary && (
                    <span className="text-[11px] font-bold text-[#F59E0B] bg-[#FFF7E6] px-2 py-0.5 rounded-[5px]">Primary</span>
                  )}
                  {!m.user.isActive && (
                    <span className="text-[11px] font-bold text-[#AEAEAE] bg-[#F5F5F5] px-2 py-0.5 rounded-[5px]">Inactive</span>
                  )}
                </div>
                <p className="text-[12px] text-[#7C7C7C] truncate">
                  {m.user.email ?? m.user.phone ?? '—'}
                  {m.user.userRoles[0]?.role.name ? ` · ${m.user.userRoles[0].role.name}` : ''}
                </p>
              </div>
              <AdminPasswordResetButton
                user={m.user}
                permission="customers.edit"
                accent={accent}
                variant="icon"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
