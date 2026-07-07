import { NextRequest, NextResponse } from 'next/server';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/middleware/auth';

export const PATCH = adminOnly(async (req: NextRequest, ctx: AuthContext) => {
    try {
        requirePermission(ctx, 'vendors.approve');
        const segments = req.nextUrl.pathname.split('/');
        const docId = segments[segments.length - 1];

        const body = await req.json() as { status?: string; adminNote?: string };
        const { status, adminNote } = body;

        if (!status || !['verified', 'rejected', 'pending'].includes(status)) {
            throw Errors.badRequest('Invalid status');
        }

        const doc = await prisma.vendorDocument.update({
            where: { id: docId },
            data: { status, adminNote: adminNote ?? null },
            select: { id: true, status: true, adminNote: true },
        });

        return NextResponse.json({ success: true, data: doc });
    } catch (err) {
        return errorResponse(err);
    }
});
