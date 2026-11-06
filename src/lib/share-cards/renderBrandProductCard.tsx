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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function renderBrandProductShareImage(
  slug: string,
  productId: string,
  format: OgFormat,
  req?: Request,
): Promise<ImageResponse | null> {
  if (!UUID_RE.test(productId)) return null;

  const origin = shareSiteOrigin(req);
  const product = await prisma.brandMasterProduct.findFirst({
    where: {
      id: productId,
      isActive: true,
      brand: { slug, isActive: true, approvalStatus: 'approved' },
    },
    select: {
      name: true,
      imageUrl: true,
      images: true,
      packSize: true,
      unit: true,
      updatedAt: true,
      brand: { select: { name: true } },
    },
  });

  if (!product?.brand?.name) return null;

  const rawImage = product.imageUrl || product.images?.[0] || null;
  const pack = [product.packSize, product.unit].filter(Boolean).join(' ') || undefined;

  const [imageUrl, logoUrl, fonts] = await Promise.all([
    resolveOgImage(origin, rawImage, { maxPx: 600 }),
    loadHorecaLogoDataUrl(),
    loadShareFonts(),
  ]);

  return new ImageResponse(
    (
      <CommerceShareCard
        format={format}
        kicker="PRODUCT"
        title={product.name}
        subtitle={product.brand.name}
        statLine={pack}
        cta="Open in Horeca1"
        imageUrl={imageUrl}
        imageFit="contain"
        logoUrl={logoUrl}
      />
    ),
    {
      ...OG_SIZES[format],
      fonts,
      headers: ogCacheHeaders(product.updatedAt),
    },
  );
}
