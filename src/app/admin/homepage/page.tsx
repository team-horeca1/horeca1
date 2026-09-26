'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ImageIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { HeroPlacementCanvas } from '@/components/features/homepage/HeroPlacementCanvas';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { usePermissions } from '@/hooks/usePermissions';
import { parseImageMeta } from '@/lib/imageMeta';
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
  isActive: boolean;
};

type SlideListItem = HeroForm & {
  id: string;
  sortOrder: number;
  resolvedDesktopImageUrl: string;
  resolvedMobileImageUrl: string;
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
  isActive: true,
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
    isActive: d.isActive !== false,
  };
}

function toListItem(d: Record<string, unknown>): SlideListItem {
  const form = toForm(d);
  const images = resolveHeroImages(form.desktopImageUrl, form.mobileImageUrl);
  return {
    ...form,
    id: String(d.id),
    sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : 0,
    resolvedDesktopImageUrl:
      typeof d.resolvedDesktopImageUrl === 'string'
        ? d.resolvedDesktopImageUrl
        : images.resolvedDesktopImageUrl,
    resolvedMobileImageUrl:
      typeof d.resolvedMobileImageUrl === 'string'
        ? d.resolvedMobileImageUrl
        : images.resolvedMobileImageUrl,
  };
}

function slideLabel(slide: SlideListItem, index: number): string {
  const headline = trimHeroCopy(slide.headline);
  if (headline) return headline.split('\n')[0]!.slice(0, 60);
  return `Banner ${index + 1}`;
}

