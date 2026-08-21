// PATCH /api/v1/vendor/credit/[walletId] — inline grid row update (limit + CRM + status)
// PROTECTED: Vendor only + creditLine.approve

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { creditWalletService, resolveCreditDisplayStatus } from '@/modules/credit/creditWallet.service';

function extractWalletId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1] ?? '';
}

const patchSchema = z.object({
  creditLimit: z.number().min(0).max(50_000_000).optional(),
  workflowStatus: z.enum(['SANCTIONED', 'IN_PROGRESS', 'COMPLETED']).optional(),
  assignedOwnerId: z.string().uuid().nullable().optional(),
  vendorNotes: z.string().max(2000).nullable().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'FROZEN', 'CANCELLED', 'EXPIRED']).optional(),
  statusReason: z.string().min(3).max(500).optional(),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'creditLine.approve');
    const vendorId = await resolveVendorId(ctx, req);
    const walletId = extractWalletId(req);
    const body = patchSchema.parse(await req.json());

    if (body.status) {
      const updated = await creditWalletService.setWalletStatus(
        walletId,
        body.status,
        ctx.userId,
        body.statusReason ?? `Status set to ${body.status} by vendor`,
        vendorId,
      );
      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          displayStatus: resolveCreditDisplayStatus(updated.status, updated.workflowStatus),
        },
      });
    }

    const updated = await creditWalletService.updateVendorCreditRow(
      walletId,
      vendorId,
      ctx.userId,
      body,
    );

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        creditLimit: Number(updated.creditLimit),
        usedCredit: Number(updated.usedCredit),
        availableCredit: Number(updated.availableCredit),
        outstandingAmount: Number(updated.outstandingAmount),
        reservedAmount: Number(updated.reservedAmount),
        status: updated.status,
        creditSource: updated.creditSource,
        workflowStatus: updated.workflowStatus,
        assignedOwnerId: updated.assignedOwnerId,
        vendorNotes: updated.vendorNotes,
        currentDueDate: updated.currentDueDate,
        displayStatus: resolveCreditDisplayStatus(updated.status, updated.workflowStatus),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
