// GET /api/v1/config/gst-slabs — public GST % options for product forms
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DEFAULT_GST_SLABS, normalizeGstSlabs } from '@/lib/constants/gstSlabs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await prisma.platformSetting.findFirst({
      select: { gstSlabs: true },
    });
    const slabs = normalizeGstSlabs(settings?.gstSlabs ?? DEFAULT_GST_SLABS);
    return NextResponse.json(
      { success: true, data: { slabs } },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch {
    return NextResponse.json({ success: true, data: { slabs: [...DEFAULT_GST_SLABS] } });
  }
}
