import { createImageUrlBuilder } from '@sanity/image-url'
import type { SanityImageSource } from '@sanity/image-url'
import { client } from './client'

const builder = createImageUrlBuilder(client)

export function urlFor(source: SanityImageSource) {
  return builder.image(source)
}

export function sanityImageUrl(
  source: SanityImageSource | null | undefined,
  width = 1200,
): string | null {
  if (!source) return null
  try {
    return builder.image(source).width(width).auto('format').url()
  } catch {
    return null
  }
}

/** JPEG for next/og (Satori cannot decode webp/avif). */
export function sanityOgImageUrl(
  source: SanityImageSource | null | undefined,
  width = 1080,
): string | null {
  if (!source) return null
  try {
    return builder.image(source).width(width).format('jpg').quality(80).url()
  } catch {
    return null
  }
}
