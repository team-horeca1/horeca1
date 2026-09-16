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

export async function renderBrandShareImage(
  slug: string,
  format: OgFormat,
  req?: Request,
): Promise<ImageResponse | null> {
  const origin = shareSiteOrigin(req);
  const pageUrl = `${origin}/brand/${slug}`;

  const brand = await prisma.brand.findFirst({
    where: {
      slug,
      isActive: true,
      approvalStatus: 'approved',
    },
    select: {
      name: true,
      slug: true,
      tagline: true,
      logoUrl: true,
      bannerUrl: true,
      categories: true,
      updatedAt: true,
      masterProducts: {
        where: { isActive: true },
        take: 8,
        select: { imageUrl: true, images: true },
      },
      authorizedDistributors: {
        where: { status: 'approved' },
        select: { id: true },
      },
    },
  });

  if (!brand) return null;

  const vendorCount = brand.authorizedDistributors.length;
  const statLine =
    vendorCount > 0
      ? `Available via ${vendorCount} vendor${vendorCount === 1 ? '' : 's'} near you`
      : undefined;

  const masterPhoto =
    brand.masterProducts.find((p) => p.imageUrl || p.images?.[0]) ?? null;
  const [qrDataUrl, imageUrl] = await Promise.all([
    qrPngDataUrl(pageUrl),
    resolveOgImage(
      origin,
      brand.logoUrl ||
        brand.bannerUrl ||
        masterPhoto?.imageUrl ||
        masterPhoto?.images?.[0] ||
        null,
    ),
  ]);

  return new ImageResponse(
    (
      <CommerceShareCard
        format={format}
        kicker="BRAND STORE"
        title={brand.name}
        subtitle={brand.tagline || brand.categories?.slice(0, 3).join(' · ') || undefined}
        statLine={statLine}
        cta="Find us on Horeca1"
        imageUrl={imageUrl}
        pageUrl={pageUrl}
        qrDataUrl={qrDataUrl}
      />
    ),
    {
      ...OG_SIZES[format],
      headers: ogCacheHeaders(brand.updatedAt),
    },
  );
}
