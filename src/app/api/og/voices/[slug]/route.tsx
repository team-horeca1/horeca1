import { ImageResponse } from 'next/og';
import { VoiceShareCard } from '@/lib/share-cards/templates';
import { loadHorecaLogoDataUrl, resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { loadShareFonts } from '@/lib/share-cards/fonts';
import { getPublishedVoiceStoryBySlug } from '@/modules/voices/voice.service';
import { voiceTitleLine } from '@/sanity/lib/types';
import { getOrRenderOgCard } from '@/lib/share-cards/ogCache';
import {
  notFoundOgResponse,
  OG_SIZES,
  ogCacheHeaders,
  parseOgFormat,
  shareSiteOrigin,
} from '@/lib/share-cards/ogHelpers';

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const format = parseOgFormat(req);
  const cacheKey = `voice:${slug}:${format}`;

  const image = await getOrRenderOgCard(cacheKey, async () => {
    const story = await getPublishedVoiceStoryBySlug(slug);
    if (!story) return null;

    const origin = shareSiteOrigin(req);
    const name = story.name;
    const quote = story.quote;
    const badge = story.badge ?? 'HORECA1 VOICES';
    const titleLine = voiceTitleLine(story.role, story.venue);
    const [photoUrl, logoUrl, fonts] = await Promise.all([
      resolveOgImage(origin, story.photoOgUrl || story.photoUrl, { maxPx: 1000 }),
      loadHorecaLogoDataUrl(),
      loadShareFonts(),
    ]);

    return new ImageResponse(
      (
        <VoiceShareCard
          format={format}
          name={name}
          badge={badge}
          quote={quote}
          titleLine={titleLine}
          photoUrl={photoUrl}
          logoUrl={logoUrl}
        />
      ),
      {
        ...OG_SIZES[format],
        fonts,
        headers: ogCacheHeaders(story.publishedAt),
      },
    );
  });

  if (!image) return notFoundOgResponse('Story not found');
  return image;
}
