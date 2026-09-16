import 'server-only';
import { ImageResponse } from 'next/og';
import { CommerceShareCard } from '@/lib/share-cards/templates';
import { resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { qrPngDataUrl } from '@/lib/share-cards/qr';
import { prisma } from '@/lib/prisma';
import {
  formatInr,
  OG_SIZES,
  type OgFormat,
  ogCacheHeaders,
  shareSiteOrigin,
} from '@/lib/share-cards/ogHelpers';

function formatEnd(endDate: Date | null | undefined): string | undefined {
  if (!endDate) return undefined;
  return `Valid until ${endDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}`;
}

/**
 * Deal/promotion share card. `id` is a Promotion id.
 * Public URL always points at the vendor store — never an internal campaign path.
 */
export async function renderDealShareImage(
  id: string,
  format: OgFormat,
  req?: Request,
): Promise<ImageResponse | null> {
  const origin = shareSiteOrigin(req);

  const promo = await prisma.promotion.findFirst({
    where: {
      id,
      isActive: true,
      vendor: { isActive: true },
    },
    select: {
      id: true,
      name: true,
      type: true,
      discountPct: true,
      discountFlat: true,
      minOrderValue: true,
      endDate: true,
      updatedAt: true,
      vendor: {
        select: {
          id: true,
          businessName: true,
          displayName: true,
          logoUrl: true,
          bannerUrl: true,
        },
      },
    },
  });

  if (!promo) return null;

  const vendorName =
    promo.vendor.displayName || promo.vendor.businessName || 'Horeca1 supplier';
  const pageUrl = `${origin}/vendor/${promo.vendor.id}`;

  let headline = promo.name;
  if (promo.type === 'pct_discount' && promo.discountPct) {
    headline = `${Number(promo.discountPct)}% OFF`;
  } else if (promo.type === 'flat_discount' && promo.discountFlat) {
    headline = `${formatInr(Number(promo.discountFlat))} OFF`;
  } else if (promo.type === 'bxgy') {
    headline = promo.name || 'Buy more, save more';
  }

  const details: string[] = [];
  if (promo.minOrderValue != null) {
    details.push(`Min order ${formatInr(Number(promo.minOrderValue))}`);
  }
  const valid = formatEnd(promo.endDate);
  if (valid) details.push(valid);

  const [qrDataUrl, imageUrl] = await Promise.all([
    qrPngDataUrl(pageUrl),
    resolveOgImage(origin, promo.vendor.bannerUrl || promo.vendor.logoUrl),
  ]);

  return new ImageResponse(
    (
      <CommerceShareCard
        format={format}
        kicker="DEAL"
        title={headline}
        subtitle={vendorName}
        statLine={details.join(' · ') || undefined}
        offer={promo.name !== headline ? promo.name : undefined}
        cta="Open in Horeca1"
        imageUrl={imageUrl}
        pageUrl={pageUrl}
        qrDataUrl={qrDataUrl}
      />
    ),
    {
      ...OG_SIZES[format],
      headers: ogCacheHeaders(promo.updatedAt),
    },
  );
}
