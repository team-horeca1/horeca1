/** Static hero fallbacks — safe for client + server (no Prisma). */
export const HERO_FALLBACK = {
  desktopImageUrl: '/images/hero-right1.png',
  mobileImageUrl: '/images/mobile-hero-right.png',
  eyebrow: "India's Hospitality Supply Network",
  headline: 'Everything your restaurant needs. In one place.',
  ctaLabel: 'Start exploring',
  ctaHref: '/category',
} as const;
