// GET /api/v1/vendors/[id]/delivery-plan?pincode=XXXXXX
// Returns available delivery modes + computed supplier-delivery date for checkout.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import {
  computeNextDeliveryDate,
  toLocalYmd,
} from '@/modules/delivery/nextDeliveryDate';

function extractVendorId(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/');
  // .../vendors/:id/delivery-plan
  const idx = parts.indexOf('vendors');
  return parts[idx + 1] ?? '';
}

export async function GET(req: NextRequest) {
  try {
    const vendorId = extractVendorId(req);
    const pincode = (req.nextUrl.searchParams.get('pincode') || '').trim();
    if (!vendorId) throw Errors.badRequest('Missing vendor id');
    if (!/^\d{4,10}$/.test(pincode)) throw Errors.badRequest('Valid pincode required');

    const [vendor, area, holidays] = await Promise.all([
      prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          id: true,
          selfPickupOffered: true,
          deliverThroughPublicHolidays: true,
        },
      }),
      prisma.serviceArea.findFirst({
        where: { vendorId, pincode, isActive: true },
        select: {
          deliversMon: true,
          deliversTue: true,
          deliversWed: true,
          deliversThu: true,
          deliversFri: true,
          deliversSat: true,
          deliversSun: true,
          cutoffTime: true,
          thirdPartyDeliveryAvailable: true,
        },
      }),
      prisma.platformHoliday.findMany({
        select: { holidayDate: true },
        take: 120,
        orderBy: { holidayDate: 'asc' },
      }),
    ]);

    if (!vendor) throw Errors.notFound('Vendor');

    const orderAt = new Date();
    const holidayDates = holidays.map((h) => h.holidayDate.toISOString().slice(0, 10));

    const hasSupplierDays = !!(
      area &&
      (area.deliversMon ||
        area.deliversTue ||
        area.deliversWed ||
        area.deliversThu ||
        area.deliversFri ||
        area.deliversSat ||
        area.deliversSun)
    );

    let supplierDeliveryDate: string | null = null;
    let supplierDeliveryMessage: string | null = null;

    if (area && hasSupplierDays) {
      const next = computeNextDeliveryDate({
        plan: area,
        orderAt,
        deliverThroughPublicHolidays: vendor.deliverThroughPublicHolidays,
        holidayDates,
      });
      if (next) {
        supplierDeliveryDate = toLocalYmd(next);
        const weekday = next.toLocaleDateString('en-IN', { weekday: 'short' });
        const pretty = next.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        supplierDeliveryMessage = `We've received your order! Your delivery is scheduled for ${weekday}, ${pretty}.`;
      }
    }

    const modes: Array<{
      mode: 'supplier_delivery' | 'third_party' | 'self_pickup';
      title: string;
      description: string;
      deliveryDate: string | null;
    }> = [];

    if (hasSupplierDays && supplierDeliveryDate) {
      modes.push({
        mode: 'supplier_delivery',
        title: 'Supplier Delivery',
        description: supplierDeliveryMessage!,
        deliveryDate: supplierDeliveryDate,
      });
    }

    if (area?.thirdPartyDeliveryAvailable) {
      modes.push({
        mode: 'third_party',
        title: '3rd-Party Delivery',
        description:
          "Need it faster? Book a ride on Porter, Rapido, or any delivery app you prefer. We'll notify you once your order is packed — you pay the delivery partner directly.",
        deliveryDate: null,
      });
    }

    if (vendor.selfPickupOffered) {
      modes.push({
        mode: 'self_pickup',
        title: 'Self-Pickup',
        description:
          "Your order will be ready for pickup in 2 hours. We'll notify you the moment it's packed.",
        deliveryDate: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        vendorId,
        pincode,
        modes,
        hasAnyMode: modes.length > 0,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
