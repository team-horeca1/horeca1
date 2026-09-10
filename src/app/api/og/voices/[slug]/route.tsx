import { ImageResponse } from 'next/og';
import { VoiceShareCard } from '@/lib/share-cards/templates';
import { resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { qrPngDataUrl } from '@/lib/share-cards/qr';
import { getPublishedVoiceStoryBySlug } from '@/modules/voices/voice.service';
import { voiceTitleLine } from '@/sanity/lib/types';

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
  const story = await getPublishedVoiceStoryBySlug(slug);
  const origin = new URL(req.url).origin;

  const name = story?.name ?? 'Horeca1 Voices';
  const quote = story?.quote ?? 'Stories from the industry, for the industry.';
  const badge = story?.badge ?? 'HORECA1 VOICES';
  const titleLine = story ? voiceTitleLine(story.role, story.venue) : '';
  const articleUrl = `${origin}/voices/${slug}`;
  const qrDataUrl = await qrPngDataUrl(articleUrl);
  const photoUrl = await resolveOgImage(origin, story?.photoOgUrl || story?.photoUrl);

  return new ImageResponse(
    (
      <VoiceShareCard
        format={format}
        name={name}
        badge={badge}
        quote={quote}
        titleLine={titleLine}
        photoUrl={photoUrl}
        articleUrl={articleUrl}
        qrDataUrl={qrDataUrl}
      />
    ),

    { ...SIZES[format] },
  );
}
