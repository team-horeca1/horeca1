// POST /api/v1/wallet/create-repayment-order — start a Razorpay repayment for the
// caller's own credit wallet. Returns the order for the client checkout widget.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { getRazorpay } from '@/lib/razorpay';
import { Errors, errorResponse } from '@/middleware/errorHandler';

const schema = z.object({
  walletId: z.string().uuid(),
  amount: z.number().positive(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { walletId, amount } = schema.parse(await req.json());

    const wallet = await prisma.creditWallet.findUnique({ where: { id: walletId } });
    if (!wallet || wallet.userId !== ctx.userId) throw Errors.notFound('Credit wallet');

    if (amount > Number(wallet.outstandingAmount)) {
      throw Errors.badRequest(`Repayment ₹${amount} exceeds outstanding ₹${Number(wallet.outstandingAmount)}`);
    }

    const razorpayOrder = await getRazorpay().orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: `wallet_repay_${walletId.slice(0, 8)}_${String(Date.now()).slice(-6)}`,
    });

    const repayment = await prisma.creditWalletRepayment.create({
      data: {
        walletId: wallet.id,
        amount: new Prisma.Decimal(amount),
        repaymentMethod: 'RAZORPAY',
        razorpayOrderId: razorpayOrder.id,
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        repaymentId: repayment.id,
        razorpayOrderId: razorpayOrder.id,
        amount: Number(razorpayOrder.amount),
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
