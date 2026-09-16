export type ShareCardResult = 'shared' | 'copied' | 'cancelled';

const blobCache = new Map<string, Promise<Blob | null>>();

/** Prefetch an OG/share PNG into the in-memory blob cache (no UI wait). */
export function prefetchShareImage(imageUrl: string | null | undefined): void {
  if (!imageUrl || typeof window === 'undefined') return;
  if (blobCache.has(imageUrl)) return;
  blobCache.set(
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

export async function shareCard(opts: {
  title: string;
  text: string;
  url: string;
  imageUrl?: string | null;
  /** When true, skip waiting for image fetch — share text/url only. */
  skipFileWait?: boolean;
}): Promise<ShareCardResult> {
  const { title, text, url, imageUrl, skipFileWait } = opts;
  const caption = text.includes(url) ? text : `${text}\n${url}`;

  if (
    !skipFileWait &&
    imageUrl &&
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare
  ) {
    try {
      const blob = await getShareImageBlob(imageUrl);
      if (blob) {
        const file = new File([blob], 'horeca1-share.png', {
          type: blob.type || 'image/png',
        });
        if (navigator.canShare({ files: [file] })) {
          // WhatsApp / Instagram drop `url` when files are attached — put the link in the caption.
          await navigator.share({ title, text: caption, url, files: [file] });
          return 'shared';
        }
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
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
