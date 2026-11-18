import { NextRequest, NextResponse } from 'next/server';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';
import { getSupplierPayableDetail } from '@/modules/finance/supplierPayable.service';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'wallet.view');
    const vendorId = await resolveVendorId(ctx, req);
    const detail = await getSupplierPayableDetail(vendorId);
    return NextResponse.json({
      success: true,
      data: {
        supplier: detail.vendor.displayName?.trim() || detail.vendor.businessName,
        ratePct: detail.vendor.platformFeePct == null ? null : detail.vendor.platformFeePct.toString(),
        lines: detail.lines.map((line) => ({
          orderId: line.orderId,
          orderNumber: line.order.orderNumber,
          status: line.status,
          customerPaid: line.collectedAmount.toString(),
          razorpayFee: line.razorpayFee == null ? null : line.razorpayFee.toString(),
          razorpayFeeUnknown: line.razorpayFeeUnknown,
          commission: line.commissionAmount.toString(),
          receive: line.netPayable.toString(),
          paid: line.status === 'settled',
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
