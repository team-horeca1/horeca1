import 'server-only';
import { ImageResponse } from 'next/og';
import { BrandShareCard } from '@/lib/share-cards/templates';
import { loadHorecaLogoDataUrl, resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { loadShareFonts } from '@/lib/share-cards/fonts';
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

  const brand = await prisma.brand.findFirst({
    where: {
      slug,
      isActive: true,
      approvalStatus: 'approved',
    },
    select: {
      name: true,
      slug: true,
      logoUrl: true,
      bannerUrl: true,
      categories: true,
      bgColor: true,
      showcaseImages: true,
      updatedAt: true,
      _count: {
        select: { masterProducts: { where: { isActive: true } } },
      },
    },
  });

  if (!brand) return null;

  const cover =
    brand.showcaseImages?.[0] ||
    brand.bannerUrl ||
    brand.logoUrl ||
    null;
  const categoryLine = brand.categories?.slice(0, 2).join(' · ') || undefined;
  const productCount = brand._count.masterProducts;

  const [imageUrl, logoUrl, fonts] = await Promise.all([
    resolveOgImage(origin, cover, { maxPx: 1000 }),
    loadHorecaLogoDataUrl(),
    loadShareFonts(),
  ]);

  return new ImageResponse(
    (
      <BrandShareCard
        format={format}
        name={brand.name}
        categoryLine={categoryLine}
        productCount={productCount}
        imageUrl={imageUrl}
        bgColor={brand.bgColor}
        logoUrl={logoUrl}
      />
    ),
    {
      ...OG_SIZES[format],
      fonts,
      headers: ogCacheHeaders(brand.updatedAt),
    },
  );
}
