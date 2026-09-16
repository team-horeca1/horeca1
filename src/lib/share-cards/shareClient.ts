export type ShareCardResult = 'shared' | 'copied' | 'cancelled';

const blobCache = new Map<string, Promise<Blob | null>>();

function cacheShareBlob(imageUrl: string, promise: Promise<Blob | null>): void {
  blobCache.set(
    imageUrl,
    promise.then((blob) => {
      if (!blob) blobCache.delete(imageUrl);
      return blob;
    }),
  );
}

/** Prefetch an OG/share PNG into the in-memory blob cache (no UI wait). */
export function prefetchShareImage(imageUrl: string | null | undefined): void {
  if (!imageUrl || typeof window === 'undefined') return;
  if (blobCache.has(imageUrl)) return;
  cacheShareBlob(
    imageUrl,
    fetch(imageUrl)
      .then(async (res) => {
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) return null;
        return blob;
      })
      .catch(() => null),
  );
}

/** Resolve a share image blob, using the in-memory cache when available. */
export async function getShareImageBlob(
  imageUrl: string | null | undefined,
): Promise<Blob | null> {
  if (!imageUrl) return null;
  prefetchShareImage(imageUrl);
  const cached = blobCache.get(imageUrl);
  if (cached) return cached;
  return null;
}

function shareCaption(text: string, url: string): string {
  return text.includes(url) ? text : `${text}\n${url}`;
}

async function shareWithFiles(opts: {
  title: string;
  caption: string;
  blob: Blob;
  fileName: string;
}): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
    return false;
  }
  const file = new File([opts.blob], opts.fileName, {
    type: opts.blob.type || 'image/png',
  });
  if (!navigator.canShare({ files: [file] })) return false;
  // WhatsApp/Instagram drop a separate `url` field when files are attached.
  // Put the public link in the caption so it travels with the PNG.
  await navigator.share({ title: opts.title, text: opts.caption, files: [file] });
  return true;
}

export async function shareCard(opts: {
  title: string;
  text: string;
  url: string;
  imageUrl?: string | null;
  fileName?: string;
  /** When true, skip waiting for image fetch — share text/url only. */
  skipFileWait?: boolean;
}): Promise<ShareCardResult> {
  const { title, text, url, imageUrl, skipFileWait } = opts;
  const caption = shareCaption(text, url);
  const fileName = opts.fileName || 'horeca1-share.png';

  if (!skipFileWait && imageUrl) {
    try {
      const blob = await getShareImageBlob(imageUrl);
      if (blob) {
        const sent = await shareWithFiles({ title, caption, blob, fileName });
        if (sent) return 'shared';
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    if (navigator.share) {
      await navigator.share({ title, text: caption, url });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
  }

  await navigator.clipboard.writeText(url);
  return 'copied';
}

export function openWhatsAppShare(text: string): void {
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
}

export async function downloadShareImage(
  imageUrl: string,
  filename: string,
): Promise<boolean> {
  try {
    const blob = await getShareImageBlob(imageUrl);
    if (!blob) return false;
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    return false;
  }
}
