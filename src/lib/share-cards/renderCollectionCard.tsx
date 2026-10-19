import 'server-only';
import { ImageResponse } from 'next/og';
import { CommerceShareCard } from '@/lib/share-cards/templates';
import { loadHorecaLogoDataUrl, resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { loadShareFonts } from '@/lib/share-cards/fonts';
import { prisma } from '@/lib/prisma';
import {
  OG_SIZES,
  type OgFormat,
  ogCacheHeaders,
  shareSiteOrigin,
} from '@/lib/share-cards/ogHelpers';

export async function renderCollectionShareImage(
  slug: string,
  format: OgFormat,
  req?: Request,
): Promise<ImageResponse | null> {
  const origin = shareSiteOrigin(req);

  const collection = await prisma.collection.findFirst({
    where: { slug, isActive: true },
    select: {
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      bannerImageUrl: true,
      createdAt: true,
      _count: {
        select: {
          masterProducts: true,
          products: true,
        },
      },
    },
  });

  if (!collection) return null;

  const itemCount =
    collection._count.masterProducts > 0
      ? collection._count.masterProducts
      : collection._count.products;
  const statLine =
    itemCount > 0
      ? `${itemCount} product${itemCount === 1 ? '' : 's'}`
      : undefined;

  const [imageUrl, logoUrl, fonts] = await Promise.all([
    resolveOgImage(origin, collection.bannerImageUrl || collection.imageUrl, { maxPx: 600 }),
    loadHorecaLogoDataUrl(),
    loadShareFonts(),
  ]);

  return new ImageResponse(
    (
      <CommerceShareCard
        format={format}
        kicker="COLLECTION"
        title={collection.name}
        subtitle={collection.description?.slice(0, 120) || undefined}
        statLine={statLine}
        cta="Open Collection"
        imageUrl={imageUrl}
        imageFit="contain"
        logoUrl={logoUrl}
      />
    ),
    {
      ...OG_SIZES[format],
      fonts,
      headers: ogCacheHeaders(collection.createdAt),
    },
  );
}
