// GET /api/v1/credit/check[?vendorId=xxx] — Check the caller's credit availability
// WHY: Before checkout, the frontend checks if the customer has a credit line.
//      Unified CreditWallet world: a customer can hold the H1 platform wallet
//      (vendorId = null) and/or per-vendor credit lines. With ?vendorId we scope
//      to that one wallet; without it we return all of the caller's wallets.
//      Backward-friendly: never 500s when the customer has no wallet — returns
//      { hasCredit: false, wallets: [] }.
// PROTECTED: Must be logged in.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const num = (d: { toString(): string } | number | null) => (d == null ? 0 : Number(d));

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const vendorId = req.nextUrl.searchParams.get('vendorId');

    const wallets = await prisma.creditWallet.findMany({
      where: {
        userId: effectiveCustomerUserId(ctx),
        // ?vendorId=h1 (or omitted) → caller's H1 platform wallet (vendorId null);
        // ?vendorId=<id> → that vendor's credit line.
        ...(vendorId ? (vendorId === 'h1' ? { vendorId: null } : { vendorId }) : {}),
      },
      select: {
        vendorId: true,
        status: true,
        creditLimit: true,
        availableCredit: true,
        outstandingAmount: true,
        currentDueDate: true,
        vendor: { select: { businessName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const shaped = wallets.map((w) => ({
      vendorId: w.vendorId,
      vendor: w.vendorId ? (w.vendor?.businessName ?? null) : 'Horeca1',
      creditLimit: num(w.creditLimit),
      availableCredit: num(w.availableCredit),
      outstandingAmount: num(w.outstandingAmount),
      currentDueDate: w.currentDueDate,
      status: w.status,
    }));

    // "Has credit" = at least one ACTIVE wallet with spendable headroom.
    const hasCredit = shaped.some((w) => w.status === 'ACTIVE' && w.availableCredit > 0);

    return NextResponse.json({ success: true, data: { hasCredit, wallets: shaped } });
  } catch (error) {
    return errorResponse(error);
  }
});
