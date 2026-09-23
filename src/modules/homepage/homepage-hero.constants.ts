import { parseImageMeta } from '@/lib/imageMeta';

/** Static hero fallbacks — safe for client + server (no Prisma). */
export const HERO_FALLBACK = {
  desktopImageUrl: '/images/hero-right1.png',
  mobileImageUrl: '/images/mobile-hero-right.png',
  eyebrow: "India's Hospitality Supply Network",
  headline: 'Everything your restaurant needs. In one place.',
  ctaLabel: 'Start exploring',
  ctaHref: '/category',
  showText: true,
  showCta: true,
  copyAlignX: 'left',
  copyAlignY: 'bottom',
} as const;

export const HERO_ALIGN_X = ['left', 'center', 'right'] as const;
export const HERO_ALIGN_Y = ['top', 'center', 'bottom'] as const;
export type HeroAlignX = (typeof HERO_ALIGN_X)[number];
export type HeroAlignY = (typeof HERO_ALIGN_Y)[number];

export const HERO_POSITIONS: { x: HeroAlignX; y: HeroAlignY; label: string }[] = [
  { x: 'left', y: 'top', label: 'Top left' },
  { x: 'center', y: 'top', label: 'Top' },
  { x: 'right', y: 'top', label: 'Top right' },
  { x: 'left', y: 'center', label: 'Left' },
  { x: 'center', y: 'center', label: 'Center' },
  { x: 'right', y: 'center', label: 'Right' },
  { x: 'left', y: 'bottom', label: 'Bottom left' },
  { x: 'center', y: 'bottom', label: 'Bottom' },
  { x: 'right', y: 'bottom', label: 'Bottom right' },
];

export function isHeroAlignX(value: unknown): value is HeroAlignX {
  return typeof value === 'string' && (HERO_ALIGN_X as readonly string[]).includes(value);
}

export function isHeroAlignY(value: unknown): value is HeroAlignY {
  return typeof value === 'string' && (HERO_ALIGN_Y as readonly string[]).includes(value);
}

/** Empty mobile art reuses desktop, then the built-in asset. Never returns a blank URL. */
export function resolveHeroImages(
  desktopImageUrl: string | null | undefined,
  mobileImageUrl: string | null | undefined,
): { resolvedDesktopImageUrl: string; resolvedMobileImageUrl: string } {
  const desktop = desktopImageUrl?.trim() || HERO_FALLBACK.desktopImageUrl;
  const mobile =
    mobileImageUrl?.trim() || desktopImageUrl?.trim() || HERO_FALLBACK.mobileImageUrl;
  return { resolvedDesktopImageUrl: desktop, resolvedMobileImageUrl: mobile };
}

function isSitePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\');
}

function isHttpUrl(value: string, protocols: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Site path (`/category`) or an http(s) URL. Rejects `javascript:` and protocol-relative links. */
export function isSafeHeroHref(value: string): boolean {
  const v = value.trim();
  if (!v || /[\s\\]/.test(v)) return false;
  if (isSitePath(v)) return true;
  return isHttpUrl(v, ['https:', 'http:']);
}

/** Site path or https URL. A `#fp=` focal-point fragment is allowed and ignored here. */
export function isSafeHeroImageUrl(value: string): boolean {
  const src = parseImageMeta(value).src.trim();
  if (!src || /[\s\\]/.test(src)) return false;
  if (isSitePath(src)) return true;
  return isHttpUrl(src, ['https:']);
}
