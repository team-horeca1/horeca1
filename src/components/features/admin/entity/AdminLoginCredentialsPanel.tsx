'use client';

import { useState, useEffect } from 'react';
import { KeyRound } from 'lucide-react';
import type { PermissionKey } from '@/lib/permissions/registry';
import { useSession } from 'next-auth/react';
import { AdminCopyField } from './AdminCopyField';
import { ResetPasswordModal } from '@/components/features/team/ResetPasswordModal';

interface UserRef {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
}

interface AdminLoginCredentialsPanelProps {
  user: UserRef;
  adminPassword?: string | null;
  permission: PermissionKey;
  accent?: string;
  onPasswordUpdated?: (password: string) => void;
  className?: string;
}

function hasPermission(perms: readonly string[] | undefined, key: PermissionKey): boolean {
  return !!perms && perms.includes(key);
}

function accentBg(accent: string): string {
  if (accent === '#7C3AED') return '#EDE9FE';
  return '#EEF8F1';
}

export function AdminLoginCredentialsPanel({
  user,
  adminPassword: initialPassword = null,
  permission,
  accent = '#299E60',
  onPasswordUpdated,
  className = '',
}: AdminLoginCredentialsPanelProps) {
  const { data: session } = useSession();
  const perms = (session?.user as { permissions?: string[] } | undefined)?.permissions;
  const [password, setPassword] = useState<string | null>(initialPassword);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    setPassword(initialPassword);
  }, [initialPassword]);

  if (!hasPermission(perms, permission)) return null;

  const passwordDisplay = password ?? '';
  const hasPassword = Boolean(password);

  const handlePasswordUpdated = (next: string) => {
    setPassword(next);
    onPasswordUpdated?.(next);
  };

  return (
    <>
      <div
        className={`rounded-[12px] border border-[#EEEEEE] bg-[#FAFBFC] p-3.5 space-y-3 ${className}`}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ backgroundColor: accentBg(accent), color: accent }}
          >
            <KeyRound size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-extrabold text-[#111827] leading-tight">Login Access</p>
            <p className="text-[11px] font-medium text-[#9CA3AF] mt-0.5 leading-snug">
              {hasPassword
                ? 'Last password captured for admin sharing'
                : 'Share securely with the account owner'}
            </p>
          </div>
        </div>

        <AdminCopyField label="Email" value={user.email ?? ''} copyLabel="Email" />
        {user.phone && (
          <AdminCopyField label="Phone" value={user.phone} copyLabel="Phone" />
        )}

        <div>
          <AdminCopyField
            label="Password"
            value={passwordDisplay}
            placeholder="Not available yet"
            copyLabel="Password"
            passwordMode
          />
          {!hasPassword && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-[8px] px-2.5 py-1.5 leading-snug">
              This account was created without a shareable password. Use Reset Password to set one
              admins can copy — or it will appear after the user signs in with their password once.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className="w-full h-[38px] inline-flex items-center justify-center gap-1.5 rounded-[10px] text-[12px] font-bold text-white transition-all shadow-sm hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: accent }}
        >
          <KeyRound size={13} />
          Reset Password
        </button>
      </div>

      {resetOpen && (
        <ResetPasswordModal
          member={{
            user: {
              fullName: user.fullName,
              email: user.email ?? null,
              phone: user.phone ?? null,
            },
          }}
          passwordEndpoint={`/api/v1/admin/users/${user.id}/password`}
          accent={accent}
          showGenerate
          onClose={() => setResetOpen(false)}
          onSuccess={handlePasswordUpdated}
        />
      )}
    </>
  );
}
