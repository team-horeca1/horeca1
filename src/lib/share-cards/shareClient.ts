export type ShareCardResult = 'shared' | 'copied' | 'cancelled';

export async function shareCard(opts: {
  title: string;
  text: string;
  url: string;
  imageUrl?: string | null;
}): Promise<ShareCardResult> {
  const { title, text, url, imageUrl } = opts;
  const caption = text.includes(url) ? text : `${text}\n${url}`;

  if (imageUrl && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const res = await fetch(imageUrl);
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], 'horeca1-share.png', { type: blob.type || 'image/png' });
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
