import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export function absoluteMediaUrl(origin: string, url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return ogSafeRaster(trimmed);
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return ogSafeRaster(`${origin.replace(/\/$/, '')}${path}`);
}

/**
 * Resolves an image URL for Satori / next/og.
 * Satori cannot reliably fetch localhost or edge URLs, and cannot decode WebP/AVIF.
 * Using sharp, this reads local public files directly or fetches remote CDNs,
 * then converts them into an inline PNG data URL for guaranteed 100% reliable rendering.
 */
export async function resolveOgImage(origin: string, url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Already a data URL
  if (trimmed.startsWith('data:')) return trimmed;

  try {
    let inputBuffer: Buffer | null = null;

    // 1. Local static file in public directory
    if (trimmed.startsWith('/')) {
      const cleanPath = trimmed.split('?')[0];
      const filePath = path.join(process.cwd(), 'public', cleanPath);
      if (fs.existsSync(filePath)) {
        inputBuffer = await fs.promises.readFile(filePath);
      }
    }

    // 2. Remote URL or fallback
    if (!inputBuffer) {
      const absUrl = absoluteMediaUrl(origin, trimmed);
      if (!absUrl) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(absUrl, { signal: controller.signal });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          inputBuffer = Buffer.from(ab);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    if (inputBuffer && inputBuffer.length > 0) {
      const pngBuffer = await sharp(inputBuffer)
        .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      return `data:image/png;base64,${pngBuffer.toString('base64')}`;
    }
  } catch (err) {
    console.warn('[resolveOgImage] Sharp conversion fallback:', err);
  }

  return absoluteMediaUrl(origin, trimmed);
}

/**
 * next/og (Satori) cannot decode webp/avif/svg directly.
 * Instead of dropping them, convert CDN URLs (ImageKit, Sanity, etc.) to JPG/PNG.
 */
function ogSafeRaster(url: string): string | null {
  // ImageKit URL: convert to JPEG format via tr=f-jpg
  if (url.includes('ik.imagekit.io') || url.includes('imagekit.io')) {
    if (url.includes('tr=')) {
      return url.replace(/tr=([^&]*)/, 'tr=f-jpg,$1');
    }
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}tr=f-jpg`;
  }

  // Sanity CDN URL: force JPG via fm=jpg
  if (url.includes('cdn.sanity.io')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}fm=jpg`;
  }

  // Generic webp/avif/svg check
  if (/\.(webp|avif|svg)(\?|$)/i.test(url)) {
    return null;
  }
  return url;
}

