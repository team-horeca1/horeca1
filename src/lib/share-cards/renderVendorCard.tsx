import 'server-only';
import { ImageResponse } from 'next/og';
import { CommerceShareCard } from '@/lib/share-cards/templates';
import { resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { qrPngDataUrl } from '@/lib/share-cards/qr';
import { prisma } from '@/lib/prisma';
import {
  OG_SIZES,
  type OgFormat,
  ogCacheHeaders,
  shareSiteOrigin,
} from '@/lib/share-cards/ogHelpers';

function promoLabel(p: {
  type: string;
  name: string;
  discountPct: { toString(): string } | null;
  discountFlat: { toString(): string } | null;
  minOrderValue: { toString(): string } | null;
}): string | undefined {
  if (p.type === 'pct_discount' && p.discountPct) {
    const mov = p.minOrderValue ? ` above Rs. ${Number(p.minOrderValue)}` : '';
    return `Flat ${Number(p.discountPct)}% off${mov}`;
  }
  if (p.type === 'flat_discount' && p.discountFlat) {
    return `Rs. ${Number(p.discountFlat)} off`;
  }
  if (p.name) return p.name;
  return undefined;
}

export async function renderVendorShareImage(
  id: string,
  format: OgFormat,
  req?: Request,
): Promise<ImageResponse | null> {
  const origin = shareSiteOrigin(req);
  const pageUrl = `${origin}/vendor/${id}`;

  const vendor = await prisma.vendor.findFirst({
    where: { id, isActive: true },
    select: {
      id: true,
      businessName: true,
      displayName: true,
      logoUrl: true,
      bannerUrl: true,
      rating: true,
      isVerified: true,
      updatedAt: true,
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
        where: { isActive: true, approvalStatus: 'approved' },
        take: 8,
        select: {
          imageUrl: true,
          images: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  if (!vendor) return null;

  const name = vendor.displayName || vendor.businessName || 'Horeca1 supplier';
  const categories = [
    ...new Set(
      (vendor.products ?? [])
        .map((p) => p.category?.name)
        .filter((n): n is string => Boolean(n)),
    ),
  ].slice(0, 3);
  const rating =
    vendor.rating != null && Number(vendor.rating) > 0
      ? `${Number(vendor.rating).toFixed(1)}★`
      : null;
  const verified = vendor.isVerified ? 'Verified' : null;
  const statLine = [rating, verified].filter(Boolean).join(' · ') || undefined;
  const offer = vendor.promotions?.[0] ? promoLabel(vendor.promotions[0]) : undefined;

  const productPhoto =
    vendor.products.find((p) => p.imageUrl || p.images?.[0]) ?? null;
  const [qrDataUrl, imageUrl] = await Promise.all([
    qrPngDataUrl(pageUrl),
    resolveOgImage(
      origin,
      vendor.logoUrl ||
        vendor.bannerUrl ||
        productPhoto?.imageUrl ||
        productPhoto?.images?.[0] ||
        null,
    ),
  ]);

  return new ImageResponse(
    (
      <CommerceShareCard
        format={format}
        kicker="SUPPLIER STORE"
        title={name}
        subtitle={categories.length ? categories.join(' · ') : undefined}
        statLine={statLine}
        offer={offer}
        cta="Order from us on Horeca1"
        imageUrl={imageUrl}
        pageUrl={pageUrl}
        qrDataUrl={qrDataUrl}
      />
    ),
    {
      ...OG_SIZES[format],
      headers: ogCacheHeaders(vendor.updatedAt),
    },
  );
}
