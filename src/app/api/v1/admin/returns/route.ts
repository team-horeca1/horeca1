// GET /api/v1/admin/returns — List all return requests
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';

export const GET = adminOnly(async (req: NextRequest) => {
  try {
    const params = req.nextUrl.searchParams;
    const status = params.get('status') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 20, 100);
    const cursor = params.get('cursor') || undefined;

    const returns = await prisma.returnRequest.findMany({
      where: status ? { status } : undefined,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { orderNumber: true, totalAmount: true, paymentStatus: true, paymentMethod: true } },
        customer: { select: { fullName: true, email: true, phone: true } },
      },
    });

    const hasMore = returns.length > limit;
    if (hasMore) returns.pop();

    return NextResponse.json({
      success: true,
      data: {
        returns,
        nextCursor: hasMore ? returns[returns.length - 1]?.id : null,
        hasMore,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
