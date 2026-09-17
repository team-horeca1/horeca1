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

// In-memory cache for resolved base64 data URLs to prevent repeat remote network fetches and Sharp re-encodings
const resolvedImageCache = new Map<string, string>();
const MAX_IMAGE_CACHE = 150;

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

  // Fast path: In-memory cached data URL
  const cacheKey = `${origin}:${trimmed}`;
  const cached = resolvedImageCache.get(cacheKey);
  if (cached) return cached;

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
      const timeout = setTimeout(() => controller.abort(), 4000);
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
      // Fast Sharp encoding: 600x600 inside with compressionLevel: 1 and effort: 1
      const pngBuffer = await sharp(inputBuffer)
        .flatten({ background: '#ffffff' })
        .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 1, effort: 1 })
        .toBuffer();
      const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

      if (resolvedImageCache.size >= MAX_IMAGE_CACHE) {
        const first = resolvedImageCache.keys().next().value;
        if (first) resolvedImageCache.delete(first);
      }
      resolvedImageCache.set(cacheKey, dataUrl);
      return dataUrl;
    }
  } catch (err) {
    console.warn('[resolveOgImage] Sharp conversion fallback:', err);
  }

  return absoluteMediaUrl(origin, trimmed);
}

/**
 * next/og (Satori) cannot decode webp/avif/svg directly.
 * Instead of dropping them, convert CDN URLs (ImageKit, Sanity, etc.) to JPG/PNG
 * ensuring transparent backgrounds are cleanly flattened on white (never black).
 */
function ogSafeRaster(url: string): string | null {
  // ImageKit URL: convert to PNG/JPG with clean white background
  if (url.includes('ik.imagekit.io') || url.includes('imagekit.io')) {
    if (url.includes('tr=')) {
      return url.replace(/tr=([^&]*)/, 'tr=f-png,bg-FFFFFF,$1');
    }
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}tr=f-png,bg-FFFFFF`;
  }

  // Sanity CDN URL: force JPG with white background
  if (url.includes('cdn.sanity.io')) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}fm=jpg&bg=ffffff`;
  }

  // Generic webp/avif/svg check
  if (/\.(webp|avif|svg)(\?|$)/i.test(url)) {
    return null;
  }
  return url;
}

