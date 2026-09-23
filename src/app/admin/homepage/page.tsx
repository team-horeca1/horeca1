'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Hero } from '@/components/features/Hero';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  HERO_DESKTOP_CARD_HEIGHT,
  HERO_DESKTOP_CARD_WIDTH,
  HERO_FALLBACK,
  HERO_MOBILE_CARD_HEIGHT,
  HERO_MOBILE_FRAME_WIDTH,
  HERO_MOBILE_SIDE_PADDING,
  HERO_OFFSET_MAX,
  HERO_OFFSET_MIN,
  HERO_POSITIONS,
  clampHeroOffset,
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
    copyOffsetX: clampHeroOffset(typeof d.copyOffsetX === 'number' ? d.copyOffsetX : 0),
    copyOffsetY: clampHeroOffset(typeof d.copyOffsetY === 'number' ? d.copyOffsetY : 0),
    showTextMobile: d.showTextMobile !== false,
    showCtaMobile: d.showCtaMobile !== false,
    copyAlignXMobile: isHeroAlignX(d.copyAlignXMobile) ? d.copyAlignXMobile : 'left',
    copyAlignYMobile: isHeroAlignY(d.copyAlignYMobile) ? d.copyAlignYMobile : 'bottom',
    copyOffsetXMobile: clampHeroOffset(
      typeof d.copyOffsetXMobile === 'number' ? d.copyOffsetXMobile : 0,
    ),
    copyOffsetYMobile: clampHeroOffset(
      typeof d.copyOffsetYMobile === 'number' ? d.copyOffsetYMobile : 0,
    ),
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

function PositionPicker({
  alignX,
  alignY,
  disabled,
  onChange,
}: {
  alignX: HeroAlignX;
  alignY: HeroAlignY;
  disabled: boolean;
  onChange: (x: HeroAlignX, y: HeroAlignY) => void;
}) {
  const label = HERO_POSITIONS.find((spot) => spot.x === alignX && spot.y === alignY)?.label;
  return (
    <div>
      <p className="text-[13px] font-semibold text-gray-700 mb-2">Position</p>
      <div className="flex items-center gap-4">
        <div
          className="grid grid-cols-3 gap-1.5 w-[108px]"
          role="group"
          aria-label="Text and button position"
        >
          {HERO_POSITIONS.map((spot) => {
            const selected = alignX === spot.x && alignY === spot.y;
            return (
              <button
                key={spot.label}
                type="button"
                aria-label={spot.label}
                aria-pressed={selected}
                title={spot.label}
                disabled={disabled}
                onClick={() => onChange(spot.x, spot.y)}
                className={cn(
                  'h-8 rounded-lg border transition-colors',
                  selected
                    ? 'bg-primary border-primary'
                    : 'bg-[#F8F9FB] border-[#E9E3DD] hover:border-primary/40',
                  disabled && 'opacity-60',
                )}
              />
            );
          })}
        </div>
        <p className="text-[13px] text-[#667085]">{label}</p>
      </div>
    </div>
  );
}

function OffsetSliders({
  offsetX,
  offsetY,
  disabled,
  onChangeX,
  onChangeY,
}: {
  offsetX: number;
  offsetY: number;
  disabled: boolean;
  onChangeX: (value: number) => void;
  onChangeY: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
          Move right <span className="font-normal text-[#667085]">{offsetX}px</span>
        </label>
        <input
          type="range"
          min={HERO_OFFSET_MIN}
          max={HERO_OFFSET_MAX}
          value={offsetX}
          disabled={disabled}
          onChange={(e) => onChangeX(Number(e.target.value))}
          className="w-full accent-primary disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
          Move down <span className="font-normal text-[#667085]">{offsetY}px</span>
        </label>
        <input
          type="range"
          min={HERO_OFFSET_MIN}
          max={HERO_OFFSET_MAX}
          value={offsetY}
          disabled={disabled}
          onChange={(e) => onChangeY(Number(e.target.value))}
          className="w-full accent-primary disabled:opacity-60"
        />
      </div>
    </div>
  );
}

function DevicePlacementCard({
  title,
  showText,
  showCta,
  alignX,
  alignY,
  offsetX,
  offsetY,
  canEdit,
  onShowText,
  onShowCta,
  onAlign,
  onOffsetX,
  onOffsetY,
}: {
  title: string;
  showText: boolean;
  showCta: boolean;
  alignX: HeroAlignX;
  alignY: HeroAlignY;
  offsetX: number;
  offsetY: number;
  canEdit: boolean;
  onShowText: (value: boolean) => void;
  onShowCta: (value: boolean) => void;
  onAlign: (x: HeroAlignX, y: HeroAlignY) => void;
  onOffsetX: (value: number) => void;
  onOffsetY: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#E9E3DD] bg-[#FAF7F2]/60 p-4 space-y-4">
      <h3 className="text-[14px] font-bold text-[#1C1C1C]">{title}</h3>
      <HeroSwitch
        label="Text"
        description="Eyebrow and headline on this screen."
        on={showText}
        disabled={!canEdit}
        onChange={onShowText}
      />
      <HeroSwitch
        label="Button"
        description="The call-to-action on this screen."
        on={showCta}
        disabled={!canEdit}
        onChange={onShowCta}
      />
      {(showText || showCta) && (
        <>
          <PositionPicker
            alignX={alignX}
            alignY={alignY}
            disabled={!canEdit}
            onChange={onAlign}
          />
          <OffsetSliders
            offsetX={offsetX}
            offsetY={offsetY}
            disabled={!canEdit}
            onChangeX={onOffsetX}
            onChangeY={onOffsetY}
          />
        </>
      )}
      {!showText && !showCta && (
        <p className="text-[13px] text-[#667085]">
          Image only on {title.toLowerCase()}. Your wording is kept.
        </p>
      )}
    </div>
  );
}

