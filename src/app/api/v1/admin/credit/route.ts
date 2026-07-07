// GET /api/v1/admin/credit — list all CreditWallets (H1 wallets + vendor credit
// lines) with customer/vendor info. Supports ?search= and ?status= filters. Admin only.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, CreditWalletStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'payments.view');
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const status = searchParams.get('status')?.trim();

    const where: Prisma.CreditWalletWhereInput = {};

    if (status && (Object.values(CreditWalletStatus) as string[]).includes(status)) {
      where.status = status as CreditWalletStatus;
    }

    if (search) {
      where.user = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const wallets = await prisma.creditWallet.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true } },
        vendor: { select: { businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: wallets });
  } catch (error) {
    return errorResponse(error);
  }
});
