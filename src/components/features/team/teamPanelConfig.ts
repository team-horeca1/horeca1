import { Crown, Shield, Edit3, Eye } from 'lucide-react';
import type { ComponentType } from 'react';
import type { RoleStyle } from './RoleCardsGrid';

export type TeamPanelScope = 'admin' | 'vendor' | 'brand' | 'account';

export interface TeamMemberRow {
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
    scope?: string;
    description?: string | null;
  };
  outletAccess?: string;
  userRoles?: Array<{
    id: string;
    outletId: string | null;
    role: { id: string; name: string };
  }>;
}

export interface PortalRole {
  id: string;
  name: string;
  scope: string;
  description: string | null;
  isTemplate?: boolean;
  permissions: Record<string, Record<string, boolean>>;
}

export interface TeamPanelPresetConfig {
  scope: TeamPanelScope;
  accent: string;
  accentHover: string;
  title: string;
  subtitle: string;
  addLabel: string;
  teamEndpoint: string | ((accountId: string) => string);
  rolesEndpoint: string | ((accountId: string) => string);
  rolesEditorEndpoint: string | ((accountId: string) => string);
  removeMessage: string;
  viewOnlyMessage: string;
  filterVisibleRoles?: (roles: PortalRole[]) => PortalRole[];
  roleLook: Record<string, RoleStyle>;
  defaultRoleLook: RoleStyle;
  showStorefrontOnInvite?: boolean;
  skipOutletStepOnInvite?: boolean;
  deleteUsesUserId?: boolean;
  editUsesUserId?: boolean;
  passwordEndpoint: (member: TeamMemberRow, isAdminImpersonating: boolean, accountId?: string) => string;
  infoBanner?: {
    title: string;
    body: string;
    className: string;
    iconClassName: string;
    titleClassName: string;
    bodyClassName: string;
  };
}

function look(
  color: string,
  bg: string,
  Icon: ComponentType<{ size?: number; className?: string }>,
): RoleStyle {
  return { color, bg, Icon };
}

const VENDOR_ROLE_LOOK: Record<string, RoleStyle> = {
  'Vendor Admin': look('#F59E0B', '#FFF7E6', Crown),
  'Vendor Manager': look('#3B82F6', '#EFF6FF', Shield),
  'Vendor Editor': look('#8B5CF6', '#F3F0FF', Edit3),
  'Vendor Viewer': look('#6B7280', '#F3F4F6', Eye),
};

const BRAND_ROLE_LOOK: Record<string, RoleStyle> = {
  'Brand Admin': look('#F59E0B', '#FFF7E6', Crown),
  'Brand Manager': look('#3B82F6', '#EFF6FF', Shield),
  'Brand Editor': look('#8B5CF6', '#F3F0FF', Edit3),
  'Brand Viewer': look('#6B7280', '#F3F4F6', Eye),
};

const ADMIN_ROLE_LOOK: Record<string, RoleStyle> = {
  'Super Admin': look('#F59E0B', '#FFF7E6', Crown),
  'Ops Admin': look('#3B82F6', '#EFF6FF', Shield),
  'Finance Admin': look('#10B981', '#ECFDF5', Shield),
  'Support Agent': look('#8B5CF6', '#F3F0FF', Edit3),
  Editor: look('#8B5CF6', '#F3F0FF', Edit3),
  Viewer: look('#6B7280', '#F3F4F6', Eye),
};

const ACCOUNT_ROLE_LOOK: Record<string, RoleStyle> = {
  Owner: look('#F59E0B', '#FFF7E6', Crown),
  Manager: look('#3B82F6', '#EFF6FF', Shield),
  Editor: look('#8B5CF6', '#F3F0FF', Edit3),
  Viewer: look('#6B7280', '#F3F4F6', Eye),
};

