import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/middleware/auth';

export const GET = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
    try {
        requirePermission(ctx, 'vendors.view');
        const segments = req.nextUrl.pathname.split('/');
        const vendorId = segments[segments.indexOf('vendors') + 1];

        const docs = await prisma.vendorDocument.findMany({
            where: { vendorId },
            orderBy: { uploadedAt: 'desc' },
            select: { id: true, type: true, fileUrl: true, fileName: true, status: true, adminNote: true, uploadedAt: true },
        });

        return NextResponse.json({ success: true, data: docs });
    } catch (err) {
        return errorResponse(err);
    }
});
