'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2, Crown, Shield, Edit3, Eye, AlertCircle } from 'lucide-react';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { TeamRolesEditor } from '@/components/features/team/TeamRolesEditor';
import { AddMemberWizard } from '@/components/features/team/AddMemberWizard';
import { EditMemberModal } from '@/components/features/team/EditMemberModal';
import { ResetPasswordModal } from '@/components/features/team/ResetPasswordModal';
import { TeamPageHeader } from '@/components/features/team/TeamPageHeader';
import { RoleCardsGrid } from '@/components/features/team/RoleCardsGrid';
import { TeamMemberList } from '@/components/features/team/TeamMemberList';
import { toast } from 'sonner';

const ACCENT = '#299E60';
const ACCENT_HOVER = '#238a54';

interface TeamMember {
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
  role: {
    id: string | null;
    name: string;
    scope: string;
    description: string | null;
  };
  outletAccess?: string;
}

interface VendorRole {
  id: string;
  name: string;
  scope: string;
  description: string | null;
  isTemplate: boolean;
  permissions: Record<string, Record<string, boolean>>;
}

const ROLE_LOOK: Record<string, { color: string; bg: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  'Vendor Admin': { color: '#F59E0B', bg: '#FFF7E6', Icon: Crown },
  'Vendor Manager': { color: '#3B82F6', bg: '#EFF6FF', Icon: Shield },
  'Vendor Editor': { color: '#8B5CF6', bg: '#F3F0FF', Icon: Edit3 },
  'Vendor Viewer': { color: '#6B7280', bg: '#F3F4F6', Icon: Eye },
};

function lookFor(roleName: string) {
  return ROLE_LOOK[roleName] ?? ROLE_LOOK['Vendor Viewer'];
}

export function VendorTeamPanel({ embedded = false }: { embedded?: boolean }) {
  const { data: session, status: sessionStatus } = useSession();
  const currentUserId = (session?.user as { id?: string })?.id;
  const userRole = (session?.user as { role?: string })?.role;
  const isAdminImpersonating = userRole === 'admin';
  const sessionPerms = (session?.user as { permissions?: string[] })?.permissions ?? [];
  const canInvite = sessionPerms.includes('users.create');
  const canEdit = sessionPerms.includes('users.edit');
  const canDelete = sessionPerms.includes('users.delete');
  const canView = sessionPerms.includes('users.view');
  const canManage = canInvite || canEdit || canDelete || canView;
  const confirm = useConfirm();

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<VendorRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showRolesEditor, setShowRolesEditor] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [passwordMember, setPasswordMember] = useState<TeamMember | null>(null);

  const fetchTeam = useCallback(async () => {
    try {
      setLoading(true);
      const [teamRes, rolesRes] = await Promise.all([
        fetch('/api/v1/vendor/team').then((r) => r.json()),
        fetch('/api/v1/vendor/roles').then((r) => r.json()),
      ]);
      if (teamRes.success) setTeam(teamRes.data);
      if (rolesRes.success) setRoles(rolesRes.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchTeam(); }, [fetchTeam]);

  const handleRemove = async (member: TeamMember) => {
    const ok = await confirm({
      title: 'Remove team member?',
      message: `${member.user.fullName} will lose access to this vendor portal. They can be re-added later.`,
      confirmText: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/vendor/team/${member.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      setTeam((prev) => prev.filter((m) => m.id !== member.id));
      toast.success(`${member.user.fullName} removed from team`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    }
  };

  if (sessionStatus === 'loading' && !session) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-[#299E60]" />
      </div>
    );
  }

  const visibleRoles = roles.filter((r) => r.isTemplate && !r.name.startsWith('Storefront'));

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6 pb-10 animate-in fade-in duration-300'}>
      {!embedded && (
        <TeamPageHeader
          title="Team"
          subtitle="Manage your vendor team members and their permissions"
          accent={ACCENT}
          accentHover={ACCENT_HOVER}
          addLabel="Add Member"
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
              <button type="button" onClick={() => setShowRolesEditor(true)} className="h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] text-[12px] font-bold text-[#181725] hover:bg-[#FAFAFA]">
                Manage roles
              </button>
            )}
            {canInvite && (
              <button type="button" onClick={() => setShowInvite(true)} className="h-[36px] px-3 rounded-[10px] bg-[#299E60] text-white text-[12px] font-bold hover:bg-[#238a54]">
                Add member
              </button>
            )}
          </div>
        </div>
      )}

      <RoleCardsGrid roles={visibleRoles} getStyle={lookFor} />

      <TeamMemberList
        members={team}
        loading={loading}
        accent={ACCENT}
        currentUserId={currentUserId}
        getRoleStyle={lookFor}
        canEdit={canEdit || isAdminImpersonating}
        canDelete={canDelete && !isAdminImpersonating}
        allowOwnerPasswordReset={isAdminImpersonating}
        onEdit={(m) => setEditingMember(m as TeamMember)}
        onResetPassword={(m) => setPasswordMember(m as TeamMember)}
        onRemove={(m) => handleRemove(m as TeamMember)}
      />

      {!canManage && team.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-[12px]">
          <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-blue-700">
            Your role doesn&apos;t include team management — view only. Ask a Vendor Admin for access.
          </p>
        </div>
      )}

      {showInvite && (
        <AddMemberWizard
          roles={roles}
          onClose={() => setShowInvite(false)}
          onInvited={(newMember) => {
            setShowInvite(false);
            if (newMember) {
              setTeam((prev) => [...prev, newMember]);
              toast.success(`${newMember.user.fullName} added to team`);
            } else {
              void fetchTeam();
              toast.success('Team member added');
            }
          }}
        />
      )}

      {editingMember && (
        <EditMemberModal
          memberId={editingMember.id}
          memberName={editingMember.user.fullName}
          roles={roles}
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
          passwordEndpoint={
            isAdminImpersonating
              ? `/api/v1/admin/users/${passwordMember.user.id}/password`
              : `/api/v1/vendor/team/${passwordMember.id}/password`
          }
          accent="#299E60"
          showGenerate={isAdminImpersonating}
          onClose={() => setPasswordMember(null)}
        />
      )}

      <TeamRolesEditor
        isOpen={showRolesEditor}
        onClose={() => setShowRolesEditor(false)}
        endpointBase="/api/v1/vendor/roles"
        accent="#299E60"
        scope="vendor"
        onRolesChanged={fetchTeam}
      />
    </div>
  );
}
