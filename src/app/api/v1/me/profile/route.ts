// Hyper-personalization profile endpoint.
// GET  → returns the signed-in user's profile completion status.
// POST → marks the profile as completed (idempotent — timestamp only set once).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import {
  effectiveCustomerBusinessAccountId,
  effectiveCustomerUserId,
} from '@/lib/resolveCustomerImpersonation';

const KIND_DEFAULT_TYPES = new Set(['customer', 'vendor', 'brand']);

function profileBusinessType(value: string | null | undefined): string {
  const t = (value ?? '').trim();
  if (!t || KIND_DEFAULT_TYPES.has(t)) return '';
  return t;
}

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const userId = effectiveCustomerUserId(ctx);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      fullName: true,
      phone: true,
      pincode: true,
      businessName: true,
      gstNumber: true,
      profileCompletedAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  const scopedAccountId = effectiveCustomerBusinessAccountId(ctx);
  const accountSelect = {
    legalName: true,
    displayName: true,
    billingPincode: true,
    businessType: true,
    subType: true,
    cuisine: true,
    businessSize: true,
    designation: true,
    salutation: true,
    gstTreatment: true,
    placeOfSupply: true,
    gstin: true,
    pan: true,
    fssaiNumber: true,
    workPhone: true,
    outlets: { take: 1, select: { pincode: true } },
  } as const;
  let member = await prisma.businessAccountMember.findFirst({
    where: scopedAccountId
      ? { userId, businessAccountId: scopedAccountId }
      : { userId, isPrimary: true },
    include: { businessAccount: { select: accountSelect } },
  });
  if (!member) {
    member = await prisma.businessAccountMember.findFirst({
      where: { userId },
      include: { businessAccount: { select: accountSelect } },
    });
  }

  const ba = member?.businessAccount;
  const hasBusinessName = !!(user.businessName || ba?.legalName || ba?.displayName);
  const hasPincode = !!(user.pincode || ba?.billingPincode || ba?.outlets?.[0]?.pincode);
  const hasFullName = !!user.fullName;

  const hasCorePersonalization = hasPincode && hasBusinessName && hasFullName;
  const businessType = ba?.businessType ?? null;
  const kindDefaultType = !businessType || KIND_DEFAULT_TYPES.has(businessType);
  // Skip during signup leaves profileCompletedAt null and the kind-default type.
  const needsCompleteProfile = !user.profileCompletedAt && kindDefaultType;

  return NextResponse.json({
    success: true,
    data: {
      profileCompletedAt: user.profileCompletedAt,
      isComplete: !!user.profileCompletedAt,
      needsCompleteProfile,
      hasCorePersonalization,
      fields: {
        fullName: hasFullName,
        phone: !!user.phone,
        pincode: hasPincode,
        businessName: hasBusinessName,
        gstNumber: !!(user.gstNumber || ba?.gstin),
      },
      company: {
        salutation: ba?.salutation ?? '',
        designation: ba?.designation ?? '',
        businessType: profileBusinessType(ba?.businessType),
        subType: ba?.subType ?? '',
        cuisine: ba?.cuisine ?? '',
        businessSize: ba?.businessSize ?? '',
        workPhone: ba?.workPhone ?? '',
        gstTreatment: ba?.gstTreatment ?? '',
        placeOfSupply: ba?.placeOfSupply ?? '',
        gstin: ba?.gstin ?? user.gstNumber ?? '',
        pan: ba?.pan ?? '',
        fssaiNumber: ba?.fssaiNumber ?? '',
      },
    },
  });
});

export const POST = withAuth(async (_req: NextRequest, ctx) => {
  const userId = effectiveCustomerUserId(ctx);
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileCompletedAt: true },
  });

  if (existing?.profileCompletedAt) {
    return NextResponse.json({
      success: true,
      data: { profileCompletedAt: existing.profileCompletedAt, alreadyCompleted: true },
    });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { profileCompletedAt: new Date() },
    select: { profileCompletedAt: true },
  });

  return NextResponse.json({
    success: true,
    data: { profileCompletedAt: updated.profileCompletedAt, alreadyCompleted: false },
  });
});
