import { renderCollectionShareImage } from '@/lib/share-cards/renderCollectionCard';
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
  const cacheKey = `collection:${slug}:${format}`;

  const image = await getOrRenderOgCard(cacheKey, () =>
    renderCollectionShareImage(slug, format, req),
  );
  if (!image) return notFoundOgResponse('Collection not found');
  return image;
}
