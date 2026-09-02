import { ImageResponse } from 'next/og';
import { getPublishedVoiceStoryBySlug } from '@/modules/voices/voice.service';

export const alt = 'Horeca1 Voice story';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getPublishedVoiceStoryBySlug(slug);

  const name = story?.name ?? 'Horeca1 Voices';
  const quote = story?.quote ?? 'Stories from the industry, for the industry.';
  const badge = story?.badge ?? 'HORECA1 VOICES';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 64,
          background: 'linear-gradient(135deg, #4A141F 0%, #6B1D2E 50%, #7A2438 100%)',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 22, opacity: 0.85, marginBottom: 16, letterSpacing: 2 }}>{badge}</div>
        <div style={{ fontSize: 56, fontWeight: 700, marginBottom: 24, lineHeight: 1.1 }}>{name}</div>
        <div style={{ fontSize: 28, opacity: 0.92, lineHeight: 1.4, maxWidth: 900 }}>&ldquo;{quote}&rdquo;</div>
        <div style={{ position: 'absolute', bottom: 48, right: 64, fontSize: 24, fontWeight: 600 }}>horeca1</div>
      </div>
    ),
    { ...size },
  );
}
