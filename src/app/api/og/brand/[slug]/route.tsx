import { renderBrandShareImage } from '@/lib/share-cards/renderBrandCard';
import { notFoundOgResponse, parseOgFormat } from '@/lib/share-cards/ogHelpers';
import { getOrRenderOgCard } from '@/lib/share-cards/ogCache';

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const format = parseOgFormat(req);
  const cacheKey = `brand:${slug}:${format}`;

  const image = await getOrRenderOgCard(cacheKey, () =>
    renderBrandShareImage(slug, format, req),
  );
  if (!image) return notFoundOgResponse('Brand not found');
  return image;
}
