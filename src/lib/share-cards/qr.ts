import QRCode from 'qrcode'

export async function qrPngDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1C1C1C', light: '#FFFFFF' },
    })
  } catch {
    return null
  }
}
