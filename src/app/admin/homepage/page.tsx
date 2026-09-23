'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { HeroPlacementCanvas } from '@/components/features/homepage/HeroPlacementCanvas';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { usePermissions } from '@/hooks/usePermissions';
import {
  HERO_DESKTOP_CARD_HEIGHT,
  HERO_DESKTOP_CARD_WIDTH,
  HERO_FALLBACK,
  HERO_MOBILE_CARD_HEIGHT,
  HERO_MOBILE_FRAME_WIDTH,
  HERO_MOBILE_SIDE_PADDING,
  clampHeroPos,
  isHeroAlignX,
  isHeroAlignY,
  isSafeHeroHref,
  resolveHeroImages,
  trimHeroCopy,
  type HeroAlignX,
  type HeroAlignY,
} from '@/modules/homepage/homepage-hero.constants';

type HeroForm = {
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
  eyebrow: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
  showText: boolean;
  showCta: boolean;
  copyAlignX: HeroAlignX;
  copyAlignY: HeroAlignY;
  copyOffsetX: number;
  copyOffsetY: number;
  showTextMobile: boolean;
  showCtaMobile: boolean;
  copyAlignXMobile: HeroAlignX;
  copyAlignYMobile: HeroAlignY;
  copyOffsetXMobile: number;
  copyOffsetYMobile: number;
};

const EMPTY: HeroForm = {
  desktopImageUrl: null,
  mobileImageUrl: null,
  eyebrow: HERO_FALLBACK.eyebrow,
  headline: HERO_FALLBACK.headline,
  ctaLabel: HERO_FALLBACK.ctaLabel,
  ctaHref: HERO_FALLBACK.ctaHref,
  showText: HERO_FALLBACK.showText,
  showCta: HERO_FALLBACK.showCta,
  copyAlignX: HERO_FALLBACK.copyAlignX,
  copyAlignY: HERO_FALLBACK.copyAlignY,
  copyOffsetX: HERO_FALLBACK.copyOffsetX,
  copyOffsetY: HERO_FALLBACK.copyOffsetY,
  showTextMobile: HERO_FALLBACK.showTextMobile,
  showCtaMobile: HERO_FALLBACK.showCtaMobile,
  copyAlignXMobile: HERO_FALLBACK.copyAlignXMobile,
  copyAlignYMobile: HERO_FALLBACK.copyAlignYMobile,
  copyOffsetXMobile: HERO_FALLBACK.copyOffsetXMobile,
  copyOffsetYMobile: HERO_FALLBACK.copyOffsetYMobile,
};

function toForm(d: Partial<HeroForm> & Record<string, unknown>): HeroForm {
  return {
    desktopImageUrl: (d.desktopImageUrl as string | null | undefined) ?? null,
    mobileImageUrl: (d.mobileImageUrl as string | null | undefined) ?? null,
    eyebrow: typeof d.eyebrow === 'string' ? d.eyebrow : '',
    headline: typeof d.headline === 'string' ? d.headline : '',
    ctaLabel: typeof d.ctaLabel === 'string' ? d.ctaLabel : '',
    ctaHref: typeof d.ctaHref === 'string' ? d.ctaHref : '',
    showText: d.showText !== false,
    showCta: d.showCta !== false,
    copyAlignX: isHeroAlignX(d.copyAlignX) ? d.copyAlignX : 'left',
    copyAlignY: isHeroAlignY(d.copyAlignY) ? d.copyAlignY : 'bottom',
    copyOffsetX: clampHeroPos(typeof d.copyOffsetX === 'number' ? d.copyOffsetX : HERO_FALLBACK.copyOffsetX),
    copyOffsetY: clampHeroPos(typeof d.copyOffsetY === 'number' ? d.copyOffsetY : HERO_FALLBACK.copyOffsetY),
    showTextMobile: d.showTextMobile !== false,
    showCtaMobile: d.showCtaMobile !== false,
    copyAlignXMobile: isHeroAlignX(d.copyAlignXMobile) ? d.copyAlignXMobile : 'left',
    copyAlignYMobile: isHeroAlignY(d.copyAlignYMobile) ? d.copyAlignYMobile : 'bottom',
    copyOffsetXMobile: clampHeroPos(
      typeof d.copyOffsetXMobile === 'number' ? d.copyOffsetXMobile : HERO_FALLBACK.copyOffsetXMobile,
    ),
    copyOffsetYMobile: clampHeroPos(
      typeof d.copyOffsetYMobile === 'number' ? d.copyOffsetYMobile : HERO_FALLBACK.copyOffsetYMobile,
    ),
  };
}

