'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  CheckCircle,
  FileText,
  Inbox,
  ImagePlus,
  Loader2,
  Mic2,
  Plus,
  Save,
  Trash2,
  X,
  ChefHat,
  HelpCircle,
  Store,
  Utensils,
  ExternalLink,
  Sparkles,
  Smartphone,
  Square,
  MessageCircle,
  ArrowLeft,
  Quote,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { blocksToPlainText } from '@/modules/voices/portableText';
import {
  AdminEntityTabBar,
  AdminEntityTabPanel,
  AdminRegistryEmptyState,
  AdminRegistryLoadingState,
  AdminRegistryPageHeader,
  AdminRegistryStatsGrid,
  AdminRegistryTableBody,
  AdminRegistryTableHead,
  AdminRegistryTableShell,
  AdminStatusBadge,
} from '@/components/features/admin/entity';
import { VOICE_BADGES, type VoiceCategory, type VoiceStory } from '@/sanity/lib/types';

type Nomination = {
  _id: string;
  nomineeName: string;
  category: string;
  contact: string;
  reason: string;
  nominatorName: string | null;
  relationship: string | null;
  status: string;
  _createdAt: string;
};

type QaRow = { question: string; answer: string };
type BrandRow = { label: string; brandSlug: string };

type FormState = {
  id?: string;
  category: VoiceCategory;
  name: string;
  slug: string;
  role: string;
  venue: string;
  quote: string;
  bodyText: string;
  dishName: string;
  ingredients: string[];
  steps: string[];
  qa: QaRow[];
  brandLinks: BrandRow[];
  published: boolean;
  publishedAt: string;
  photoUrl: string;
  photoAlt: string;
  photoAssetId: string;
  clearPhoto: boolean;
  storyPortraitUrl: string;
  storySquareUrl: string;
};

const EMPTY: FormState = {
  category: 'chef',
  name: '',
  slug: '',
  role: '',
  venue: '',
  quote: '',
  bodyText: '',
  dishName: '',
  ingredients: [],
  steps: [],
  qa: [],
  brandLinks: [],
  published: false,
  publishedAt: '',
  photoUrl: '',
  photoAlt: '',
  photoAssetId: '',
  clearPhoto: false,
  storyPortraitUrl: '',
  storySquareUrl: '',
};

export type EditorialCategory = {
  key: string;
  label: string;
  badge: string;
  description?: string;
  isDefault?: boolean;
};

const DEFAULT_EDITORIAL_CATEGORIES: EditorialCategory[] = [
  { key: 'chef', label: 'Chef of the Week', badge: 'CHEF OF THE WEEK', description: 'Highlighting executive chefs and rising culinary stars', isDefault: true },
  { key: 'consultant', label: 'Consultant Spotlight', badge: 'CONSULTANT SPOTLIGHT', description: 'Industry experts, menu developers and restaurant consultants', isDefault: true },
  { key: 'vendor', label: 'Vendor Spotlight', badge: 'VENDOR SPOTLIGHT', description: 'Featured suppliers, farmers, distributors, and artisanal brands', isDefault: true },
  { key: 'owner', label: 'Restaurateur Spotlight', badge: 'RESTAURATEUR SPOTLIGHT', description: 'Hospitality founders, café owners, and business leaders', isDefault: true },
];

