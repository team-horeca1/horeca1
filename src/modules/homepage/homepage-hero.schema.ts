import { z } from 'zod';
import {
  HERO_ALIGN_X,
  HERO_ALIGN_Y,
  HERO_POS_MAX,
  HERO_POS_MIN,
  clampHeroPos,
  isSafeHeroHref,
  isSafeHeroImageUrl,
  trimHeroCopy,
} from '@/modules/homepage/homepage-hero.constants';
import type { HomepageHeroSlideInput } from '@/modules/homepage/homepage-hero.service';

const optionalImageUrl = z
  .union([z.string().max(1024), z.literal(''), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v.trim() === '') return null;
    return v.trim();
  })
  .refine((v) => v == null || isSafeHeroImageUrl(v), {
    message: 'Use a site path or an https image URL',
  });

const offsetSchema = z
  .number()
  .int()
  .min(HERO_POS_MIN)
  .max(HERO_POS_MAX)
  .optional()
  .transform((v) => (v === undefined ? undefined : clampHeroPos(v)));

export const slideBodySchema = z.object({
  desktopImageUrl: optionalImageUrl,
  mobileImageUrl: optionalImageUrl,
  eyebrow: z.string().max(255).transform(trimHeroCopy).optional(),
  headline: z.string().max(500).transform(trimHeroCopy).optional(),
  ctaLabel: z.string().trim().max(120).optional(),
  ctaHref: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === '' || isSafeHeroHref(value), {
      message: 'Use a site path or an http(s) URL',
    })
    .optional(),
  showText: z.boolean().optional(),
  showCta: z.boolean().optional(),
  copyAlignX: z.enum(HERO_ALIGN_X).optional(),
  copyAlignY: z.enum(HERO_ALIGN_Y).optional(),
  copyOffsetX: offsetSchema,
  copyOffsetY: offsetSchema,
  showTextMobile: z.boolean().optional(),
  showCtaMobile: z.boolean().optional(),
  copyAlignXMobile: z.enum(HERO_ALIGN_X).optional(),
  copyAlignYMobile: z.enum(HERO_ALIGN_Y).optional(),
  copyOffsetXMobile: offsetSchema,
  copyOffsetYMobile: offsetSchema,
  isActive: z.boolean().optional(),
});

export function bodyToSlideInput(
  body: z.infer<typeof slideBodySchema>,
): HomepageHeroSlideInput {
  const data: HomepageHeroSlideInput = {};
  if (body.desktopImageUrl !== undefined) data.desktopImageUrl = body.desktopImageUrl;
  if (body.mobileImageUrl !== undefined) data.mobileImageUrl = body.mobileImageUrl;
  if (body.eyebrow !== undefined) data.eyebrow = body.eyebrow;
  if (body.headline !== undefined) data.headline = body.headline;
  if (body.ctaLabel !== undefined) data.ctaLabel = body.ctaLabel;
  if (body.ctaHref !== undefined) data.ctaHref = body.ctaHref;
  if (body.showText !== undefined) data.showText = body.showText;
  if (body.showCta !== undefined) data.showCta = body.showCta;
  if (body.copyAlignX !== undefined) data.copyAlignX = body.copyAlignX;
  if (body.copyAlignY !== undefined) data.copyAlignY = body.copyAlignY;
  if (body.copyOffsetX !== undefined) data.copyOffsetX = body.copyOffsetX;
  if (body.copyOffsetY !== undefined) data.copyOffsetY = body.copyOffsetY;
  if (body.showTextMobile !== undefined) data.showTextMobile = body.showTextMobile;
  if (body.showCtaMobile !== undefined) data.showCtaMobile = body.showCtaMobile;
  if (body.copyAlignXMobile !== undefined) data.copyAlignXMobile = body.copyAlignXMobile;
  if (body.copyAlignYMobile !== undefined) data.copyAlignYMobile = body.copyAlignYMobile;
  if (body.copyOffsetXMobile !== undefined) data.copyOffsetXMobile = body.copyOffsetXMobile;
  if (body.copyOffsetYMobile !== undefined) data.copyOffsetYMobile = body.copyOffsetYMobile;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  return data;
}
