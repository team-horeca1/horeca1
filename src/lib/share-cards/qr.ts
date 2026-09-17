import QRCode from 'qrcode'

const qrCache = new Map<string, string>();
const MAX_QR_CACHE = 250;

export async function qrPngDataUrl(text: string): Promise<string | null> {
  const cached = qrCache.get(text);
  if (cached) return cached;

  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1C1C1C', light: '#FFFFFF' },
    });
    if (dataUrl) {
      if (qrCache.size >= MAX_QR_CACHE) {
        const first = qrCache.keys().next().value;
        if (first) qrCache.delete(first);
      }
      qrCache.set(text, dataUrl);
    }
    return dataUrl;
  } catch {
    return null;
  }
}
