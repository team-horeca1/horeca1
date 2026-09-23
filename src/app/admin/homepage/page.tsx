'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Hero } from '@/components/features/Hero';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  HERO_FALLBACK,
  HERO_POSITIONS,
  isHeroAlignX,
  isHeroAlignY,
  isSafeHeroHref,
  resolveHeroImages,
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
};

function toForm(d: {
  desktopImageUrl?: string | null;
  mobileImageUrl?: string | null;
  eyebrow?: string | null;
  headline?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  showText?: boolean;
  showCta?: boolean;
  copyAlignX?: string | null;
  copyAlignY?: string | null;
}): HeroForm {
  return {
    desktopImageUrl: d.desktopImageUrl ?? null,
    mobileImageUrl: d.mobileImageUrl ?? null,
    eyebrow: d.eyebrow ?? '',
    headline: d.headline ?? '',
    ctaLabel: d.ctaLabel ?? '',
    ctaHref: d.ctaHref ?? '',
    showText: d.showText !== false,
    showCta: d.showCta !== false,
    copyAlignX: isHeroAlignX(d.copyAlignX) ? d.copyAlignX : 'left',
    copyAlignY: isHeroAlignY(d.copyAlignY) ? d.copyAlignY : 'bottom',
  };
}

function HeroSwitch({
  label,
  description,
  on,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  on: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[14px] font-semibold text-[#1C1C1C]">{label}</p>
        <p className="text-[12px] text-[#667085] mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cn(
          'relative w-[52px] h-[28px] rounded-full transition-colors shrink-0 disabled:opacity-60',
          on ? 'bg-primary' : 'bg-[#D9D9D9]',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-transform',
            on ? 'translate-x-[27px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  );
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
          eyebrow: form.eyebrow.trim(),
          headline: form.headline.trim(),
          ctaLabel: form.ctaLabel.trim(),
          ctaHref: form.ctaHref.trim(),
          showText: form.showText,
          showCta: form.showCta,
          copyAlignX: form.copyAlignX,
          copyAlignY: form.copyAlignY,
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
  const mobileSource = form.mobileImageUrl?.trim()
    ? 'Using the mobile photo.'
    : form.desktopImageUrl?.trim()
      ? 'No mobile photo yet — this preview uses the desktop image.'
      : 'No photos uploaded — this preview uses the built-in artwork.';

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
            The photo fills the whole banner. Turn text or the button off for an
            image-only banner, or leave them on and pick where they sit. Clear the
            mobile photo to reuse the desktop one.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E9E3DD] p-6 space-y-6">
        <ImageUploadField
          label="Desktop image"
          value={form.desktopImageUrl}
          onChange={(url) => setForm((f) => ({ ...f, desktopImageUrl: url }))}
          folder="banners"
          aspectHint="1200 × 600. Fills the entire desktop banner. Set the focal point so the subject stays in frame."
          variant="homepage-hero-desktop"
        />

        <ImageUploadField
          label="Mobile image (optional)"
          value={form.mobileImageUrl}
          onChange={(url) => setForm((f) => ({ ...f, mobileImageUrl: url }))}
          folder="banners"
          aspectHint="900 × 500. Fills the entire mobile banner. Leave empty to reuse the desktop photo."
          variant="homepage-hero-mobile"
        />

        <div className="space-y-4 pt-2 border-t border-[#E9E3DD]">
          <HeroSwitch
            label="Text"
            description="Eyebrow and headline on the photo."
            on={form.showText}
            disabled={!canEdit}
            onChange={(showText) => setForm((f) => ({ ...f, showText }))}
          />
          <HeroSwitch
            label="Button"
            description="The call-to-action on the photo."
            on={form.showCta}
            disabled={!canEdit}
            onChange={(showCta) => setForm((f) => ({ ...f, showCta }))}
          />

          {(form.showText || form.showCta) && (
            <div>
              <p className="text-[13px] font-semibold text-gray-700 mb-2">Position</p>
              <div className="flex items-center gap-4">
                <div className="grid grid-cols-3 gap-1.5 w-[108px]" role="group" aria-label="Text and button position">
                  {HERO_POSITIONS.map((spot) => {
                    const selected = form.copyAlignX === spot.x && form.copyAlignY === spot.y;
                    return (
                      <button
                        key={spot.label}
                        type="button"
                        aria-label={spot.label}
                        aria-pressed={selected}
                        title={spot.label}
                        disabled={!canEdit}
                        onClick={() => setForm((f) => ({ ...f, copyAlignX: spot.x, copyAlignY: spot.y }))}
                        className={cn(
                          'h-8 rounded-lg border transition-colors',
                          selected
                            ? 'bg-primary border-primary'
                            : 'bg-[#F8F9FB] border-[#E9E3DD] hover:border-primary/40',
                          !canEdit && 'opacity-60',
                        )}
                      />
                    );
                  })}
                </div>
                <p className="text-[13px] text-[#667085]">
                  {HERO_POSITIONS.find((spot) => spot.x === form.copyAlignX && spot.y === form.copyAlignY)?.label}
                </p>
              </div>
            </div>
          )}

          {!form.showText && !form.showCta && (
            <p className="text-[13px] text-[#667085]">
              Image only. Turn text or the button back on to place them. Your wording is kept.
            </p>
          )}
          {form.showText && (
            <>
              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                  Eyebrow <span className="font-normal text-[#667085]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.eyebrow}
                  disabled={!canEdit}
                  onChange={(e) => setForm((f) => ({ ...f, eyebrow: e.target.value }))}
                  maxLength={255}
                  className="w-full h-11 bg-[#F8F9FB] border border-[#EEEEEE] rounded-xl px-4 text-[14px] outline-none focus:border-primary/40 focus:bg-white disabled:opacity-60"
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
                  rows={2}
                  placeholder="Shown on the photo"
                  className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-primary/40 focus:bg-white resize-none disabled:opacity-60"
                />
              </div>
            </>
          )}
          {form.showCta && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>}
          {form.showCta && form.ctaLabel.trim() && !form.ctaHref.trim() && (
            <p className="text-[12px] text-[#667085]">
              Add a link to show the button.
            </p>
          )}
          {form.showCta && form.ctaHref.trim() && !isSafeHeroHref(form.ctaHref) && (
            <p className="text-[12px] text-[#DC2626]">
              Use a site path such as /category, or an http(s) URL.
            </p>
          )}
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

      <div className="space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1C1C1C]">Preview</h2>
          <p className="text-[13px] text-[#667085] mt-1">
            Updates as you type, before you save. {mobileSource}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667085]">
            Mobile
          </p>
          <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] border border-[#E9E3DD] bg-[#FAF7F2]">
            <Hero
              layout="mobile"
              heading="h2"
              eyebrow={form.eyebrow.trim()}
              headline={form.headline.trim()}
              ctaLabel={form.ctaLabel.trim()}
              ctaHref={form.ctaHref.trim()}
              showText={form.showText}
              showCta={form.showCta}
              copyAlignX={form.copyAlignX}
              copyAlignY={form.copyAlignY}
              desktopImageUrl={images.resolvedDesktopImageUrl}
              mobileImageUrl={images.resolvedMobileImageUrl}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667085]">
            Desktop
          </p>
          <div className="overflow-hidden rounded-[24px] border border-[#E9E3DD] bg-[#FAF7F2]">
            <Hero
              layout="desktop"
              heading="h2"
              eyebrow={form.eyebrow.trim()}
              headline={form.headline.trim()}
              ctaLabel={form.ctaLabel.trim()}
              ctaHref={form.ctaHref.trim()}
              showText={form.showText}
              showCta={form.showCta}
              copyAlignX={form.copyAlignX}
              copyAlignY={form.copyAlignY}
              desktopImageUrl={images.resolvedDesktopImageUrl}
              mobileImageUrl={images.resolvedMobileImageUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
