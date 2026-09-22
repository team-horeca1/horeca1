'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { usePermissions } from '@/hooks/usePermissions';
import { HERO_FALLBACK } from '@/modules/homepage/homepage-hero.constants';

type HeroForm = {
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
  eyebrow: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
};

const EMPTY: HeroForm = {
  desktopImageUrl: null,
  mobileImageUrl: null,
  eyebrow: HERO_FALLBACK.eyebrow,
  headline: HERO_FALLBACK.headline,
  ctaLabel: HERO_FALLBACK.ctaLabel,
  ctaHref: HERO_FALLBACK.ctaHref,
};

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
      const d = json.data;
      setForm({
        desktopImageUrl: d.desktopImageUrl ?? null,
        mobileImageUrl: d.mobileImageUrl ?? null,
        eyebrow: d.eyebrow || HERO_FALLBACK.eyebrow,
        headline: d.headline || HERO_FALLBACK.headline,
        ctaLabel: d.ctaLabel || HERO_FALLBACK.ctaLabel,
        ctaHref: d.ctaHref || HERO_FALLBACK.ctaHref,
      });
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
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Save failed');
      toast.success('Homepage hero saved');
      const d = json.data;
      setForm({
        desktopImageUrl: d.desktopImageUrl ?? null,
        mobileImageUrl: d.mobileImageUrl ?? null,
        eyebrow: d.eyebrow,
        headline: d.headline,
        ctaLabel: d.ctaLabel,
        ctaHref: d.ctaHref,
      });
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

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#F8E8EC] flex items-center justify-center shrink-0">
          <ImageIcon size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-[clamp(1.25rem,2vw,1.5rem)] font-bold text-[#1C1C1C]">
            Homepage Hero
          </h1>
          <p className="text-[13px] text-[#667085] mt-1">
            Desktop and optional mobile product art plus copy. Layout stays the burgundy
            banner with left text and right image. Clear mobile to fall back to desktop,
            then the built-in static asset.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E9E3DD] p-6 space-y-6">
        <ImageUploadField
          label="Desktop image"
          value={form.desktopImageUrl}
          onChange={(url) => setForm((f) => ({ ...f, desktopImageUrl: url }))}
          folder="banners"
          aspectHint="Recommended 1200×700. Product art works best (object-contain on the right)."
          variant="vendor-cover"
        />

        <ImageUploadField
          label="Mobile image (optional)"
          value={form.mobileImageUrl}
          onChange={(url) => setForm((f) => ({ ...f, mobileImageUrl: url }))}
          folder="banners"
          aspectHint="Recommended 800×500. Leave empty to reuse desktop, then static fallback."
          variant="vendor-cover"
        />

        <div className="space-y-4 pt-2 border-t border-[#E9E3DD]">
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              Eyebrow
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
              Headline
            </label>
            <textarea
              value={form.headline}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
              maxLength={500}
              rows={2}
              className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-primary/40 focus:bg-white resize-none disabled:opacity-60"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                CTA label
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
                CTA link
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
