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

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const format = new URL(req.url).searchParams.get('format') === 'portrait' ? 'portrait' : 'square';
  const origin = new URL(req.url).origin;
  const pageUrl = `${origin}/brand/${slug}`;
  const qrDataUrl = await qrPngDataUrl(pageUrl);

  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: {
      name: true,
      slug: true,
      tagline: true,
      logoUrl: true,
      bannerUrl: true,
      categories: true,
      authorizedDistributors: {
        where: { status: 'approved' },
        select: { id: true },
      },
    },
  });

  const vendorCount = brand?.authorizedDistributors.length ?? 0;
  const statLine = vendorCount > 0
    ? `Available via ${vendorCount} vendor${vendorCount === 1 ? '' : 's'} near you`
    : undefined;

  return new ImageResponse(
    (
      <CommerceShareCard
        format={format}
        kicker="BRAND STORE"
        title={brand?.name ?? 'Horeca1 brand'}
        subtitle={brand?.tagline || brand?.categories?.slice(0, 3).join(' · ') || undefined}
        statLine={statLine}
        cta="Find us on Horeca1."
        imageUrl={absoluteMediaUrl(origin, brand?.bannerUrl || brand?.logoUrl)}
        pageUrl={pageUrl}
        qrDataUrl={qrDataUrl}
      />
    ),
    { ...SIZES[format] },
  );
}
