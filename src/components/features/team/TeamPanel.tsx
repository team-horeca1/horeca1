'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { TeamRolesEditor } from '@/components/features/team/TeamRolesEditor';
import { AddMemberWizard, type RoleItem } from '@/components/features/team/AddMemberWizard';
import { EditMemberModal } from '@/components/features/team/EditMemberModal';
import { ResetPasswordModal } from '@/components/features/team/ResetPasswordModal';
import { TeamPageHeader } from '@/components/features/team/TeamPageHeader';
import { RoleCardsGrid } from '@/components/features/team/RoleCardsGrid';
import { TeamMemberList } from '@/components/features/team/TeamMemberList';
import {
  TEAM_PANEL_PRESETS,
  lookForRole,
  resolveEndpoint,
  type TeamMemberRow,
  type PortalRole,
  type TeamPanelScope,
} from '@/components/features/team/teamPanelConfig';
import {
  isAdminCustomerImpersonationActive,
  isAdminVendorImpersonationActive,
} from '@/lib/clearImpersonation';
import { toast } from 'sonner';

interface AccountMemberApiRow {
  id: string;
  isPrimary: boolean;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    hcidDisplay: string | null;
    isActive: boolean;
    userRoles: Array<{
      id: string;
      outletId: string | null;
      role: { id: string; name: string };
    }>;
  };
}

interface Outlet {
  id: string;
  name: string;
}

export interface TeamPanelProps {
  scope: TeamPanelScope;
  embedded?: boolean;
  /** Full-page shell for customer account team page */
  pageShell?: boolean;
  /** Block entire page when user lacks team permissions (admin/account) */
  blockWhenNoAccess?: boolean;
}

