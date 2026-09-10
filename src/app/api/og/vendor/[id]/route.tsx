import { ImageResponse } from 'next/og';
import { CommerceShareCard } from '@/lib/share-cards/templates';
import { absoluteMediaUrl } from '@/lib/share-cards/absoluteUrl';
import { qrPngDataUrl } from '@/lib/share-cards/qr';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const SIZES = {
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
} as const;

function promoLabel(p: {
  type: string;
  name: string;
  discountPct: { toString(): string } | null;
  discountFlat: { toString(): string } | null;
  minOrderValue: { toString(): string } | null;
}): string | undefined {
  if (p.type === 'pct_discount' && p.discountPct) {
    const mov = p.minOrderValue ? ` above ₹${Number(p.minOrderValue)}` : '';
    return `Flat ${Number(p.discountPct)}% off${mov}`;
  }
  if (p.type === 'flat_discount' && p.discountFlat) {
    return `₹${Number(p.discountFlat)} off`;
  }
  if (p.name) return p.name;
  return undefined;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get('format') === 'portrait' ? 'portrait' : 'square';
  const origin = new URL(req.url).origin;
  const pageUrl = `${origin}/vendor/${id}`;
  const qrDataUrl = await qrPngDataUrl(pageUrl);

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: {
      id: true,
      businessName: true,
      displayName: true,
      logoUrl: true,
      bannerUrl: true,
      rating: true,
      isVerified: true,
      gstNumber: true,
      promotions: {
        where: { isActive: true },
        take: 1,
        orderBy: { updatedAt: 'desc' },
        select: {
          name: true,
          type: true,
          discountPct: true,
          discountFlat: true,
          minOrderValue: true,
        },
      },
      products: {
        where: { isActive: true },
        take: 8,
        select: { category: { select: { name: true } } },
      },
    },
  });

  const name = vendor?.displayName || vendor?.businessName || 'Horeca1 supplier';
  const categories = [...new Set(
    (vendor?.products ?? [])
      .map((p) => p.category?.name)
      .filter((n): n is string => Boolean(n)),
  )].slice(0, 3);
  const rating = vendor?.rating != null && Number(vendor.rating) > 0
    ? `${Number(vendor.rating).toFixed(1)}★`
    : null;
  const verified = vendor?.isVerified ? 'Verified' : vendor?.gstNumber ? 'GST registered' : null;
  const statLine = [rating, verified].filter(Boolean).join(' · ') || undefined;
  const offer = vendor?.promotions?.[0] ? promoLabel(vendor.promotions[0]) : undefined;

  return new ImageResponse(
    (
      <CommerceShareCard
        format={format}
        kicker="SUPPLIER STORE"
        title={name}
        subtitle={categories.length ? categories.join(' · ') : undefined}
        statLine={statLine}
        offer={offer}
        cta="Order from us on Horeca1."
        imageUrl={absoluteMediaUrl(origin, vendor?.bannerUrl || vendor?.logoUrl)}
        pageUrl={pageUrl}
        qrDataUrl={qrDataUrl}
      />
    ),
    { ...SIZES[format] },
  );
}
