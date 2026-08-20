import { prisma } from './prisma';
import { getClientIp } from './utils';
import type { NextRequest } from 'next/server';
import type { AuthContext } from '@/middleware/auth';

// Typed action strings — use these instead of raw strings to catch typos at compile time.
export const AUDIT_ACTIONS = {
  vendorApprove: 'vendor.approve',
  vendorUpdate: 'vendor.update',
  vendorDelete: 'vendor.delete',
  productApprove: 'product.approve',
  productReject: 'product.reject',
  adminTeamInvite: 'admin_team.invite',
  adminTeamRoleChange: 'admin_team.role_change',
  adminTeamRemove: 'admin_team.remove',
  brandMappingVerified: 'brand_mapping.verified',
  brandMappingRejected: 'brand_mapping.rejected',
  brandMappingUnlinked: 'brand_mapping.unlinked',
  brandDistributorApproved: 'brand_distributor.approved',
  brandDistributorRejected: 'brand_distributor.rejected',
  brandDistributorUnapproved: 'brand_distributor.unapproved',
  couponCreate: 'coupon.create',
  couponUpdate: 'coupon.update',
  couponDelete: 'coupon.delete',
  cashbackCampaignCreate: 'cashback_campaign.create',
  cashbackCampaignUpdate: 'cashback_campaign.update',
  cashbackCampaignDelete: 'cashback_campaign.delete',
  cashbackGrant: 'cashback.grant',
  cashbackMarkPaid: 'cashback.mark_paid',
  welcomeIssue: 'welcome.issue',
  welcomeProgramUpdate: 'welcome_program.update',
  firstOrderIssue: 'first_order.issue',
  firstOrderProgramUpdate: 'first_order_program.update',
  referralIssue: 'referral.issue',
  referralProgramUpdate: 'referral_program.update',
  payoutInviteCreate: 'payout_invite.create',
  payoutInviteClaim: 'payout_invite.claim',
  // Bulk Update Engine — one entry per bulk run (matched/updated count in metadata).
  productBulkUpdate: 'product.bulk_update',
  inventoryBulkUpdate: 'inventory.bulk_update',
  priceListBulkApply: 'price_list.bulk_apply',
  comboCreate: 'combo.create',
  userPasswordReset: 'user.password_reset',
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];

export interface LogActionInput {
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

// WHY swallow errors: an audit write must never break the main request path.
export async function logAction(
  ctx: AuthContext | null,
  req: NextRequest | null,
  input: LogActionInput,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: ctx?.userId ?? null,
        actorRole: ctx?.role ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before === undefined ? undefined : (input.before as never),
        after: input.after === undefined ? undefined : (input.after as never),
        metadata: input.metadata === undefined ? undefined : (input.metadata as never),
        ip: req ? getClientIp(req) : null,
      },
    });
  } catch (err) {
    console.error('[audit] write failed', err);
  }
}
