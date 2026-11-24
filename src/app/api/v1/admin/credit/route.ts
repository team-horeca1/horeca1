// GET /api/v1/admin/credit — list all CreditWallets (H1 wallets + vendor credit
// lines) with customer/vendor info. Supports ?search= and ?status= filters. Admin only.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, CreditWalletStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { storeDisplayName } from '@/lib/storeDisplayName';
import { logAction } from '@/lib/auditLog';

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

    await creditWalletService.healAllStuckReservedCredit();

    const wallets = await prisma.creditWallet.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true } },
        vendor: { select: { businessName: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: wallets.map((w) => ({
        ...w,
        vendor: w.vendor
          ? { ...w.vendor, businessName: storeDisplayName(w.vendor) }
          : null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'payments.create');
    const id = new URL(req.url).searchParams.get('id')?.trim();
    if (!id) throw Errors.badRequest('Credit line id is required');
    const wallet = await creditWalletService.deleteCreditLine(id);
    await logAction(ctx, req, {
      action: 'credit_line.delete',
      entity: 'CreditWallet',
      entityId: wallet.id,
      before: {
        userId: wallet.userId,
        vendorId: wallet.vendorId,
        status: wallet.status,
        creditLimit: String(wallet.creditLimit),
      },
    });
    return NextResponse.json({ success: true, data: { id: wallet.id } });
  } catch (error) {
    return errorResponse(error);
  }
});