export default function AdminHomepageHeroPage() {
  const { can } = usePermissions();
  const canEdit = can('settings.edit');

  const [form, setForm] = useState<HeroForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/homepage/hero', { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      setForm(toForm(json.data));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load hero');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/homepage/hero', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desktopImageUrl: form.desktopImageUrl,
          mobileImageUrl: form.mobileImageUrl,
          eyebrow: trimHeroCopy(form.eyebrow),
          headline: trimHeroCopy(form.headline),
          ctaLabel: form.ctaLabel.trim(),
          ctaHref: form.ctaHref.trim(),
          showText: form.showText,
          showCta: form.showCta,
          copyAlignX: form.copyAlignX,
          copyAlignY: form.copyAlignY,
          copyOffsetX: form.copyOffsetX,
          copyOffsetY: form.copyOffsetY,
          showTextMobile: form.showTextMobile,
          showCtaMobile: form.showCtaMobile,
          copyAlignXMobile: form.copyAlignXMobile,
          copyAlignYMobile: form.copyAlignYMobile,
          copyOffsetXMobile: form.copyOffsetXMobile,
          copyOffsetYMobile: form.copyOffsetYMobile,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Save failed');
      toast.success('Homepage hero saved');
      setForm(toForm(json.data));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-[#667085]">
        <Loader2 className="animate-spin mr-2" size={20} />
        Loading hero…
      </div>
    );
  }

  const images = resolveHeroImages(form.desktopImageUrl, form.mobileImageUrl);
  const mobileCardWidth = HERO_MOBILE_FRAME_WIDTH - HERO_MOBILE_SIDE_PADDING * 2;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#F8E8EC] flex items-center justify-center shrink-0">
          <ImageIcon size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-[clamp(1.25rem,2vw,1.5rem)] font-bold text-[#1C1C1C]">
            Homepage Hero
          </h1>
          <p className="text-[13px] text-[#667085] mt-1">
            Upload the photo, write the copy, then drag text on the image — same
            placement idea as studio.aneeverse. Text and Button each have a clear
            On/Off control for mobile and for desktop.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E9E3DD] p-6 space-y-6">
        <ImageUploadField
          label="Desktop image"
          value={form.desktopImageUrl}
          onChange={(url) => setForm((f) => ({ ...f, desktopImageUrl: url }))}
          folder="banners"
          aspectHint="1200 × 600. Fills the entire desktop banner."
          variant="homepage-hero-desktop"
        />

        <ImageUploadField
          label="Mobile image (optional)"
          value={form.mobileImageUrl}
          onChange={(url) => setForm((f) => ({ ...f, mobileImageUrl: url }))}
          folder="banners"
          aspectHint="900 × 500. Leave empty to reuse the desktop photo."
          variant="homepage-hero-mobile"
        />

        <div className="space-y-4 pt-2 border-t border-[#E9E3DD]">
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              Eyebrow <span className="font-normal text-[#667085]">(optional)</span>
            </label>
            <textarea
              value={form.eyebrow}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, eyebrow: e.target.value }))}
              maxLength={255}
              rows={2}
              placeholder="Shift+Enter for a new line"
              className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-primary/40 focus:bg-white resize-y disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              Headline <span className="font-normal text-[#667085]">(optional)</span>
            </label>
            <textarea
              value={form.headline}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
              maxLength={500}
              rows={3}
              placeholder="Shift+Enter starts a new line on the banner."
              className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-primary/40 focus:bg-white resize-y disabled:opacity-60"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                Button label <span className="font-normal text-[#667085]">(optional)</span>
              </label>
              <input
                type="text"
                value={form.ctaLabel}
                disabled={!canEdit}
                onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                maxLength={120}
                className="w-full h-11 bg-[#F8F9FB] border border-[#EEEEEE] rounded-xl px-4 text-[14px] outline-none focus:border-primary/40 focus:bg-white disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                Button link <span className="font-normal text-[#667085]">(optional)</span>
              </label>
              <input
                type="text"
                value={form.ctaHref}
                disabled={!canEdit}
                onChange={(e) => setForm((f) => ({ ...f, ctaHref: e.target.value }))}
                maxLength={500}
                placeholder="/category"
                className="w-full h-11 bg-[#F8F9FB] border border-[#EEEEEE] rounded-xl px-4 text-[14px] outline-none focus:border-primary/40 focus:bg-white disabled:opacity-60"
              />
            </div>
          </div>
          {(form.showCta || form.showCtaMobile) &&
            form.ctaLabel.trim() &&
            !form.ctaHref.trim() && (
              <p className="text-[12px] text-[#667085]">Add a link to show the button.</p>
            )}
          {(form.showCta || form.showCtaMobile) &&
            form.ctaHref.trim() &&
            !isSafeHeroHref(form.ctaHref) && (
              <p className="text-[12px] text-[#DC2626]">
                Use a site path such as /category, or an http(s) URL.
              </p>
            )}
        </div>

        <div className="space-y-8 pt-2 border-t border-[#E9E3DD]">
          <HeroPlacementCanvas
            label="Mobile placement"
            width={mobileCardWidth}
            height={HERO_MOBILE_CARD_HEIGHT}
            imageUrl={images.resolvedMobileImageUrl}
            eyebrow={form.eyebrow}
            headline={form.headline}
            ctaLabel={form.ctaLabel}
            ctaHref={form.ctaHref}
            disabled={!canEdit}
            value={{
              showText: form.showTextMobile,
              showCta: form.showCtaMobile,
              posX: form.copyOffsetXMobile,
              posY: form.copyOffsetYMobile,
              alignX: form.copyAlignXMobile,
            }}
            onChange={(next) =>
              setForm((f) => ({
                ...f,
                showTextMobile: next.showText,
                showCtaMobile: next.showCta,
                copyOffsetXMobile: next.posX,
                copyOffsetYMobile: next.posY,
                copyAlignXMobile: next.alignX,
              }))
            }
          />

          <HeroPlacementCanvas
            label="Desktop placement"
            width={HERO_DESKTOP_CARD_WIDTH}
            height={HERO_DESKTOP_CARD_HEIGHT}
            imageUrl={images.resolvedDesktopImageUrl}
            eyebrow={form.eyebrow}
            headline={form.headline}
            ctaLabel={form.ctaLabel}
            ctaHref={form.ctaHref}
            disabled={!canEdit}
            value={{
              showText: form.showText,
              showCta: form.showCta,
              posX: form.copyOffsetX,
              posY: form.copyOffsetY,
              alignX: form.copyAlignX,
            }}
            onChange={(next) =>
              setForm((f) => ({
                ...f,
                showText: next.showText,
                showCta: next.showCta,
                copyOffsetX: next.posX,
                copyOffsetY: next.posY,
                copyAlignX: next.alignX,
              }))
            }
          />
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-xl bg-primary text-white text-[14px] font-semibold hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save hero
          </button>
        )}
      </div>
    </div>
  );
}