function getCategoryIcon(key: string) {
  if (key === 'chef') return ChefHat;
  if (key === 'consultant') return HelpCircle;
  if (key === 'vendor') return Store;
  if (key === 'owner') return Utensils;
  return Sparkles;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function apiError(json: { error?: { message?: string } | string }, fallback: string): string {
  if (typeof json.error === 'string') return json.error;
  return json.error?.message || fallback;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function storyToForm(story: VoiceStory): FormState {
  return {
    id: story._id,
    category: (story.category as VoiceCategory) || 'chef',
    name: story.name,
    slug: story.slug,
    role: story.role ?? '',
    venue: story.venue ?? '',
    quote: story.quote,
    bodyText: blocksToPlainText(story.body),
    dishName: story.recipe?.dishName ?? '',
    ingredients: [...(story.recipe?.ingredients ?? [])],
    steps: [...(story.recipe?.steps ?? [])],
    qa: (story.qa ?? [])
      .filter((q) => q.question || q.answer)
      .map((q) => ({ question: q.question ?? '', answer: q.answer ?? '' })),
    brandLinks: (story.brandLinks ?? [])
      .filter((b) => b.label || b.brandSlug)
      .map((b) => ({ label: b.label ?? '', brandSlug: b.brandSlug ?? '' })),
    published: story.published,
    publishedAt: toDatetimeLocal(story.publishedAt),
    photoUrl: story.photoUrl ?? '',
    photoAlt: story.photoAlt ?? '',
    photoAssetId: '',
    clearPhoto: false,
    storyPortraitUrl: story.storyPortraitUrl ?? '',
    storySquareUrl: story.storySquareUrl ?? '',
  };
}

function payloadFromForm(form: FormState) {
  return {
    category: form.category,
    name: form.name,
    slug: form.slug || slugify(form.name),
    role: form.role || null,
    venue: form.venue || null,
    quote: form.quote,
    bodyText: form.bodyText,
    recipe: {
      dishName: form.dishName || undefined,
      ingredients: form.ingredients.map((s) => s.trim()).filter(Boolean),
      steps: form.steps.map((s) => s.trim()).filter(Boolean),
    },
    qa: form.qa
      .map((q) => ({ question: q.question.trim(), answer: q.answer.trim() }))
      .filter((q) => q.question || q.answer),
    brandLinks: form.brandLinks
      .map((b) => ({ label: b.label.trim(), brandSlug: b.brandSlug.trim() }))
      .filter((b) => b.label || b.brandSlug),
    published: form.published,
    publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
    photoAssetId: form.photoAssetId || undefined,
    photoAlt: form.photoAlt || null,
    clearPhoto: form.clearPhoto,
  };
}

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-divider bg-[#F8F9FB] px-4 py-2.5 text-[14px] text-text outline-none transition-all focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/10';
const labelClass = 'text-[11px] font-extrabold text-text-secondary uppercase tracking-wider flex items-center justify-between';

export default function AdminVoicesPage() {
  const { has } = usePermissions();
  const canWrite = has('settings.edit');
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState('stories');
  const [stories, setStories] = useState<VoiceStory[]>([]);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [slugManual, setSlugManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewTab, setPreviewTab] = useState<'card' | 'whatsapp'>('card');
  const [categories, setCategories] = useState<EditorialCategory[]>(DEFAULT_EDITORIAL_CATEGORIES);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<EditorialCategory | null>(null);
  const [categoryMode, setCategoryMode] = useState<'create' | 'edit'>('create');
  const [keyManual, setKeyManual] = useState(false);
  const [badgeManual, setBadgeManual] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/voices/categories', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(apiError(json, 'Could not load categories'));
      const rows = json.data?.categories;
      if (Array.isArray(rows) && rows.length > 0) setCategories(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load categories');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/voices?include=nominations', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(apiError(json, 'Could not load Voices'));
      setStories(json.data.stories ?? []);
      setNominations(json.data.nominations ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load Voices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadCategories();
  }, [load, loadCategories]);

  const stats = useMemo(
    () => [
      { label: 'Published', value: stories.filter((s) => s.published).length, icon: CheckCircle, iconBg: 'bg-[#F8E8EC]', iconColor: 'text-[#6B1D2E]' },
      { label: 'Drafts', value: stories.filter((s) => !s.published).length, icon: FileText, iconBg: 'bg-[#FFF8EB]', iconColor: 'text-[#D97706]' },
      { label: 'New nominations', value: nominations.filter((n) => n.status === 'new').length, icon: Inbox, iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#2563EB]' },
    ],
    [stories, nominations],
  );

  const openNew = (partial?: Partial<FormState>) => {
    setSlugManual(false);
    setForm({ ...EMPTY, ...partial });
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast.error('Please provide a name for the Voice story');
      return;
    }
    setSaving(true);
    try {
      const url = form.id ? `/api/v1/admin/voices/${encodeURIComponent(form.id)}` : '/api/v1/admin/voices';
      const res = await fetch(url, {
        method: form.id ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromForm(form)),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(apiError(json, 'Could not save story'));
      toast.success(form.id ? 'Story updated successfully' : 'Story created successfully');
      setForm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save story');
    } finally {
      setSaving(false);
    }
  };

  const removeStory = async (story: VoiceStory) => {
    if (!window.confirm(`Delete “${story.name}”? This removes it from the site.`)) return;
    const res = await fetch(`/api/v1/admin/voices/${encodeURIComponent(story._id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      toast.error(apiError(json, 'Could not delete story'));
      return;
    }
    toast.success('Story deleted');
    await load();
  };

  const saveCategory = async () => {
    if (!editingCategory) return;
    if (!editingCategory.label.trim() || !editingCategory.key.trim()) {
      toast.error('Name and key are required');
      return;
    }
    setCategorySaving(true);
    try {
      const isEdit = categoryMode === 'edit';
      const url = isEdit
        ? `/api/v1/admin/voices/categories/${encodeURIComponent(editingCategory.key)}`
        : '/api/v1/admin/voices/categories';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: editingCategory.key,
          label: editingCategory.label.trim(),
          badge: (editingCategory.badge || editingCategory.label).trim().toUpperCase(),
          description: editingCategory.description?.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(apiError(json, 'Could not save category'));
      const savedKey = typeof json.data?.key === 'string' ? json.data.key : editingCategory.key;
      toast.success('Editorial category saved');
      setShowCategoryModal(false);
      if (!isEdit) {
        const created = json.data as EditorialCategory;
        setCategories((prev) => (prev.some((c) => c.key === savedKey) ? prev : [...prev, created]));
        setForm((prev) => (prev ? { ...prev, category: savedKey as VoiceCategory } : prev));
      }
      await loadCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save category');
    } finally {
      setCategorySaving(false);
    }
  };

  const removeCategory = async (cat: EditorialCategory) => {
    if (cat.isDefault) return;
    if (!window.confirm(`Delete category "${cat.label}"?`)) return;
    const res = await fetch(`/api/v1/admin/voices/categories/${encodeURIComponent(cat.key)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      toast.error(apiError(json, 'Could not delete category'));
      return;
    }
    toast.success('Category deleted');
    await loadCategories();
  };

  const uploadPhoto = async (file: File) => {
    if (!form) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await fetch('/api/v1/admin/voices/upload', { method: 'POST', credentials: 'include', body: data });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(apiError(json, 'Upload failed'));
      setForm((prev) =>
        prev
          ? { ...prev, photoAssetId: json.data.assetId, photoUrl: json.data.url, clearPhoto: false }
          : prev,
      );
      toast.success('Photo uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const setNominationStatus = async (id: string, status: 'new' | 'reviewed' | 'used') => {
    const res = await fetch(`/api/v1/admin/voices/nominations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      toast.error(apiError(json, 'Could not update nomination'));
      return;
    }
    await load();
  };

  const removeNomination = async (row: Nomination) => {
    if (!window.confirm(`Delete nomination for ${row.nomineeName}?`)) return;
    const res = await fetch(`/api/v1/admin/voices/nominations/${encodeURIComponent(row._id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      toast.error(apiError(json, 'Could not delete nomination'));
      return;
    }
    toast.success('Nomination deleted');
    await load();
  };

  const categoryModal = showCategoryModal && editingCategory ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl border border-divider p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between border-b border-divider pb-3">
          <h4 className="text-[16px] font-bold text-text">
            {categoryMode === 'edit' ? 'Edit Editorial Category' : 'New Editorial Category'}
          </h4>
          <button
            type="button"
            onClick={() => setShowCategoryModal(false)}
            className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-bold text-text">Category Display Name</label>
            <input
              type="text"
              value={editingCategory.label}
              placeholder="e.g. Mixologist Spotlight"
              onChange={(e) => {
                const label = e.target.value;
                setEditingCategory({
                  ...editingCategory,
                  label,
                  key: categoryMode === 'create' && !keyManual ? slugify(label) : editingCategory.key,
                  badge: categoryMode === 'create' && !badgeManual ? label.toUpperCase() : editingCategory.badge,
                });
              }}
              className="w-full text-[13px] p-2.5 border border-divider rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
            />
          </div>

          <div>
            <label className="text-[12px] font-bold text-text">Key / Slug</label>
            <input
              type="text"
              disabled={categoryMode === 'edit'}
              value={editingCategory.key}
              placeholder="e.g. mixologist"
              onChange={(e) => {
                setKeyManual(true);
                setEditingCategory({
                  ...editingCategory,
                  key: slugify(e.target.value),
                });
              }}
              className="w-full font-mono text-[13px] p-2.5 border border-divider rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1 disabled:bg-neutral-100"
            />
          </div>

          <div>
            <label className="text-[12px] font-bold text-text">Badge Label</label>
            <input
              type="text"
              value={editingCategory.badge}
              placeholder="e.g. MIXOLOGIST SPOTLIGHT"
              onChange={(e) => {
                setBadgeManual(true);
                setEditingCategory({
                  ...editingCategory,
                  badge: e.target.value.toUpperCase(),
                });
              }}
              className="w-full text-[13px] p-2.5 border border-divider rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1 uppercase"
            />
          </div>

          <div>
            <label className="text-[12px] font-bold text-text">Description</label>
            <textarea
              rows={2}
              value={editingCategory.description || ''}
              placeholder="Short explanation of this recognition"
              onChange={(e) =>
                setEditingCategory({
                  ...editingCategory,
                  description: e.target.value,
                })
              }
              className="w-full text-[13px] p-2.5 border border-divider rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-divider">
          <button
            type="button"
            onClick={() => setShowCategoryModal(false)}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold text-text-muted hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canWrite || categorySaving}
            onClick={() => void saveCategory()}
            className="px-5 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary-dark shadow-sm disabled:opacity-60"
          >
            {categorySaving ? 'Saving…' : 'Save Category'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // --- TWO COLUMN MODERN EDITOR VIEW ---
  if (form) {
    const photoShown = form.photoUrl && !form.clearPhoto;
    const quoteLength = form.quote.length;
    const titleLine = [form.role, form.venue].filter(Boolean).join(' · ');
    const categoryBadge = categories.find((c) => c.key === form.category)?.badge || VOICE_BADGES[form.category] || 'HORECA1 VOICES';

    return (
      <>
      <div className="space-y-6 pb-12">
        {/* Sticky Action Header Bar */}
        <div className="bg-white sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3.5 border-b border-divider shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm(null)}
              className="size-9 rounded-xl hover:bg-ivory text-text-secondary flex items-center justify-center border border-divider transition-colors"
              title="Back to stories"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                  {categoryBadge}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-md',
                    form.published ? 'bg-success-light text-success' : 'bg-warning-light text-warning'
                  )}
                >
                  {form.published ? 'Published' : 'Draft'}
                </span>
              </div>
              <h1 className="text-[18px] sm:text-[20px] font-extrabold text-text tracking-tight leading-tight mt-0.5">
                {form.name || 'Untitled Voice Story'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {form.id && form.slug && (
              <Link
                href={`/voices/${form.slug}`}
                target="_blank"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-divider hover:border-primary/40 text-[12px] font-semibold text-text hover:text-primary transition-colors"
              >
                <Eye size={14} />
                Preview page
                <ExternalLink size={12} className="opacity-60" />
              </Link>
            )}

            <button
              type="button"
              onClick={() => setForm({ ...form, published: !form.published })}
              className={cn(
                'px-3 py-2 rounded-xl text-[12px] font-bold border transition-colors',
                form.published
                  ? 'border-success/30 bg-success-light text-success'
                  : 'border-divider bg-ivory text-text-secondary'
              )}
            >
              {form.published ? 'Published on Site' : 'Draft Only'}
            </button>

            <button
              type="button"
              onClick={() => setForm(null)}
              className="px-4 py-2 rounded-xl border border-divider hover:bg-ivory font-semibold text-[13px] text-text-secondary transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!canWrite || saving}
              onClick={() => void save()}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-[13px] disabled:opacity-60 inline-flex items-center gap-2 shadow-sm transition-transform active:scale-95"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
              {form.id ? 'Save changes' : 'Publish story'}
            </button>
          </div>
        </div>

        {/* 2-Column Grid: Form Left, Sticky Live Preview Right */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-8 items-start">
          {/* LEFT FORM COLUMN */}
          <div className="space-y-6">
            {/* Card 1: Category & Identity */}
            <div className="bg-white rounded-2xl border border-divider p-5 sm:p-6 shadow-xs space-y-5">
              <div>
                <p className={labelClass}>
                  <span>1. Editorial Category</span>
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => {
                      setEditingCategory({ key: '', label: '', badge: '', description: '' });
                      setCategoryMode('create');
                      setKeyManual(false);
                      setBadgeManual(false);
                      setShowCategoryModal(true);
                    }}
                    className="normal-case tracking-normal text-[11px] font-bold text-primary hover:underline disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    <Plus size={12} />
                    Add category
                  </button>
                </p>
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                  {categories.map((opt) => {
                    const selected = form.category === opt.key;
                    const Icon = getCategoryIcon(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setForm({ ...form, category: opt.key as VoiceCategory })}
                        className={cn(
                          'p-3 rounded-xl text-[12px] font-bold border-2 transition-all flex flex-col items-center text-center gap-1.5',
                          selected
                            ? 'border-primary bg-primary-light/60 text-primary shadow-xs'
                            : 'border-divider/80 text-text-secondary hover:border-primary/40 bg-white'
                        )}
                      >
                        <Icon size={18} className={selected ? 'text-primary' : 'text-text-muted'} />
                        <span className="leading-tight">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-divider/60">
                <label className="block">
                  <span className={labelClass}>Full Name</span>
                  <input
                    className={fieldClass}
                    value={form.name}
                    placeholder="e.g. Chef Arvind Rao"
                    onChange={(e) => {
                      const name = e.target.value;
                      setForm((prev) =>
                        prev ? { ...prev, name, slug: slugManual ? prev.slug : slugify(name) } : prev,
                      );
                    }}
                  />
                </label>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={labelClass}>URL Slug</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !slugManual;
                        setSlugManual(next);
                        if (!next) setForm({ ...form, slug: slugify(form.name) });
                      }}
                      className={cn(
                        'text-[9px] font-bold px-2 py-0.5 rounded-md',
                        slugManual ? 'bg-ivory text-text-secondary' : 'bg-primary text-white'
                      )}
                    >
                      {slugManual ? 'CUSTOM' : 'AUTO'}
                    </button>
                  </div>
                  <input
                    className={cn(fieldClass, 'font-mono text-[13px]')}
                    value={form.slug}
                    placeholder="e.g. chef-arvind-rao"
                    onChange={(e) => {
                      setSlugManual(true);
                      setForm({ ...form, slug: slugify(e.target.value) });
                    }}
                    aria-label="Slug"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className={labelClass}>Role / Title</span>
                  <input
                    className={fieldClass}
                    placeholder="e.g. Executive Chef"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Venue / Business</span>
                  <input
                    className={fieldClass}
                    placeholder="e.g. The Copper Ladle"
                    value={form.venue}
                    onChange={(e) => setForm({ ...form, venue: e.target.value })}
                  />
                </label>
              </div>

              <label className="block">
                <span className={labelClass}>Published at</span>
                <p className="text-[11.5px] text-text-muted mt-0.5 mb-1">
                  Used to sort stories on the site. Set automatically when you publish if left empty.
                </p>
                <input
                  type="datetime-local"
                  className={fieldClass}
                  value={form.publishedAt}
                  onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
                />
              </label>
            </div>

            {/* Card 2: The Hook (Quote) */}
            <div className="bg-white rounded-2xl border border-divider p-5 sm:p-6 shadow-xs space-y-3">
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className={labelClass}>
                    <Quote size={13} className="inline mr-1 text-primary" />
                    2. The Hook / Pull-Quote
                  </span>
                  <span
                    className={cn(
                      'text-[11px] font-bold',
                      quoteLength > 90
                        ? 'text-error'
                        : quoteLength > 80
                        ? 'text-warning'
                        : 'text-text-muted'
                    )}
                  >
                    {quoteLength} / 90 chars
                  </span>
                </div>
                <p className="text-[11.5px] text-text-muted mt-0.5 mb-2">
                  Featured on the homepage teaser card and social share cards. Keep it punchy and memorable.
                </p>
                <textarea
                  className={cn(fieldClass, 'min-h-[72px] resize-y text-[15px] font-medium italic')}
                  maxLength={90}
                  value={form.quote}
                  placeholder="e.g. Why I only trust Daawat rice for my Sunday biryani."
                  onChange={(e) => setForm({ ...form, quote: e.target.value })}
                />
              </label>
            </div>

            {/* Card 3: Featured Photo */}
            <div className="bg-white rounded-2xl border border-divider p-5 sm:p-6 shadow-xs space-y-4">
              <p className={labelClass}>
                <span>3. Featured Photo</span>
                <span className="text-[10px] text-text-muted font-normal">High-res portrait or action photo</span>
              </p>
              <div className="flex items-center gap-4">
                {photoShown ? (
                  <div className="relative size-28 rounded-2xl overflow-hidden border-2 border-divider shrink-0 group shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.photoUrl} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                      onClick={() => setForm({ ...form, clearPhoto: true, photoUrl: '', photoAssetId: '' })}
                      aria-label="Remove photo"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ) : null}

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) void uploadPhoto(file);
                  }}
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 h-28 border-2 border-dashed border-divider hover:border-primary rounded-2xl text-[13px] font-semibold text-text-secondary hover:text-primary hover:bg-primary-light/30 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="animate-spin text-primary" size={20} />
                      <span className="text-primary text-[12px]">Uploading to CDN…</span>
                    </>
                  ) : (
                    <>
                      <ImagePlus size={22} className="text-text-muted" />
                      <span>{photoShown ? 'Replace photo' : 'Upload or drop image'}</span>
                      <span className="text-[11px] text-text-muted font-normal">PNG, JPG, or WEBP up to 10MB</span>
                    </>
                  )}
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!canWrite || uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadPhoto(file);
                    e.target.value = '';
                  }}
                />
              </div>
              <label className="block">
                <span className={labelClass}>Photo alt text</span>
                <input
                  className={fieldClass}
                  value={form.photoAlt}
                  placeholder={form.name ? `Portrait of ${form.name}` : 'Describe the photo'}
                  onChange={(e) => setForm({ ...form, photoAlt: e.target.value })}
                />
              </label>
            </div>

            {/* Card 4: Narrative Story */}
            <div className="bg-white rounded-2xl border border-divider p-5 sm:p-6 shadow-xs space-y-3">
              <label className="block">
                <span className={labelClass}>4. Full Narrative Story</span>
                <p className="text-[11.5px] text-text-muted mt-0.5 mb-2">
                  Write the full editorial piece. Separate paragraphs with a blank line.
                </p>
                <textarea
                  className={cn(fieldClass, 'min-h-48 resize-y leading-relaxed')}
                  value={form.bodyText}
                  onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
                  placeholder="In Mumbai's bustling culinary scene, Chef Arvind has spent twenty years perfecting regional biryanis..."
                />
              </label>
            </div>

            {/* Card 5: Signature recipe — always available */}
            <div className="bg-white rounded-2xl border border-divider p-5 sm:p-6 shadow-xs space-y-4">
              <div>
                <p className={labelClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <ChefHat size={13} className="text-primary" />
                    5. Signature recipe
                  </span>
                  <span className="text-[10px] text-text-muted font-normal">Shows on the article when filled</span>
                </p>
                <p className="text-[11.5px] text-text-muted mt-1">
                  Same as Sanity &ldquo;Signature recipe (chefs)&rdquo;. Add ingredients and prep steps as separate rows.
                </p>
              </div>
              <label className="block">
                <span className={labelClass}>Dish name</span>
                <input
                  className={fieldClass}
                  value={form.dishName}
                  placeholder="e.g. Sunday tomato rasam"
                  onChange={(e) => setForm({ ...form, dishName: e.target.value })}
                />
              </label>
              <div>
                <span className={labelClass}>Ingredients</span>
                <div className="mt-2 space-y-2">
                  {form.ingredients.map((item, i) => (
                    <div key={`ing-${i}`} className="flex gap-2">
                      <input
                        className={fieldClass + ' mt-0'}
                        value={item}
                        placeholder={`Ingredient ${i + 1}`}
                        onChange={(e) => {
                          const next = [...form.ingredients];
                          next[i] = e.target.value;
                          setForm({ ...form, ingredients: next });
                        }}
                      />
                      <button
                        type="button"
                        className="size-11 shrink-0 rounded-xl border border-divider text-error hover:bg-ivory"
                        aria-label="Remove ingredient"
                        onClick={() =>
                          setForm({ ...form, ingredients: form.ingredients.filter((_, idx) => idx !== i) })
                        }
                      >
                        <Trash2 size={14} className="mx-auto" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-[12px] font-bold text-primary inline-flex items-center gap-1"
                    onClick={() => setForm({ ...form, ingredients: [...form.ingredients, ''] })}
                  >
                    <Plus size={14} /> Add ingredient
                  </button>
                </div>
              </div>
              <div>
                <span className={labelClass}>Prep steps</span>
                <div className="mt-2 space-y-2">
                  {form.steps.map((item, i) => (
                    <div key={`step-${i}`} className="flex gap-2">
                      <textarea
                        className={cn(fieldClass, 'mt-0 min-h-16')}
                        value={item}
                        placeholder={`Step ${i + 1}`}
                        onChange={(e) => {
                          const next = [...form.steps];
                          next[i] = e.target.value;
                          setForm({ ...form, steps: next });
                        }}
                      />
                      <button
                        type="button"
                        className="size-11 shrink-0 rounded-xl border border-divider text-error hover:bg-ivory"
                        aria-label="Remove step"
                        onClick={() => setForm({ ...form, steps: form.steps.filter((_, idx) => idx !== i) })}
                      >
                        <Trash2 size={14} className="mx-auto" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-[12px] font-bold text-primary inline-flex items-center gap-1"
                    onClick={() => setForm({ ...form, steps: [...form.steps, ''] })}
                  >
                    <Plus size={14} /> Add step
                  </button>
                </div>
              </div>
            </div>

            {/* Card 6: Q&A / FAQ — always available */}
            <div className="bg-white rounded-2xl border border-divider p-5 sm:p-6 shadow-xs space-y-4">
              <div>
                <p className={labelClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <HelpCircle size={13} className="text-primary" />
                    6. Q&amp;A / FAQ
                  </span>
                  <span className="text-[10px] text-text-muted font-normal">Shows on the article when filled</span>
                </p>
                <p className="text-[11.5px] text-text-muted mt-1">
                  Same as Sanity &ldquo;Q&amp;A (consultants)&rdquo;. Add each question and answer as its own pair.
                </p>
              </div>
              {form.qa.length === 0 ? (
                <p className="text-[13px] text-text-secondary">No FAQ pairs yet.</p>
              ) : (
                <div className="space-y-3">
                  {form.qa.map((row, i) => (
                    <div key={`qa-${i}`} className="rounded-xl border border-divider p-3 space-y-2 bg-[#F8F9FB]">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-text-secondary uppercase">Pair {i + 1}</span>
                        <button
                          type="button"
                          className="text-error text-[12px] font-semibold"
                          onClick={() => setForm({ ...form, qa: form.qa.filter((_, idx) => idx !== i) })}
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        className={fieldClass + ' mt-0'}
                        value={row.question}
                        placeholder="Question"
                        onChange={(e) => {
                          const next = [...form.qa];
                          next[i] = { ...next[i], question: e.target.value };
                          setForm({ ...form, qa: next });
                        }}
                      />
                      <textarea
                        className={cn(fieldClass, 'mt-0 min-h-20')}
                        value={row.answer}
                        placeholder="Answer"
                        onChange={(e) => {
                          const next = [...form.qa];
                          next[i] = { ...next[i], answer: e.target.value };
                          setForm({ ...form, qa: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="text-[12px] font-bold text-primary inline-flex items-center gap-1"
                onClick={() => setForm({ ...form, qa: [...form.qa, { question: '', answer: '' }] })}
              >
                <Plus size={14} /> Add Q&amp;A pair
              </button>
            </div>

            {/* Card 7: Brand mentions — always available */}
            <div className="bg-white rounded-2xl border border-divider p-5 sm:p-6 shadow-xs space-y-4">
              <div>
                <p className={labelClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <Store size={13} className="text-primary" />
                    7. Brand mentions
                  </span>
                  <span className="text-[10px] text-text-muted font-normal">Links to /brand/&#123;slug&#125;</span>
                </p>
                <p className="text-[11.5px] text-text-muted mt-1">
                  Same as Sanity brand mentions. Display name + brand store slug.
                </p>
              </div>
              {form.brandLinks.length === 0 ? (
                <p className="text-[13px] text-text-secondary">No brand mentions yet.</p>
              ) : (
                <div className="space-y-2">
                  {form.brandLinks.map((row, i) => (
                    <div key={`brand-${i}`} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                      <input
                        className={fieldClass + ' mt-0'}
                        value={row.label}
                        placeholder="Display name (e.g. Daawat)"
                        onChange={(e) => {
                          const next = [...form.brandLinks];
                          next[i] = { ...next[i], label: e.target.value };
                          setForm({ ...form, brandLinks: next });
                        }}
                      />
                      <input
                        className={cn(fieldClass, 'mt-0 font-mono text-[13px]')}
                        value={row.brandSlug}
                        placeholder="Brand slug (e.g. daawat)"
                        onChange={(e) => {
                          const next = [...form.brandLinks];
                          next[i] = { ...next[i], brandSlug: slugify(e.target.value) };
                          setForm({ ...form, brandLinks: next });
                        }}
                      />
                      <button
                        type="button"
                        className="size-11 shrink-0 rounded-xl border border-divider text-error hover:bg-ivory"
                        aria-label="Remove brand"
                        onClick={() =>
                          setForm({ ...form, brandLinks: form.brandLinks.filter((_, idx) => idx !== i) })
                        }
                      >
                        <Trash2 size={14} className="mx-auto" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="text-[12px] font-bold text-primary inline-flex items-center gap-1"
                onClick={() => setForm({ ...form, brandLinks: [...form.brandLinks, { label: '', brandSlug: '' }] })}
              >
                <Plus size={14} /> Add brand
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: STICKY REAL-TIME LIVE PREVIEW */}
          <div className="sticky top-20 space-y-4">
            {/* Preview Tab Selector */}
            <div className="flex items-center justify-between bg-white rounded-2xl border border-divider p-1.5 shadow-xs">
              <button
                type="button"
                onClick={() => setPreviewTab('card')}
                className={cn(
                  'flex-1 py-2 rounded-xl text-[12px] font-bold transition-all text-center',
                  previewTab === 'card' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text'
                )}
              >
                Storefront Card
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('whatsapp')}
                className={cn(
                  'flex-1 py-2 rounded-xl text-[12px] font-bold transition-all text-center',
                  previewTab === 'whatsapp' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text'
                )}
              >
                WhatsApp Preview
              </button>
            </div>

            {/* Tab 1: Live Storefront Card Preview */}
            {previewTab === 'card' && (
              <div className="bg-white rounded-2xl border border-divider p-5 shadow-xs space-y-3">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
                  Live Card Preview
                </p>
                <div className="border border-divider/80 rounded-2xl overflow-hidden shadow-xs bg-white">
                  <div className="relative aspect-[16/10] bg-ivory">
                    {photoShown ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.photoUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="size-full flex items-center justify-center bg-primary-light text-primary font-bold text-2xl">
                        {form.name ? form.name.slice(0, 1) : '?'}
                      </div>
                    )}
                    <span className="absolute top-2.5 left-2.5 bg-primary text-white text-[9.5px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                      {categoryBadge}
                    </span>
                  </div>
                  <div className="p-4 space-y-1">
                    <p className="text-[16px] font-bold text-text leading-tight">
                      {form.name || 'Featured Person'}
                    </p>
                    {titleLine && (
                      <p className="text-[12px] text-text-secondary font-medium">{titleLine}</p>
                    )}
                    <p className="text-[12.5px] text-text-secondary italic line-clamp-2 mt-2 pt-1 border-l-2 border-primary/40 pl-2.5">
                      &ldquo;{form.quote || 'Story hook quote goes here...'}&rdquo;
                    </p>
                    <p className="text-[11.5px] font-bold text-primary pt-2">Read full story →</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: WhatsApp Unfurl Mock */}
            {previewTab === 'whatsapp' && (
              <div className="bg-white rounded-2xl border border-divider p-5 shadow-xs space-y-3">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
                  WhatsApp Preview
                </p>
                <div className="bg-[#EFEAE2] p-3.5 rounded-2xl space-y-2 border border-divider/60">
                  <div className="bg-white rounded-xl overflow-hidden shadow-xs max-w-[280px]">
                    <div className="aspect-[16/10] bg-ivory relative">
                      {photoShown ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={form.photoUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="size-full flex items-center justify-center text-primary font-bold">
                          Horeca1 Voices
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-[12px] font-bold text-text leading-tight">{form.name || 'Voice Story'}</p>
                      <p className="text-[11px] text-text-secondary line-clamp-1 mt-0.5">{form.quote}</p>
                      <p className="text-[9.5px] text-text-muted uppercase mt-1">horeca1.com/voices/{form.slug}</p>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl shadow-xs text-[12px] leading-relaxed">
                    <p className="font-bold">🌟 {form.name}</p>
                    {titleLine && <p className="text-text-secondary text-[11px]">{titleLine}</p>}
                    <p className="italic mt-1">&ldquo;{form.quote}&rdquo;</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {categoryModal}
      </>
    );
  }

  // --- REGISTRY LIST VIEW ---
  return (
    <div className="space-y-6 pb-8">
      <AdminRegistryPageHeader
        title="Horeca1 Voices"
        subtitle="Edit stories and nominations here. No Sanity login — changes go live on the storefront."
        actions={
          canWrite ? (
            <button
              type="button"
              onClick={() => openNew()}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold px-4 rounded-xl min-h-12 shadow-sm transition-transform active:scale-95"
            >
              <Plus size={16} />
              New story
            </button>
          ) : null
        }
      />

      <AdminRegistryStatsGrid stats={stats} />

      <AdminEntityTabPanel>
        <AdminEntityTabBar
          tabs={[
            {
              id: 'stories',
              label: 'Stories',
              icon: Mic2,
              badge: <span className="ml-1 text-[11px] text-text-secondary">{stories.length}</span>,
            },
            {
              id: 'nominations',
              label: 'Nominations',
              badge: <span className="ml-1 text-[11px] text-text-secondary">{nominations.length}</span>,
            },
            {
              id: 'categories',
              label: 'Editorial Categories',
              badge: <span className="ml-1 text-[11px] text-text-secondary">{categories.length}</span>,
            },
          ]}
          activeTab={tab}
          onTabChange={setTab}
        />

        {loading ? (
          <AdminRegistryLoadingState />
        ) : tab === 'stories' ? (
          stories.length === 0 ? (
            <AdminRegistryEmptyState icon={Mic2} title="No Voice stories yet" subtitle="Create the first chef, consultant, vendor, or owner story." />
          ) : (
            <AdminRegistryTableShell>
              <AdminRegistryTableHead>
                <th className="text-left px-4 py-3">Story</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </AdminRegistryTableHead>
              <AdminRegistryTableBody>
                {stories.map((story) => (
                  <tr key={story._id} className="border-t border-divider group hover:bg-ivory/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative size-12 rounded-xl overflow-hidden bg-ivory shrink-0 border border-divider/60">
                          {story.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={story.photoUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-primary font-bold">
                              {story.name.slice(0, 1)}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-[14px] text-text leading-tight">{story.name}</p>
                          <p className="text-[12px] text-text-secondary line-clamp-1 mt-0.5">{story.quote}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-bold text-primary">
                      {categories.find((c) => c.key === story.category)?.badge ?? story.categoryBadge ?? VOICE_BADGES[story.category] ?? story.category}
                    </td>
                    <td className="px-4 py-3">
                      <AdminStatusBadge
                        variant={story.published ? 'active' : 'inactive'}
                        label={story.published ? 'Published' : 'Draft'}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSlugManual(true);
                          setForm(storyToForm(story));
                        }}
                        className="text-primary font-bold text-[13px] mr-4 hover:underline"
                      >
                        Edit
                      </button>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => void removeStory(story)}
                          className="text-error font-semibold text-[13px] hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </AdminRegistryTableBody>
            </AdminRegistryTableShell>
          )
        ) : tab === 'nominations' ? (
          nominations.length === 0 ? (
          <AdminRegistryEmptyState icon={Mic2} title="No nominations" subtitle="Public nominations from /voices/nominate appear here." />
        ) : (
          <div className="divide-y divide-divider">
            {nominations.map((row) => (
              <div key={row._id} className="p-4 sm:p-5 space-y-2 hover:bg-ivory/20 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-text text-[15px]">{row.nomineeName}</p>
                    <p className="text-[12px] text-primary font-bold">
                      {VOICE_BADGES[row.category as VoiceCategory] ?? row.category}
                    </p>
                    <p className="text-[13px] text-text-secondary mt-1">{row.reason}</p>
                    <p className="text-[12px] text-text-muted mt-1">
                      Contact: {row.contact}
                      {row.nominatorName ? ` · Nominated by ${row.nominatorName}` : ''}
                    </p>
                  </div>
                  <AdminStatusBadge
                    variant={row.status === 'new' ? 'pending' : 'active'}
                    label={row.status}
                  />
                </div>
                {canWrite && (
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-[12px] font-bold shadow-2xs hover:bg-primary-dark transition-colors"
                      onClick={() =>
                        openNew({
                          name: row.nomineeName,
                          category: (['chef', 'consultant', 'vendor', 'owner'].includes(row.category)
                            ? row.category
                            : 'chef') as VoiceCategory,
                          quote: row.reason.slice(0, 90),
                          bodyText: row.reason,
                        })
                      }
                    >
                      Turn into story
                    </button>
                    {row.status !== 'reviewed' && (
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg border border-divider text-[12px] font-semibold hover:bg-ivory transition-colors"
                        onClick={() => void setNominationStatus(row._id, 'reviewed')}
                      >
                        Mark reviewed
                      </button>
                    )}
                    {row.status !== 'used' && (
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg border border-divider text-[12px] font-semibold hover:bg-ivory transition-colors"
                        onClick={() => void setNominationStatus(row._id, 'used')}
                      >
                        Mark used
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-[12px] font-semibold text-error hover:underline ml-auto"
                      onClick={() => void removeNomination(row)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-[16px] font-bold text-text">Editorial Recognition Categories</h3>
                <p className="text-[12px] text-text-muted">
                  Define custom spotlight roles, badges, and recognition categories for your stories.
                </p>
              </div>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => {
                  setEditingCategory({ key: '', label: '', badge: '', description: '' });
                  setCategoryMode('create');
                  setKeyManual(false);
                  setBadgeManual(false);
                  setShowCategoryModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary-dark inline-flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-60"
              >
                <Plus size={15} /> Add Category
              </button>
            </div>

            <AdminRegistryTableShell>
              <AdminRegistryTableHead>
                <th className="text-left px-4 py-3">Category Name</th>
                <th className="text-left px-4 py-3">Key / Slug</th>
                <th className="text-left px-4 py-3">Badge Label</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-right px-4 py-3">Actions</th>
              </AdminRegistryTableHead>
              <AdminRegistryTableBody>
                {categories.map((cat) => (
                  <tr key={cat.key} className="border-t border-divider group hover:bg-ivory/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-[14px] text-text">
                      <div className="flex items-center gap-2">
                        <span>{cat.label}</span>
                        {cat.isDefault && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-text-muted">
                            Default
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] text-text-secondary">{cat.key}</td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase bg-primary/10 text-primary">
                        {cat.badge}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-text-muted max-w-xs truncate">
                      {cat.description || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => {
                          setEditingCategory({ ...cat });
                          setCategoryMode('edit');
                          setKeyManual(true);
                          setBadgeManual(true);
                          setShowCategoryModal(true);
                        }}
                        className="text-primary font-bold text-[13px] mr-3 hover:underline disabled:opacity-60"
                      >
                        Edit
                      </button>
                      {!cat.isDefault && canWrite && (
                        <button
                          type="button"
                          onClick={() => void removeCategory(cat)}
                          className="text-error font-semibold text-[13px] hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </AdminRegistryTableBody>
            </AdminRegistryTableShell>
          </div>
        )}
      </AdminEntityTabPanel>

      {categoryModal}
    </div>
  );
}
