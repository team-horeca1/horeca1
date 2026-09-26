import { parseImageMeta } from '@/lib/imageMeta';

/** Live homepage card sizes used by the admin preview. */
export const HERO_DESKTOP_CARD_WIDTH = 1300; // 1380 container − 2 × 40px padding
export const HERO_DESKTOP_CARD_HEIGHT = 240;
export const HERO_MOBILE_FRAME_WIDTH = 390;
export const HERO_MOBILE_SIDE_PADDING = 12; // matches --container-padding at 390px
export const HERO_MOBILE_CARD_HEIGHT = 200;
/** Position is 0–100% from the top-left of the banner (studio-style). */
export const HERO_POS_MIN = 0;
export const HERO_POS_MAX = 100;
/** @deprecated use HERO_POS_* — kept for older imports */
export const HERO_OFFSET_MIN = HERO_POS_MIN;
export const HERO_OFFSET_MAX = HERO_POS_MAX;

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
  copyAlignX: 'left' as const,
  copyAlignY: 'bottom' as const,
  /** Desktop text stack position (% from top-left). */
  copyOffsetX: 4,
  copyOffsetY: 58,
  showTextMobile: true,
  showCtaMobile: true,
  copyAlignXMobile: 'left' as const,
  copyAlignYMobile: 'bottom' as const,
  copyOffsetXMobile: 4,
  copyOffsetYMobile: 16,
};

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

/** Keep internal newlines (Shift+Enter); strip only leading/trailing whitespace. */
export function trimHeroCopy(value: string): string {
  return value.replace(/^\s+|\s+$/g, '');
}

export function clampHeroPos(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(HERO_POS_MIN, Math.min(HERO_POS_MAX, Math.round(value)));
}

/** @deprecated use clampHeroPos */
export function clampHeroOffset(value: number): number {
  return clampHeroPos(value);
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