export function TeamPanel({
  scope,
  embedded = false,
  pageShell = false,
  blockWhenNoAccess = false,
}: TeamPanelProps) {
  const preset = TEAM_PANEL_PRESETS[scope];
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const perms = usePermissions();
  const confirm = useConfirm();

  const sessionUser = session?.user as {
    id?: string;
    role?: string;
    activeBusinessAccountId?: string;
  } | undefined;
  const currentUserId = sessionUser?.id;
  // Cookie is client-only — read after mount to avoid hydration mismatch.
  const [vendorAdminView, setVendorAdminView] = useState(false);
  useEffect(() => {
    setVendorAdminView(isAdminVendorImpersonationActive());
  }, []);
  // JWT role stays admin under Admin View; cookie covers brief session.role lag.
  const isAdminImpersonating =
    scope !== 'admin'
    && (sessionUser?.role === 'admin' || vendorAdminView);
  // URL accountId wins (Admin View deep-link). Under customer Admin View the JWT
  // still holds the admin's BA — resolve the impersonated BA from /api/v1/account.
  const urlAccountId = scope === 'account' ? (searchParams.get('accountId') ?? undefined) : undefined;
  const [accountId, setAccountId] = useState<string | undefined>(
    scope === 'account' ? (urlAccountId || sessionUser?.activeBusinessAccountId) : undefined,
  );

  useEffect(() => {
    if (scope !== 'account') {
      setAccountId(undefined);
      return;
    }
    if (urlAccountId) {
      setAccountId(urlAccountId);
      return;
    }
    if (isAdminCustomerImpersonationActive()) {
      let cancelled = false;
      fetch('/api/v1/account')
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: Array<{ id: string }> }) => {
          if (cancelled) return;
          const id = json.success ? json.data?.[0]?.id : undefined;
          setAccountId(id || sessionUser?.activeBusinessAccountId);
        })
        .catch(() => {
          if (!cancelled) setAccountId(sessionUser?.activeBusinessAccountId);
        });
      return () => { cancelled = true; };
    }
    setAccountId(sessionUser?.activeBusinessAccountId);
  }, [scope, urlAccountId, sessionUser?.activeBusinessAccountId]);

  const canInvite = perms.has('users.create');
  const canEdit = perms.has('users.edit');
  const canDelete = perms.has('users.delete');
  const canView = perms.has('users.view');
  const canManage = perms.hasAny('users.create', 'users.edit', 'users.delete', 'users.view');

  const [team, setTeam] = useState<TeamMemberRow[]>([]);
  const [roles, setRoles] = useState<PortalRole[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showRolesEditor, setShowRolesEditor] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberRow | null>(null);
  const [passwordMember, setPasswordMember] = useState<TeamMemberRow | null>(null);

  const teamEndpoint = resolveEndpoint(preset.teamEndpoint, accountId);
  const rolesEndpoint = resolveEndpoint(preset.rolesEndpoint, accountId);
  const rolesEditorEndpoint = resolveEndpoint(preset.rolesEditorEndpoint, accountId);
  const outletsEndpoint =
    scope === 'account' && accountId
      ? `/api/v1/account/${accountId}/outlets`
      : '/api/v1/vendor/outlets';

  const getRoleStyle = useCallback(
    (roleName: string) => lookForRole(preset, roleName),
    [preset],
  );

  useEffect(() => {
    if (scope === 'account' && sessionStatus === 'unauthenticated') {
      router.replace('/login');
    }
  }, [scope, sessionStatus, router]);

  const fetchTeam = useCallback(async () => {
    if (scope === 'account' && !accountId) return;
    try {
      setLoading(true);
      const fetches: Promise<Response>[] = [
        fetch(teamEndpoint).then((r) => r),
        fetch(rolesEndpoint).then((r) => r),
      ];
      if (scope === 'account' && accountId) {
        fetches.push(fetch(outletsEndpoint).then((r) => r));
      }

      const [teamRes, rolesRes, outletsRes] = await Promise.all(fetches);
      const teamJson = await teamRes.json();
      const rolesJson = await rolesRes.json();

      if (teamJson.success) {
        if (scope === 'account') {
          const mapped: TeamMemberRow[] = (teamJson.data as AccountMemberApiRow[]).map((row) => {
            const firstRole = row.user.userRoles[0]?.role ?? null;
            return {
              id: row.id,
              isOwner: row.isPrimary,
              createdAt: row.createdAt,
              user: {
                id: row.user.id,
                fullName: row.user.fullName,
                email: row.user.email,
                phone: row.user.phone,
                hcidDisplay: row.user.hcidDisplay,
                isActive: row.user.isActive,
              },
              role: { id: firstRole?.id ?? null, name: firstRole?.name ?? 'No role' },
              userRoles: row.user.userRoles,
            };
          });
          setTeam(mapped);
        } else {
          setTeam(teamJson.data as TeamMemberRow[]);
        }
      }

      if (rolesJson.success) {
        let nextRoles = rolesJson.data as PortalRole[];
        if (scope === 'account') {
          nextRoles = nextRoles.filter((r) => r.scope === 'account');
        }
        setRoles(nextRoles);
      }

      if (outletsRes) {
        const outletsJson = await outletsRes.json();
        if (outletsJson.success) setOutlets(outletsJson.data as Outlet[]);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [scope, accountId, teamEndpoint, rolesEndpoint, outletsEndpoint]);

  useEffect(() => {
    void fetchTeam();
  }, [fetchTeam]);

  const handleRemove = async (member: TeamMemberRow) => {
    const ok = await confirm({
      title: 'Remove team member?',
      message: `${member.user.fullName} ${preset.removeMessage}`,
      confirmText: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;

    const deleteId = preset.deleteUsesUserId ? member.user.id : member.id;
    const deleteUrl =
      scope === 'account' && accountId
        ? `/api/v1/account/${accountId}/users/${deleteId}`
        : `${teamEndpoint}/${deleteId}`;

    try {
      const res = await fetch(deleteUrl, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      setTeam((prev) =>
        prev.filter((m) =>
          preset.deleteUsesUserId ? m.user.id !== member.user.id : m.id !== member.id,
        ),
      );
      toast.success(`${member.user.fullName} removed from team`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    }
  };

  const visibleRoles = useMemo(() => {
    if (preset.filterVisibleRoles) return preset.filterVisibleRoles(roles);
    return roles;
  }, [roles, preset]);

  const editMemberId = editingMember
    ? preset.editUsesUserId
      ? editingMember.user.id
      : editingMember.id
    : '';

  const editMemberEndpoint =
    editingMember && scope === 'account' && accountId
      ? `/api/v1/account/${accountId}/users/${editingMember.user.id}`
      : editingMember
        ? `${teamEndpoint}/${editMemberId}`
        : '';

  if ((sessionStatus === 'loading' && !session) || perms.loading) {
    return (
      <div className={pageShell ? 'min-h-screen flex items-center justify-center' : 'flex items-center justify-center py-24'}>
        <Loader2 size={28} className="animate-spin" style={{ color: preset.accent }} />
      </div>
    );
  }

  if (scope === 'account' && !accountId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div
            className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: `${preset.accent}22` }}
          >
            <AlertCircle size={22} style={{ color: preset.accent }} />
          </div>
          <h2 className="text-[18px] font-bold text-[#181725] mb-1">Select a business account first</h2>
          <p className="text-[#7C7C7C] text-[14px] mb-4">
            You don&apos;t have an active business account yet. Create one from your profile to manage team members.
          </p>
          <button
            onClick={() => router.push('/profile')}
            className="px-5 h-[42px] text-white rounded-[10px] text-[13px] font-bold transition-colors"
            style={{ backgroundColor: preset.accent }}
          >
            Back to profile
          </button>
        </div>
      </div>
    );
  }

  if (blockWhenNoAccess && !canManage) {
    return (
      <div className={pageShell ? 'min-h-screen flex items-center justify-center px-4' : 'flex items-center justify-center py-24'}>
        <div className="text-center max-w-md">
          <div
            className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: scope === 'admin' ? '#FFF0F0' : `${preset.accent}22` }}
          >
            <AlertCircle size={22} style={{ color: preset.accent }} />
          </div>
          <h2 className="text-[18px] font-bold text-[#181725] mb-1">Access restricted</h2>
          <p className="text-[#7C7C7C] text-[14px]">{preset.viewOnlyMessage}</p>
        </div>
      </div>
    );
  }

  const panelContent = (
    <div className={embedded ? 'space-y-5' : 'space-y-6 pb-10 animate-in fade-in duration-300'}>
      {!embedded && (
        <TeamPageHeader
          title={preset.title}
          subtitle={preset.subtitle}
          accent={preset.accent}
          accentHover={preset.accentHover}
          addLabel={preset.addLabel}
          canEdit={canEdit}
          canInvite={canInvite}
          onManageRolesClick={() => setShowRolesEditor(true)}
          onAddMemberClick={() => setShowInvite(true)}
        />
      )}

      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-[#F5F5F5]">
          <div>
            <h2 className="text-[16px] font-bold text-[#181725]">Team &amp; roles</h2>
            <p className="text-[12px] text-[#7C7C7C]">Invite staff and manage permissions</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowRolesEditor(true)}
                className="h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] text-[12px] font-bold text-[#181725] hover:bg-[#FAFAFA]"
              >
                Manage roles
              </button>
            )}
            {canInvite && (
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="h-[36px] px-3 rounded-[10px] text-white text-[12px] font-bold"
                style={{ backgroundColor: preset.accent }}
              >
                Add member
              </button>
            )}
          </div>
        </div>
      )}

      <RoleCardsGrid roles={visibleRoles} getStyle={getRoleStyle} />

      <TeamMemberList
        members={team}
        loading={loading}
        accent={preset.accent}
        currentUserId={currentUserId}
        getRoleStyle={getRoleStyle}
        canEdit={canEdit || isAdminImpersonating}
        canDelete={canDelete || isAdminImpersonating}
        allowOwnerPasswordReset={isAdminImpersonating || scope === 'admin'}
        onEdit={(m) => setEditingMember(m as TeamMemberRow)}
        onResetPassword={(m) => setPasswordMember(m as TeamMemberRow)}
        onRemove={(m) => handleRemove(m as TeamMemberRow)}
      />

      {!canManage && team.length > 0 && !blockWhenNoAccess && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-[12px]">
          <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-blue-700">{preset.viewOnlyMessage}</p>
        </div>
      )}

      {preset.infoBanner && (
        <div className={`flex items-start gap-3 p-4 rounded-[12px] ${preset.infoBanner.className}`}>
          <AlertCircle size={16} className={`shrink-0 mt-0.5 ${preset.infoBanner.iconClassName}`} />
          <div>
            <p className={`text-[13px] font-bold ${preset.infoBanner.titleClassName}`}>
              {preset.infoBanner.title}
            </p>
            <p className={`text-[12px] mt-0.5 ${preset.infoBanner.bodyClassName}`}>
              {preset.infoBanner.body}
            </p>
          </div>
        </div>
      )}

      {showInvite && (
        <AddMemberWizard
          roles={roles as RoleItem[]}
          onClose={() => setShowInvite(false)}
          onInvited={(newMember) => {
            setShowInvite(false);
            if (newMember) {
              setTeam((prev) => [...prev, newMember as TeamMemberRow]);
              toast.success(`${(newMember as TeamMemberRow).user.fullName} added to team`);
            } else {
              void fetchTeam();
              toast.success('Team member added');
            }
          }}
          config={{
            scope,
            accountId,
            accent: preset.accent,
            teamEndpoint,
            outletsEndpoint,
            showStorefront: preset.showStorefrontOnInvite ?? false,
            skipOutletStep: preset.skipOutletStepOnInvite,
            businessAccountLabel:
              scope === 'account' ? 'Customer Account' : scope === 'brand' ? 'Brand Account' : 'Vendor Account',
          }}
        />
      )}

      {editingMember && (
        <EditMemberModal
          memberId={editMemberId}
          memberName={editingMember.user.fullName}
          initialRoleId={editingMember.role.id}
          roles={roles as RoleItem[]}
          outlets={outlets}
          userRoles={editingMember.userRoles}
          scope={scope}
          accent={preset.accent}
          teamMemberEndpoint={editMemberEndpoint}
          outletsEndpoint={outletsEndpoint}
          showOutlets={scope === 'vendor' || scope === 'account'}
          showStorefront={scope === 'vendor'}
          onClose={() => setEditingMember(null)}
          onSaved={() => {
            setEditingMember(null);
            toast.success('Member access updated');
            void fetchTeam();
          }}
        />
      )}

      {passwordMember && (
        <ResetPasswordModal
          member={passwordMember}
          passwordEndpoint={preset.passwordEndpoint(passwordMember, isAdminImpersonating, accountId)}
          accent={preset.accent}
          showGenerate={scope === 'admin' || isAdminImpersonating}
          onClose={() => setPasswordMember(null)}
        />
      )}

      <TeamRolesEditor
        isOpen={showRolesEditor}
        onClose={() => setShowRolesEditor(false)}
        endpointBase={rolesEditorEndpoint}
        accent={preset.accent}
        scope={scope}
        onRolesChanged={fetchTeam}
      />
    </div>
  );

  if (pageShell) {
    return (
      <div className="min-h-screen bg-[#F2F3F2]">
        <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-8">
          {panelContent}
        </div>
      </div>
    );
  }

  return panelContent;
}
