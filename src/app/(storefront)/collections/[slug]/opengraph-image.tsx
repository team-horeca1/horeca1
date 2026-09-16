import { renderCollectionShareImage } from '@/lib/share-cards/renderCollectionCard';
import { ImageResponse } from 'next/og';

export const alt = 'Horeca1 Collection';
export const size = { width: 1080, height: 1080 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const image = await renderCollectionShareImage(slug, 'square');
  if (!image) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#6B1D2E',
            color: 'white',
            fontSize: 48,
            fontWeight: 800,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          HORECA1
        </div>
      ),
      { ...size },
    );
  }
  return image;
}