function DesktopScaledPreview({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const width = host.clientWidth;
      if (width <= 0) return;
      setScale(Math.min(1, width / HERO_DESKTOP_CARD_WIDTH));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className="w-full overflow-hidden rounded-[24px] border border-[#E9E3DD] bg-[#FAF7F2]"
      style={{ height: HERO_DESKTOP_CARD_HEIGHT * scale }}
    >
      <div
        className="origin-top-left"
        style={{
          width: HERO_DESKTOP_CARD_WIDTH,
          height: HERO_DESKTOP_CARD_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
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
  const mobileSource = form.mobileImageUrl?.trim()
    ? 'Using the mobile photo.'
    : form.desktopImageUrl?.trim()
      ? 'No mobile photo yet — this preview uses the desktop image.'
      : 'No photos uploaded — this preview uses the built-in artwork.';

  const sharedHeroProps = {
    eyebrow: form.eyebrow,
    headline: form.headline,
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
    desktopImageUrl: images.resolvedDesktopImageUrl,
    mobileImageUrl: images.resolvedMobileImageUrl,
  } as const;

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
            The photo fills the banner. Set wording once, then turn text or the button
            on or off separately for mobile and desktop, and place each one. Previews
            match the live homepage size. Clear the mobile photo to reuse desktop.
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
              placeholder="Shown on the photo. Shift+Enter starts a new line."
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-[#E9E3DD]">
          <DevicePlacementCard
            title="Mobile"
            showText={form.showTextMobile}
            showCta={form.showCtaMobile}
            alignX={form.copyAlignXMobile}
            alignY={form.copyAlignYMobile}
            offsetX={form.copyOffsetXMobile}
            offsetY={form.copyOffsetYMobile}
            canEdit={canEdit}
            onShowText={(showTextMobile) => setForm((f) => ({ ...f, showTextMobile }))}
            onShowCta={(showCtaMobile) => setForm((f) => ({ ...f, showCtaMobile }))}
            onAlign={(copyAlignXMobile, copyAlignYMobile) =>
              setForm((f) => ({ ...f, copyAlignXMobile, copyAlignYMobile }))
            }
            onOffsetX={(copyOffsetXMobile) => setForm((f) => ({ ...f, copyOffsetXMobile }))}
            onOffsetY={(copyOffsetYMobile) => setForm((f) => ({ ...f, copyOffsetYMobile }))}
          />
          <DevicePlacementCard
            title="Desktop"
            showText={form.showText}
            showCta={form.showCta}
            alignX={form.copyAlignX}
            alignY={form.copyAlignY}
            offsetX={form.copyOffsetX}
            offsetY={form.copyOffsetY}
            canEdit={canEdit}
            onShowText={(showText) => setForm((f) => ({ ...f, showText }))}
            onShowCta={(showCta) => setForm((f) => ({ ...f, showCta }))}
            onAlign={(copyAlignX, copyAlignY) => setForm((f) => ({ ...f, copyAlignX, copyAlignY }))}
            onOffsetX={(copyOffsetX) => setForm((f) => ({ ...f, copyOffsetX }))}
            onOffsetY={(copyOffsetY) => setForm((f) => ({ ...f, copyOffsetY }))}
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

      <div className="space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1C1C1C]">Preview</h2>
          <p className="text-[13px] text-[#667085] mt-1">
            Same size as the live homepage banner. {mobileSource}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667085]">
            Mobile · {HERO_MOBILE_FRAME_WIDTH}×{HERO_MOBILE_CARD_HEIGHT + HERO_MOBILE_SIDE_PADDING * 2 + 24} frame
          </p>
          <div
            className="mx-auto overflow-hidden rounded-[28px] border border-[#E9E3DD] bg-[#FAF7F2]"
            style={{
              width: HERO_MOBILE_FRAME_WIDTH,
              paddingInline: HERO_MOBILE_SIDE_PADDING,
              paddingBlock: 12,
            }}
          >
            <Hero chrome="card" layout="mobile" heading="h2" {...sharedHeroProps} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667085]">
            Desktop · {HERO_DESKTOP_CARD_WIDTH}×{HERO_DESKTOP_CARD_HEIGHT} (scaled to fit)
          </p>
          <DesktopScaledPreview>
            <Hero chrome="card" layout="desktop" heading="h2" {...sharedHeroProps} />
          </DesktopScaledPreview>
        </div>
      </div>
    </div>
  );
}
