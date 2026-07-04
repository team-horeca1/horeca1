// GET  /api/v1/vendor/credit — Vendor's credit-wallet customer list + aging summary
// POST /api/v1/vendor/credit — Vendor assigns / updates a customer's credit line
// WHY: Vendors need a view of all customers who have an outstanding CreditWallet
//      balance owed to them, with aging buckets and summary totals, so they can
//      monitor exposure, send reminders, and prioritise collections. Assignment
//      is the client-doc "Vendor-backed credit" MUST-HAVE: Vendor >> Choose
//      Customer >> Assign Credit Limit >> Assign Credit Terms.
// PROTECTED: Vendor only (vendors + admins); POST additionally needs creditLine.approve

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { creditWalletService } from '@/modules/credit/creditWallet.service';

// ── Aging bucket helper ──────────────────────────────────────────────────────

function agingBucket(overdueDays: number): 'current' | 'd1_30' | 'd31_60' | 'd60plus' {
  if (overdueDays <= 0) return 'current';
  if (overdueDays <= 30) return 'd1_30';
  if (overdueDays <= 60) return 'd31_60';
  return 'd60plus';
}

// ── Route handler ─────────────────────────────────────────────────────────────

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'creditLine.view');
    const vendorId = await resolveVendorId(ctx, req);

    // All CreditWallet rows scoped to this vendor, ordered by outstanding desc
    const wallets = await prisma.creditWallet.findMany({
      where: { vendorId },
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true } },
      },
      orderBy: { outstandingAmount: 'desc' },
    });

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ── Per-row mapping ──────────────────────────────────────────────────────
    const customers = wallets.map((w) => {
      const outstanding = Number(w.outstandingAmount);
      const dueDate = w.currentDueDate ?? null;
      const overdueDays = w.overdueDays;
      const bucket = agingBucket(overdueDays);

      return {
        id: w.id,
        customer: {
          id: w.user.id,
          fullName: w.user.fullName,
          phone: w.user.phone ?? null,
          email: w.user.email,
        },
        creditLimit: Number(w.creditLimit),
        availableCredit: Number(w.availableCredit),
        usedCredit: Number(w.usedCredit),
        outstanding,
        dueDate: dueDate ? dueDate.toISOString() : null,
        overdueDays,
        status: w.status,
        agingBucket: bucket,
      };
    });

    // ── Summary totals ───────────────────────────────────────────────────────
    const totalOutstanding = customers.reduce((s, c) => s + c.outstanding, 0);

    // Due today: dueDate is today (any time) AND outstanding > 0
    const dueToday = customers
      .filter((c) => {
        if (!c.dueDate || c.outstanding <= 0) return false;
        const d = new Date(c.dueDate);
        const dateMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return dateMidnight.getTime() === todayMidnight.getTime();
      })
      .reduce((s, c) => s + c.outstanding, 0);

    // Overdue: dueDate is in the past AND outstanding > 0
    const overdue = customers
      .filter((c) => c.dueDate && c.outstanding > 0 && new Date(c.dueDate) < now)
      .reduce((s, c) => s + c.outstanding, 0);

    // Aging buckets: sum outstanding per bucket
    const agingBuckets = {
      current: 0,
      d1_30: 0,
      d31_60: 0,
      d60plus: 0,
    };
    for (const c of customers) {
      agingBuckets[c.agingBucket] += c.outstanding;
    }

    // High-risk: BLACKLISTED or overdueDays > 60
    const highRiskCount = customers.filter(
      (c) => c.status === 'BLACKLISTED' || c.overdueDays > 60,
    ).length;

    return NextResponse.json({
      success: true,
      data: {
        customers,
        summary: {
          totalOutstanding,
          dueToday,
          overdue,
          highRiskCount,
          agingBuckets,
          total: customers.length,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ── Assign / update a credit line ─────────────────────────────────────────────

const overridesSchema = z.object({
  repaymentMode: z.enum(['REPAY_BEFORE_NEXT_USE', 'ALLOW_USAGE_TILL_DUE']).optional(),
  billingModel: z.enum(['BILL_TO_BILL', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY']).optional(),
  creditTenureDays: z.number().int().min(0).max(365).optional(),
  gracePeriodDays: z.number().int().min(0).max(365).optional(),
  blacklistDays: z.number().int().min(0).max(3650).optional(),
  interestRatePct: z.number().min(0).max(100).optional(),
  interestFrequencyDays: z.number().int().min(1).max(365).optional(),
  penaltyAmount: z.number().min(0).max(100000).optional(),
  penaltyFrequencyDays: z.number().int().min(1).max(365).optional(),
}).partial();

const assignSchema = z.object({
  userId: z.string().uuid(),
  creditLimit: z.number().min(0).max(50000000),
  overrides: overridesSchema.optional(),
  remark: z.string().max(500).optional(),
});

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'creditLine.approve');
    const vendorId = await resolveVendorId(ctx, req);
    const body = assignSchema.parse(await req.json());

    // Multi-tenancy guard: the target must actually be a customer of THIS
    // vendor (has ordered, is CRM-mapped, or already has a wallet here) —
    // a vendor must not be able to attach credit to arbitrary user ids.
    const [hasOrdered, isCrm, hasWallet] = await Promise.all([
      prisma.order.findFirst({ where: { vendorId, userId: body.userId }, select: { id: true } }),
      prisma.vendorCustomer.findFirst({ where: { vendorId, userId: body.userId }, select: { id: true } }),
      prisma.creditWallet.findFirst({ where: { vendorId, userId: body.userId }, select: { id: true } }),
    ]);
    if (!hasOrdered && !isCrm && !hasWallet) {
      throw Errors.badRequest('This user is not a customer of your store yet — they must place an order or be added in Customers first.');
    }

    // Same engine the admin panel and checkout use — writes CreditWallet,
    // logs CREDIT_ASSIGN / LIMIT_UPDATE with an audit trail.
    const wallet = await creditWalletService.assignCredit(
      body.userId,
      vendorId,
      body.creditLimit,
      body.overrides ?? {},
      ctx.userId,
      body.remark ?? 'Credit assigned by vendor',
    );

    return NextResponse.json({ success: true, data: wallet }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
