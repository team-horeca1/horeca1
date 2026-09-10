import 'server-only'
import { revalidatePath } from 'next/cache'
import { toFile } from '@imagekit/nodejs'
import { getImageKit, IMAGEKIT_FOLDERS } from '@/lib/imagekit'
import { getWriteClient } from '@/sanity/lib/writeClient'

export function voicesSiteOrigin(req?: Request): string {
  if (req) {
    try {
      const origin = new URL(req.url).origin
      if (origin && !origin.includes('0.0.0.0')) return origin
    } catch {
      /* fall through */
    }
  }
  return (process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')
}

async function uploadPng(buffer: Buffer, fileName: string) {
  const imagekit = getImageKit()
  const uploaded = await imagekit.files.upload({
    file: await toFile(buffer, fileName, { type: 'image/png' }),
    fileName,
    folder: IMAGEKIT_FOLDERS.voices,
    useUniqueFileName: true,
  })
  if (!uploaded.url) throw new Error('ImageKit upload returned no URL')
  return uploaded.url
}

export async function generateVoiceShareCards(opts: {
  slug: string
  id: string
  origin: string
  publishedAt?: string | null
}): Promise<{ storySquareUrl: string; storyPortraitUrl: string }> {
  const write = getWriteClient()
  if (!write) throw new Error('Write token missing')

  const origin = opts.origin.replace(/\/$/, '')
  const [squareRes, portraitRes] = await Promise.all([
    fetch(`${origin}/api/og/voices/${encodeURIComponent(opts.slug)}?format=square`),
    fetch(`${origin}/api/og/voices/${encodeURIComponent(opts.slug)}?format=portrait`),
  ])

  if (!squareRes.ok || !portraitRes.ok) {
    throw new Error('Failed to render share cards')
  }

  const [squareBuf, portraitBuf] = await Promise.all([
    squareRes.arrayBuffer().then((b) => Buffer.from(b)),
    portraitRes.arrayBuffer().then((b) => Buffer.from(b)),
  ])

  const [storySquareUrl, storyPortraitUrl] = await Promise.all([
    uploadPng(squareBuf, `square-${opts.slug}.png`),
    uploadPng(portraitBuf, `story-${opts.slug}.png`),
  ])

  const patch: Record<string, string> = { storySquareUrl, storyPortraitUrl }
  if (!opts.publishedAt) {
    patch.publishedAt = new Date().toISOString()
  }

  const id = opts.id.replace(/^drafts\./, '')
  await write.patch(id).set(patch).commit()
  revalidatePath('/')
  revalidatePath('/voices')
  revalidatePath(`/voices/${opts.slug}`)

  return { storySquareUrl, storyPortraitUrl }
}
