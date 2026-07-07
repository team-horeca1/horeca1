// GET /api/v1/admin/claims — List vendor delivery disputes
// PATCH handled in [id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';

export const GET = adminOnly(async (req: NextRequest) => {
  try {
    const status = new URL(req.url).searchParams.get('status');
    const claims = await prisma.vendorClaim.findMany({
      where: status ? { status: status as 'pending' | 'approved' | 'rejected' | 'resolved' } : undefined,
      include: {
        vendor: { select: { id: true, businessName: true } },
        order: { select: { orderNumber: true, totalAmount: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json({ success: true, data: claims });
  } catch (error) {
    return errorResponse(error);
  }
});
