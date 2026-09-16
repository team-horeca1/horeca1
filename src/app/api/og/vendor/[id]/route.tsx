import { renderVendorShareImage } from '@/lib/share-cards/renderVendorCard';
import { notFoundOgResponse, parseOgFormat } from '@/lib/share-cards/ogHelpers';

export const runtime = 'nodejs';
export const revalidate = 120;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const format = parseOgFormat(req);
  const image = await renderVendorShareImage(id, format, req);
  if (!image) return notFoundOgResponse('Vendor not found');
  return image;
}
