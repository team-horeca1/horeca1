// PATCH /api/v1/vendor/returns/:id — Vendor approves or rejects a return request
// WHY: Vendor has operational ownership of their orders — they decide the resolution.
//      Admin can override, but vendor does first review.
//      On approval with a refundAmount: if the original order was paid via credit,
//      we write a credit transaction to reduce the customer's outstanding balance.
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { creditWalletService } from '@/modules/credit/creditWallet.service';
import { debitVendorOnRefund } from '@/modules/vendor/vendorSettlement.service';

function extractId(req: NextRequest) {
  return new URL(req.url).pathname.split('/').at(-1) ?? '';
}

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  adminNote: z.string().max(1000).optional(),
  refundAmount: z.number().min(0).optional(),
  resolutionType: z.enum(['refund', 'credit_note', 'replacement']).optional().default('refund'),
  creditNoteAmount: z.number().positive().optional(),
});

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'orders.edit');

    const returnId = extractId(req);
    const body = reviewSchema.parse(await req.json());

    // Verify the return belongs to one of this vendor's orders
    const returnReq = await prisma.returnRequest.findFirst({
      where: { id: returnId, order: { vendorId } },
      include: {
        order: {
          select: { id: true, status: true, userId: true, paymentMethod: true },
        },
      },
    });
    if (!returnReq) throw Errors.notFound('Return request');
    if (returnReq.status !== 'pending') {
      throw Errors.badRequest(`Return is already ${returnReq.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Build resolution-specific data
      const resolutionData: {
        resolutionType?: string;
        creditNoteNumber?: string;
        creditNoteAmount?: number;
        refundAmount?: number;
      } = {};

      if (body.status === 'approved') {
        resolutionData.resolutionType = body.resolutionType;

        if (body.resolutionType === 'credit_note') {
          const creditNoteNumber = `CN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
          resolutionData.creditNoteNumber = creditNoteNumber;
          if (body.creditNoteAmount !== undefined) {
            resolutionData.creditNoteAmount = body.creditNoteAmount;
          }
        } else if (body.resolutionType === 'refund' && body.refundAmount !== undefined) {
          resolutionData.refundAmount = body.refundAmount;
        }
        // replacement: only store resolutionType, no financial data
      }

      const result = await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: body.status,
          adminNote: body.adminNote,
          ...resolutionData,
        },
      });

      return result;
    });

    if (body.status === 'approved') {
      const wallet = await prisma.creditWallet.findFirst({
        where: { userId: returnReq.order.userId, vendorId },
      });
      if (wallet && Number(wallet.outstandingAmount) > 0) {
        if (
          body.resolutionType === 'refund' &&
          body.refundAmount &&
          body.refundAmount > 0 &&
          returnReq.order.paymentMethod === 'credit'
        ) {
          const refund = Math.min(body.refundAmount, Number(wallet.outstandingAmount));
          await creditWalletService.applyRepayment(
            wallet.id,
            refund,
            'REVERSAL',
            undefined,
            undefined,
            `Return approved — refund of ₹${refund.toFixed(2)} applied`,
          );
        } else if (
          body.resolutionType === 'credit_note' &&
          body.creditNoteAmount &&
          body.creditNoteAmount > 0
        ) {
          const amount = Math.min(body.creditNoteAmount, Number(wallet.outstandingAmount));
          await creditWalletService.applyRepayment(
            wallet.id,
            amount,
            'CREDIT_NOTE',
            undefined,
            undefined,
            `Credit note on return ${returnId}`,
          );
        }
      }

      if (
        body.resolutionType === 'refund' &&
        body.refundAmount &&
        body.refundAmount > 0 &&
        returnReq.order.paymentMethod &&
        !['credit', 'vendor_credit', 'h1_wallet', 'wallet'].includes(returnReq.order.paymentMethod)
      ) {
        await debitVendorOnRefund(
          vendorId,
          returnReq.order.id,
          body.refundAmount,
          `Return ${returnId} refund approved`,
        );
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});
