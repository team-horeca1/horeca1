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

export async function renderCollectionShareImage(
  slug: string,
  format: OgFormat,
  req?: Request,
): Promise<ImageResponse | null> {
  const origin = shareSiteOrigin(req);
  const pageUrl = `${origin}/collections/${slug}`;

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

  const [qrDataUrl, imageUrl] = await Promise.all([
    qrPngDataUrl(pageUrl),
    resolveOgImage(origin, collection.bannerImageUrl || collection.imageUrl),
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
        pageUrl={pageUrl}
        qrDataUrl={qrDataUrl}
      />
    ),
    {
      ...OG_SIZES[format],
      headers: ogCacheHeaders(collection.createdAt),
    },
  );
}