export default function AdminHomepageHeroPage() {
  const { can } = usePermissions();
  const canEdit = can('settings.edit');

  const [slides, setSlides] = useState<SlideListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HeroForm>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/homepage/hero', { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load');
      const list = Array.isArray(json.data?.slides)
        ? (json.data.slides as Record<string, unknown>[]).map(toListItem)
        : [];
      setSlides(list);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load banners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (slide: SlideListItem) => {
    setEditingId(slide.id);
    setForm(toForm(slide));
  };

  const closeEdit = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const createSlide = async () => {
    if (!canEdit || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/v1/admin/homepage/hero', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Create failed');
      const created = toListItem(json.data as Record<string, unknown>);
      setSlides((prev) => [...prev, created]);
      openEdit(created);
      toast.success('Banner added');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const save = async () => {
    if (!canEdit || !editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/homepage/hero/${editingId}`, {
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
          isActive: form.isActive,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Save failed');
      const updated = toListItem(json.data as Record<string, unknown>);
      setSlides((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setForm(toForm(updated));
      toast.success('Banner saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (slide: SlideListItem) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/v1/admin/homepage/hero/${slide.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !slide.isActive }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Update failed');
      const updated = toListItem(json.data as Record<string, unknown>);
      setSlides((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      if (editingId === updated.id) setForm((f) => ({ ...f, isActive: updated.isActive }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const removeSlide = async (slide: SlideListItem) => {
    if (!canEdit) return;
    if (!window.confirm('Delete this banner? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/v1/admin/homepage/hero/${slide.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Delete failed');
      setSlides((prev) => prev.filter((s) => s.id !== slide.id));
      if (editingId === slide.id) closeEdit();
      toast.success('Banner deleted');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const moveSlide = async (index: number, dir: -1 | 1) => {
    if (!canEdit) return;
    const next = index + dir;
    if (next < 0 || next >= slides.length) return;
    const ordered = [...slides];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item!);
    setSlides(ordered);
    try {
      const res = await fetch('/api/v1/admin/homepage/hero/reorder', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: ordered.map((s) => s.id) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Reorder failed');
      if (Array.isArray(json.data?.slides)) {
        setSlides((json.data.slides as Record<string, unknown>[]).map(toListItem));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Reorder failed');
      void load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-[#667085]">
        <Loader2 className="animate-spin mr-2" size={20} />
        Loading banners…
      </div>
    );
  }

  const images = resolveHeroImages(form.desktopImageUrl, form.mobileImageUrl);
  const mobileCardWidth = HERO_MOBILE_FRAME_WIDTH - HERO_MOBILE_SIDE_PADDING * 2;
  const editing = editingId != null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#F8E8EC] flex items-center justify-center shrink-0">
          <ImageIcon size={20} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[clamp(1.25rem,2vw,1.5rem)] font-bold text-[#1C1C1C]">
            Homepage Hero
          </h1>
          <p className="text-[13px] text-[#667085] mt-1">
            Add as many banners as you need. The homepage slides through active
            ones with arrows and dots. Text and button are optional — turn them
            off for image-only banners.
          </p>
        </div>
      </div>

      {!editing ? (
        <div className="bg-white rounded-2xl border border-[#E9E3DD] p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[15px] font-semibold text-[#1C1C1C]">
              Banners ({slides.length})
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={() => void createSlide()}
                disabled={creating}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark disabled:opacity-60"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Add banner
              </button>
            )}
          </div>

          {slides.length === 0 ? (
            <p className="text-[13px] text-[#667085] py-8 text-center">
              No banners yet. Add one to get started.
            </p>
          ) : (
            <ul className="space-y-3">
              {slides.map((slide, index) => {
                const thumb = parseImageMeta(slide.resolvedDesktopImageUrl);
                return (
                  <li
                    key={slide.id}
                    className="flex items-center gap-3 rounded-xl border border-[#E9E3DD] p-3"
                  >
                    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-[#F8E8EC]">
                      {thumb.src ? (
                        <Image
                          src={thumb.src}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-primary/40">
                          <ImageIcon size={18} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-[#1C1C1C] truncate">
                        {slideLabel(slide, index)}
                      </p>
                      <p className="text-[12px] text-[#667085] mt-0.5">
                        {slide.isActive ? 'Active on homepage' : 'Hidden'}
                        {!slide.showText && !slide.showCta ? ' · Image only' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            aria-label="Move up"
                            disabled={index === 0}
                            onClick={() => void moveSlide(index, -1)}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-[#667085] hover:bg-[#F8F9FB] disabled:opacity-30"
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label="Move down"
                            disabled={index === slides.length - 1}
                            onClick={() => void moveSlide(index, 1)}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-[#667085] hover:bg-[#F8F9FB] disabled:opacity-30"
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleActive(slide)}
                            className={`h-9 px-3 rounded-lg text-[12px] font-semibold ${
                              slide.isActive
                                ? 'bg-[#F8E8EC] text-primary'
                                : 'bg-[#F8F9FB] text-[#667085]'
                            }`}
                          >
                            {slide.isActive ? 'On' : 'Off'}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(slide)}
                        className="h-9 px-3 rounded-lg bg-[#1C1C1C] text-white text-[12px] font-semibold hover:bg-black"
                      >
                        Edit
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          aria-label="Delete banner"
                          onClick={() => void removeSlide(slide)}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-[#DC2626] hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={closeEdit}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#667085] hover:text-primary"
          >
            <ArrowLeft size={16} />
            Back to banners
          </button>

          <div className="bg-white rounded-2xl border border-[#E9E3DD] p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-[15px] font-semibold text-[#1C1C1C]">Edit banner</h2>
              <label className="inline-flex items-center gap-2 text-[13px] text-[#1C1C1C]">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  disabled={!canEdit}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded border-[#E9E3DD] text-primary focus:ring-primary"
                />
                Show on homepage
              </label>
            </div>

            <ImageUploadField
              label="Desktop image"
              value={form.desktopImageUrl}
              onChange={(url) => setForm((f) => ({ ...f, desktopImageUrl: url }))}
              folder="banners"
              aspectHint="2600 × 480 or 1300 × 240 (5.4:1 panoramic). Fills the entire desktop banner."
              variant="homepage-hero-desktop"
            />

            <ImageUploadField
              label="Mobile image (optional)"
              value={form.mobileImageUrl}
              onChange={(url) => setForm((f) => ({ ...f, mobileImageUrl: url }))}
              folder="banners"
              aspectHint="1080 × 590 or 732 × 400 (1.8:1). Leave empty to reuse the desktop photo."
              variant="homepage-hero-mobile"
            />

            <div className="space-y-4 pt-2 border-t border-[#E9E3DD]">
              <p className="text-[12px] text-[#667085]">
                Text and button are optional. Leave them empty or turn them off
                in placement below for an image-only banner.
              </p>
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
                Save banner
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
