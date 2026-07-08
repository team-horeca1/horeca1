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
  const passwordPlaceholder = password ? undefined : 'Not available — reset to set a new password';

  const handlePasswordUpdated = (next: string) => {
    setPassword(next);
    onPasswordUpdated?.(next);
  };

  return (
    <>
      <div className={`space-y-3 ${className}`}>
        <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Login Credentials</p>
        <AdminCopyField label="Email" value={user.email ?? ''} copyLabel="Email" />
        {user.phone && (
          <AdminCopyField label="Phone" value={user.phone} copyLabel="Phone" />
        )}
        <div>
          <AdminCopyField
            label="Password"
            value={passwordDisplay}
            placeholder={passwordPlaceholder}
            copyLabel="Password"
          />
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="mt-2 w-full h-[36px] inline-flex items-center justify-center gap-1.5 rounded-[8px] text-[12px] font-bold border border-[#EEEEEE] text-[#374151] hover:bg-gray-50 transition-colors"
          >
            <KeyRound size={13} />
            Reset Password
          </button>
        </div>
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
