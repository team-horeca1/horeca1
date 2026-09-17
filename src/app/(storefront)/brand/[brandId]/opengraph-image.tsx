import { renderBrandShareImage } from '@/lib/share-cards/renderBrandCard';
import { ImageResponse } from 'next/og';

export const alt = 'Horeca1 Brand Store';
export const size = { width: 1080, height: 1080 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const image = await renderBrandShareImage(brandId, 'square');
  if (!image) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FFFFFF',
            color: '#6B1D2E',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: 2 }}>HORECA1</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#6B7280', marginTop: 12 }}>Brand Store</div>
        </div>
      ),
      { ...size },
    );
  }
  return image;
}
