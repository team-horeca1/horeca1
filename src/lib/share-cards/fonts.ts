import 'server-only';
import fs from 'fs';
import path from 'path';

export type ShareFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: 'normal';
};

let fontsPromise: Promise<ShareFont[]> | null = null;

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return copy;
}

/**
 * Load Inter 400/600/700 once for next/og (Satori).
 * Files live in public/fonts/share/ so they ship with the Docker standalone build.
 */
export function loadShareFonts(): Promise<ShareFont[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const dir = path.join(process.cwd(), 'public', 'fonts', 'share');
      const specs: Array<{ file: string; weight: 400 | 600 | 700 }> = [
        { file: 'inter-400.woff', weight: 400 },
        { file: 'inter-600.woff', weight: 600 },
        { file: 'inter-700.woff', weight: 700 },
      ];
      const fonts: ShareFont[] = [];
      for (const spec of specs) {
        const filePath = path.join(dir, spec.file);
        const buf = await fs.promises.readFile(filePath);
        fonts.push({
          name: 'Inter',
          data: toArrayBuffer(buf),
          weight: spec.weight,
          style: 'normal',
        });
      }
      return fonts;
    })().catch((err) => {
      console.warn('[share-card] Inter fonts unavailable, falling back to default:', err);
      fontsPromise = null;
      return [];
    });
  }
  return fontsPromise;
}
