// Hyper-personalization profile endpoint.
// GET  → returns the signed-in user's profile completion status.
// POST → marks the profile as completed (idempotent — timestamp only set once).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

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

  // Find their business accounts and outlets to see if they resolved pincode/businessName there
  const member = await prisma.businessAccountMember.findFirst({
    where: { userId },
    include: {
      businessAccount: {
        include: {
          outlets: {
            take: 1
          }
        }
      }
    }
  });

  const hasBusinessName = !!(user.businessName || member?.businessAccount?.legalName || member?.businessAccount?.displayName);
  const hasPincode = !!(user.pincode || member?.businessAccount?.billingPincode || member?.businessAccount?.outlets?.[0]?.pincode);
  const hasFullName = !!user.fullName;

  const hasCorePersonalization = hasPincode && hasBusinessName && hasFullName;

  return NextResponse.json({
    success: true,
    data: {
      profileCompletedAt: user.profileCompletedAt,
      isComplete: !!user.profileCompletedAt,
      hasCorePersonalization,
      fields: {
        fullName: hasFullName,
        phone: !!user.phone,
        pincode: hasPincode,
        businessName: hasBusinessName,
        gstNumber: !!(user.gstNumber || member?.businessAccount?.gstin),
      },
    },
  });
});

export const POST = withAuth(async (_req: NextRequest, ctx) => {
  const existing = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { profileCompletedAt: true },
  });

  if (existing?.profileCompletedAt) {
    return NextResponse.json({
      success: true,
      data: { profileCompletedAt: existing.profileCompletedAt, alreadyCompleted: true },
    });
  }

  const updated = await prisma.user.update({
    where: { id: ctx.userId },
    data: { profileCompletedAt: new Date() },
    select: { profileCompletedAt: true },
  });

  return NextResponse.json({
    success: true,
    data: { profileCompletedAt: updated.profileCompletedAt, alreadyCompleted: false },
  });
});