export const TEAM_PANEL_PRESETS: Record<TeamPanelScope, TeamPanelPresetConfig> = {
  vendor: {
    scope: 'vendor',
    accent: '#299E60',
    accentHover: '#238a54',
    title: 'Team',
    subtitle: 'Manage your vendor team members and their permissions',
    addLabel: 'Add Member',
    teamEndpoint: '/api/v1/vendor/team',
    rolesEndpoint: '/api/v1/vendor/roles',
    rolesEditorEndpoint: '/api/v1/vendor/roles',
    removeMessage: 'will lose access to this vendor portal. They can be re-added later.',
    viewOnlyMessage: "Your role doesn't include team management — view only. Ask a Vendor Admin for access.",
    filterVisibleRoles: (roles) => roles.filter((r) => r.isTemplate && !r.name.startsWith('Storefront')),
    roleLook: VENDOR_ROLE_LOOK,
    defaultRoleLook: VENDOR_ROLE_LOOK['Vendor Viewer'],
    showStorefrontOnInvite: true,
    passwordEndpoint: (member, isAdminImpersonating) =>
      isAdminImpersonating
        ? `/api/v1/admin/users/${member.user.id}/password`
        : `/api/v1/vendor/team/${member.id}/password`,
  },
  brand: {
    scope: 'brand',
    accent: '#53B175',
    accentHover: '#3d9e41',
    title: 'Team',
    subtitle: 'Manage your brand team members and their permissions',
    addLabel: 'Add Member',
    teamEndpoint: '/api/v1/brand/team',
    rolesEndpoint: '/api/v1/brand/roles',
    rolesEditorEndpoint: '/api/v1/brand/roles',
    removeMessage: 'will lose access to this brand portal. They can be re-added later.',
    viewOnlyMessage:
      "Your role doesn't include team management — you can view team members but cannot invite or change roles. Ask an owner (Brand Admin) for the access you need.",
    roleLook: BRAND_ROLE_LOOK,
    defaultRoleLook: BRAND_ROLE_LOOK['Brand Viewer'],
    skipOutletStepOnInvite: true,
    passwordEndpoint: (member, isAdminImpersonating) =>
      isAdminImpersonating
        ? `/api/v1/admin/users/${member.user.id}/password`
        : `/api/v1/brand/team/${member.id}/password`,
  },
  admin: {
    scope: 'admin',
    accent: '#E74C3C',
    accentHover: '#c0392b',
    title: 'Admin Team',
    subtitle: 'Manage who has access to the admin dashboard, and what they can do',
    addLabel: 'Add Admin',
    teamEndpoint: '/api/v1/admin/team',
    rolesEndpoint: '/api/v1/admin/roles',
    rolesEditorEndpoint: '/api/v1/admin/roles',
    removeMessage: 'will lose admin access. Their account remains and they can be re-added later.',
    viewOnlyMessage:
      'You need at least one of users.view, users.create, users.edit, or users.delete to view the admin team. Ask a Super Admin for access.',
    roleLook: ADMIN_ROLE_LOOK,
    defaultRoleLook: ADMIN_ROLE_LOOK.Viewer,
    skipOutletStepOnInvite: true,
    deleteUsesUserId: true,
    editUsesUserId: true,
    passwordEndpoint: (member) => `/api/v1/admin/users/${member.user.id}/password`,
    infoBanner: {
      title: 'How RBAC works',
      body: 'Each role grants a specific set of permissions (e.g. orders.edit, users.create). Permission changes apply automatically within 60 seconds — no re-login required.',
      className: 'bg-[#FFF7E6] border border-amber-200',
      iconClassName: 'text-amber-500',
      titleClassName: 'text-amber-800',
      bodyClassName: 'text-amber-600',
    },
  },
  account: {
    scope: 'account',
    accent: '#53B175',
    accentHover: '#469E66',
    title: 'Account Team',
    subtitle: 'Manage who can view orders, place repeat orders, settle invoices and act on behalf of your business.',
    addLabel: 'Invite Member',
    teamEndpoint: (accountId) => `/api/v1/account/${accountId}/users`,
    rolesEndpoint: (accountId) => `/api/v1/account/${accountId}/roles?templates=true`,
    rolesEditorEndpoint: (accountId) => `/api/v1/account/${accountId}/roles`,
    removeMessage: 'will lose access to this business account. They can be re-added later.',
    viewOnlyMessage:
      'You need at least one of users.view, users.create, users.edit, or users.delete to manage the account team. Ask the account owner for access.',
    filterVisibleRoles: (roles) => roles.filter((r) => r.isTemplate && r.scope === 'account'),
    roleLook: ACCOUNT_ROLE_LOOK,
    defaultRoleLook: { color: '#53B175', bg: '#E8F4EC', Icon: Shield },
    deleteUsesUserId: true,
    editUsesUserId: true,
    passwordEndpoint: (member, _impersonating, accountId) =>
      `/api/v1/account/${accountId}/users/${member.user.id}/password`,
    infoBanner: {
      title: 'How team access works',
      body: 'Each role grants a specific set of permissions (e.g. orders.edit, users.create). Use Manage Roles to create custom roles tailored to your business.',
      className: 'bg-[#E8F4EC] border border-[#53B175]/20',
      iconClassName: 'text-[#53B175]',
      titleClassName: 'text-[#1F6A3E]',
      bodyClassName: 'text-[#2E7D52]',
    },
  },
};

export function resolveEndpoint(
  endpoint: string | ((accountId: string) => string),
  accountId?: string,
): string {
  return typeof endpoint === 'function' ? endpoint(accountId ?? '') : endpoint;
}

export function lookForRole(
  preset: TeamPanelPresetConfig,
  roleName: string,
): RoleStyle {
  return preset.roleLook[roleName] ?? preset.defaultRoleLook;
}
