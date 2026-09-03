'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle,
    Edit2,
    Layers,
    Loader2,
    Package,
    Plus,
    Trash2,
    X,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { usePermissions } from '@/hooks/usePermissions';
import {
    AdminRegistryEmptyState,
    AdminRegistryFilterBar,
    AdminRegistryLoadingState,
    AdminRegistryPageHeader,
    AdminRegistryStatsGrid,
    AdminRegistryTableBody,
    AdminRegistryTableHead,
    AdminRegistryTableShell,
    AdminStatusBadge,
    registryFilterPillClass,
} from '@/components/features/admin/entity';
import {
    CollectionSkuPicker,
    type CollectionSku,
} from '@/components/features/admin/collections/CollectionSkuPicker';

interface CollectionRow {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    sortOrder: number;
    isActive: boolean;
    _count: { masterProducts: number };
}

interface CollectionStats {
    total: number;
    active: number;
    inactive: number;
    skuCount: number;
}

interface CollectionFormData {
    name: string;
    slug: string;
    description: string;
    imageUrl: string;
    sortOrder: number;
    isActive: boolean;
}

const INITIAL_FORM: CollectionFormData = {
    name: '',
    slug: '',
    description: '',
    imageUrl: '',
    sortOrder: 0,
    isActive: true,
};

const EMPTY_STATS: CollectionStats = { total: 0, active: 0, inactive: 0, skuCount: 0 };

const cellInput =
    'bg-transparent border border-transparent hover:border-[#D1D5DB] focus:border-[#6B1D2E] focus:bg-white focus:ring-1 focus:ring-[#6B1D2E]/20 px-1.5 py-1 rounded-[4px] outline-none w-full text-[12.5px] tabular-nums transition-colors';

function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function apiError(json: { error?: { message?: string } | string; message?: string }, fallback: string): string {
    if (typeof json.error === 'string') return json.error;
    return json.error?.message || json.message || fallback;
}

export default function AdminCollectionsPage() {
    const { has } = usePermissions();
    const canWrite = has('products.edit');

    const [collections, setCollections] = useState<CollectionRow[]>([]);
    const [stats, setStats] = useState<CollectionStats>(EMPTY_STATS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    const [showFormModal, setShowFormModal] = useState(false);
    const [editing, setEditing] = useState<CollectionRow | null>(null);
    const [formData, setFormData] = useState<CollectionFormData>(INITIAL_FORM);
    const [formSkus, setFormSkus] = useState<CollectionSku[]>([]);
    const [formSkusReady, setFormSkusReady] = useState(true);
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState<CollectionRow | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const [showPicker, setShowPicker] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<CollectionRow | 'form' | null>(null);
    const [pickerSkus, setPickerSkus] = useState<CollectionSku[]>([]);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [pickerSaving, setPickerSaving] = useState(false);

    const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
    const [savingRows, setSavingRows] = useState<Set<string>>(new Set());

    const fetchCollections = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/admin/collections');
            const json = await res.json();
            if (!res.ok) throw new Error(apiError(json, 'Failed to fetch collections'));
            setCollections(json.data?.collections ?? []);
            setStats(json.data?.stats ?? EMPTY_STATS);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load collections');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchCollections();
    }, [fetchCollections]);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return collections.filter((c) => {
            if (statusFilter === 'active' && !c.isActive) return false;
            if (statusFilter === 'inactive' && c.isActive) return false;
            if (!q) return true;
            return (
                c.name.toLowerCase().includes(q) ||
                c.slug.toLowerCase().includes(q) ||
                (c.description ?? '').toLowerCase().includes(q)
            );
        });
    }, [collections, searchQuery, statusFilter]);

    const closeFormModal = () => {
        setShowFormModal(false);
        setEditing(null);
        setFormData(INITIAL_FORM);
        setFormSkus([]);
        setFormSkusReady(true);
        setFormError(null);
        setSlugManuallyEdited(false);
    };

    const openCreateModal = () => {
        setEditing(null);
        setFormData(INITIAL_FORM);
        setFormSkus([]);
        setFormSkusReady(true);
        setFormError(null);
        setSlugManuallyEdited(false);
        setShowFormModal(true);
    };

    const openEditModal = async (col: CollectionRow) => {
        setEditing(col);
        setFormData({
            name: col.name,
            slug: col.slug,
            description: col.description ?? '',
            imageUrl: col.imageUrl ?? '',
            sortOrder: col.sortOrder,
            isActive: col.isActive,
        });
        setFormSkus([]);
        setFormSkusReady(false);
        setFormError(null);
        setSlugManuallyEdited(true);
        setShowFormModal(true);

        try {
            const res = await fetch(`/api/v1/admin/collections/${col.id}`);
            const json = await res.json();
            if (res.ok && json.success) {
                setFormSkus(json.data.masterProducts ?? []);
                setFormSkusReady(true);
            }
        } catch {
            // Keep the panel usable even if SKU prefetch fails.
        }
    };

    const handleNameChange = (name: string) => {
        setFormData((prev) => ({
            ...prev,
            name,
            slug: slugManuallyEdited ? prev.slug : slugify(name),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.slug.trim()) {
            setFormError('Name and slug are required.');
            return;
        }

        setFormLoading(true);
        setFormError(null);

        const body: Record<string, unknown> = {
            name: formData.name.trim(),
            slug: formData.slug.trim(),
            description: formData.description.trim() || null,
            imageUrl: formData.imageUrl.trim() || null,
            sortOrder: formData.sortOrder,
            isActive: formData.isActive,
        };
        if (!editing || formSkusReady) {
            body.masterProductIds = formSkus.map((s) => s.id);
        }

        try {
            const url = editing
                ? `/api/v1/admin/collections/${editing.id}`
                : '/api/v1/admin/collections';
            const res = await fetch(url, {
                method: editing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(apiError(json, 'Operation failed'));

            toast.success(editing ? 'Collection updated' : 'Collection created');
            closeFormModal();
            await fetchCollections();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleting) return;
        setDeleteLoading(true);
        try {
            const res = await fetch(`/api/v1/admin/collections/${deleting.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) throw new Error(apiError(json, 'Delete failed'));
            setShowDeleteModal(false);
            setDeleting(null);
            toast.success('Collection deleted');
            await fetchCollections();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleInlineSort = async (col: CollectionRow, value: number) => {
        if (value === col.sortOrder) return;
        setSavingRows((prev) => new Set(prev).add(col.id));
        try {
            const res = await fetch(`/api/v1/admin/collections/${col.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sortOrder: value }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(apiError(json, 'Failed to update sort order'));
            setCollections((prev) =>
                prev.map((c) => (c.id === col.id ? { ...c, sortOrder: value } : c)),
            );
            toast.success('Sort order updated');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update sort order');
            await fetchCollections();
        } finally {
            setSavingRows((prev) => {
                const next = new Set(prev);
                next.delete(col.id);
                return next;
            });
        }
    };

    const handleToggleActive = async (col: CollectionRow) => {
        setToggleLoadingId(col.id);
        try {
            const res = await fetch(`/api/v1/admin/collections/${col.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !col.isActive }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(apiError(json, 'Toggle failed'));
            setCollections((prev) =>
                prev.map((c) => (c.id === col.id ? { ...c, isActive: !c.isActive } : c)),
            );
            setStats((prev) => ({
                ...prev,
                active: prev.active + (col.isActive ? -1 : 1),
                inactive: prev.inactive + (col.isActive ? 1 : -1),
            }));
            toast.success(col.isActive ? 'Collection hidden from storefront' : 'Collection is now live');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Toggle failed');
        } finally {
            setToggleLoadingId(null);
        }
    };

    const openPickerFromForm = async () => {
        setPickerTarget('form');
        setShowPicker(true);
        if (editing && !formSkusReady) {
            setPickerLoading(true);
            setPickerSkus([]);
            try {
                const res = await fetch(`/api/v1/admin/collections/${editing.id}`);
                const json = await res.json();
                if (!res.ok) throw new Error(apiError(json, 'Failed to load SKUs'));
                const skus = (json.data.masterProducts ?? []) as CollectionSku[];
                setFormSkus(skus);
                setFormSkusReady(true);
                setPickerSkus(skus);
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to load SKUs');
                setShowPicker(false);
                setPickerTarget(null);
            } finally {
                setPickerLoading(false);
            }
            return;
        }
        setPickerSkus(formSkus);
        setPickerLoading(false);
    };

    const openPickerFromRow = async (col: CollectionRow) => {
        setPickerTarget(col);
        setPickerSkus([]);
        setPickerLoading(true);
        setShowPicker(true);
        try {
            const res = await fetch(`/api/v1/admin/collections/${col.id}`);
            const json = await res.json();
            if (!res.ok) throw new Error(apiError(json, 'Failed to load SKUs'));
            setPickerSkus(json.data.masterProducts ?? []);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to load SKUs');
            setShowPicker(false);
            setPickerTarget(null);
        } finally {
            setPickerLoading(false);
        }
    };

    const handlePickerSave = async () => {
        if (pickerTarget === 'form' || pickerTarget === null) {
            setFormSkus(pickerSkus);
            setFormSkusReady(true);
            setShowPicker(false);
            setPickerTarget(null);
            return;
        }

        setPickerSaving(true);
        try {
            const res = await fetch(`/api/v1/admin/collections/${pickerTarget.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ masterProductIds: pickerSkus.map((s) => s.id) }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(apiError(json, 'Failed to save SKUs'));
            const nextCount = json.data?._count?.masterProducts ?? pickerSkus.length;
            setCollections((prev) =>
                prev.map((c) =>
                    c.id === pickerTarget.id ? { ...c, _count: { masterProducts: nextCount } } : c,
                ),
            );
            if (editing?.id === pickerTarget.id) setFormSkus(pickerSkus);
            toast.success('SKUs updated');
            setShowPicker(false);
            setPickerTarget(null);
            await fetchCollections();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save SKUs');
        } finally {
            setPickerSaving(false);
        }
    };

    if (loading) {
        return <AdminRegistryLoadingState message="Loading collections..." />;
    }

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 pb-10 px-4 md:px-0 animate-in fade-in duration-500">
            <AdminRegistryPageHeader
                title="Collections"
                subtitle="Curate storefront collections and attach Horeca1 master SKUs"
                actions={
                    canWrite ? (
                        <button
                            type="button"
                            onClick={openCreateModal}
                            className="h-[44px] px-6 flex items-center gap-2 bg-[#6B1D2E] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#5A1926] shadow-sm shadow-[#6B1D2E]/20 transition-all active:scale-[0.98] shrink-0"
                        >
                            <Plus size={18} strokeWidth={2.5} />
                            Add Collection
                        </button>
                    ) : undefined
                }
            />

            <AdminRegistryStatsGrid
                stats={[
                    { label: 'Total Collections', value: stats.total, icon: Layers, iconBg: 'bg-[#F8E8EC]', iconColor: 'text-[#6B1D2E]' },
                    { label: 'Active', value: stats.active, icon: CheckCircle, iconBg: 'bg-[#ECFDF3]', iconColor: 'text-[#16A34A]' },
                    { label: 'Inactive', value: stats.inactive, icon: XCircle, iconBg: 'bg-[#F3F4F6]', iconColor: 'text-[#9CA3AF]' },
                    { label: 'Attached SKUs', value: stats.skuCount, icon: Package, iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#2563EB]' },
                ]}
            />

            {error && (
                <div className="bg-[#FFF0F0] border border-[#E74C3C]/20 rounded-[14px] p-5 flex items-center gap-3">
                    <AlertTriangle size={20} className="text-[#E74C3C] shrink-0" />
                    <p className="text-[14px] font-medium text-[#E74C3C]">{error}</p>
                    <button
                        type="button"
                        onClick={() => void fetchCollections()}
                        className="ml-auto text-[13px] font-bold text-[#E74C3C] underline hover:no-underline"
                    >
                        Retry
                    </button>
                </div>
            )}

            <AdminRegistryFilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search collections..."
                leftSlot={
                    <>
                        {(
                            [
                                { id: 'all' as const, label: 'All' },
                                { id: 'active' as const, label: 'Active' },
                                { id: 'inactive' as const, label: 'Inactive' },
                            ] as const
                        ).map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setStatusFilter(f.id)}
                                className={registryFilterPillClass(statusFilter === f.id)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </>
                }
            />

            {filtered.length === 0 ? (
                <AdminRegistryEmptyState
                    icon={Layers}
                    title={searchQuery || statusFilter !== 'all' ? 'No matched collections' : 'No collections yet'}
                    subtitle={
                        searchQuery || statusFilter !== 'all'
                            ? 'Try adjusting your search or filter.'
                            : 'Click "Add Collection" to create your first curated set.'
                    }
                />
            ) : (
                <AdminRegistryTableShell minWidth="980px">
                    <AdminRegistryTableHead>
                        <th className="px-6 py-3.5 font-bold min-w-[280px] border-r border-[#D1D5DB]">Collection</th>
                        <th className="px-6 py-3.5 font-bold min-w-[160px] border-r border-[#D1D5DB]">Slug</th>
                        <th className="px-6 py-3.5 font-bold text-center w-[110px] border-r border-[#D1D5DB]">SKUs</th>
                        <th className="px-6 py-3.5 font-bold text-right w-[110px] border-r border-[#D1D5DB]">Sort</th>
                        <th className="px-6 py-3.5 font-bold w-[140px] border-r border-[#D1D5DB]">Status</th>
                        <th className="px-6 py-3.5 font-bold text-right min-w-[160px]">Actions</th>
                    </AdminRegistryTableHead>
                    <AdminRegistryTableBody>
                        {filtered.map((col) => (
                            <tr key={col.id} className="hover:bg-[#F9FAFB]/60 transition-colors text-[13px]">
                                <td className="px-6 py-3 border-r border-[#D1D5DB] align-middle">
                                    <div className="flex items-center gap-3">
                                        {col.imageUrl ? (
                                            <img
                                                src={col.imageUrl}
                                                alt=""
                                                className="size-10 rounded-[8px] object-cover border border-[#E9E3DD] shrink-0"
                                            />
                                        ) : (
                                            <div className="size-10 rounded-[8px] bg-[#FAF5EC] flex items-center justify-center shrink-0">
                                                <Layers size={16} className="text-[#D1D5DB]" />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="font-extrabold text-[#181725] truncate">{col.name}</p>
                                            {col.description ? (
                                                <p className="text-[11px] text-[#9CA3AF] truncate">{col.description}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-3 border-r border-[#D1D5DB] align-middle">
                                    <span className="font-mono text-[#7C7C7C]">{col.slug}</span>
                                </td>
                                <td className="px-6 py-3 border-r border-[#D1D5DB] align-middle text-center">
                                    <button
                                        type="button"
                                        onClick={() => void openPickerFromRow(col)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[#F8E8EC] text-[#6B1D2E] font-bold hover:bg-[#F3D7DE]"
                                    >
                                        <Package size={13} />
                                        {col._count.masterProducts}
                                    </button>
                                </td>
                                <td className="px-6 py-3 border-r border-[#D1D5DB] align-middle">
                                    <input
                                        type="number"
                                        min={0}
                                        defaultValue={col.sortOrder}
                                        disabled={!canWrite}
                                        onBlur={(e) => {
                                            const value = parseInt(e.target.value, 10) || 0;
                                            void handleInlineSort(col, value);
                                        }}
                                        className={cn(cellInput, 'text-right font-medium text-[#7C7C7C] max-w-[72px] ml-auto')}
                                    />
                                </td>
                                <td className="px-6 py-3 border-r border-[#D1D5DB] align-middle">
                                    <button
                                        type="button"
                                        disabled={!canWrite || toggleLoadingId === col.id}
                                        onClick={() => void handleToggleActive(col)}
                                        className="flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {toggleLoadingId === col.id ? (
                                            <Loader2 size={15} className="animate-spin text-[#AEAEAE]" />
                                        ) : (
                                            <AdminStatusBadge variant={col.isActive ? 'active' : 'inactive'} />
                                        )}
                                    </button>
                                </td>
                                <td className="px-6 py-3 align-middle">
                                    <div className="flex items-center justify-end gap-2">
                                        {savingRows.has(col.id) && (
                                            <Loader2 size={16} className="animate-spin text-[#6B1D2E]" />
                                        )}
                                        {canWrite && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => void openEditModal(col)}
                                                    className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] bg-[#F1F4F9] text-[#7C7C7C] hover:bg-[#F8E8EC] hover:text-[#6B1D2E]"
                                                    title="Edit collection"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void openPickerFromRow(col)}
                                                    className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] bg-[#F1F4F9] text-[#7C7C7C] hover:bg-[#F8E8EC] hover:text-[#6B1D2E]"
                                                    title="Manage SKUs"
                                                >
                                                    <Package size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDeleting(col);
                                                        setShowDeleteModal(true);
                                                    }}
                                                    className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] bg-[#F1F4F9] text-[#7C7C7C] hover:bg-[#FFF0F0] hover:text-[#E74C3C]"
                                                    title="Delete collection"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </AdminRegistryTableBody>
                </AdminRegistryTableShell>
            )}

            <div
                className={cn(
                    'fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300',
                    showFormModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                )}
                onClick={closeFormModal}
            />
            <div
                className={cn(
                    'fixed top-0 right-0 h-full w-full max-w-[540px] bg-white z-[70] shadow-2xl transition-transform duration-300 ease-in-out flex flex-col',
                    showFormModal ? 'translate-x-0' : 'translate-x-full',
                )}
            >
                <div className="flex items-center justify-between px-8 py-6 border-b border-[#EEEEEE] shrink-0">
                    <h2 className="text-[22px] font-[900] text-[#181725]">
                        {editing ? 'Edit Collection' : 'Add Collection'}
                    </h2>
                    <button
                        type="button"
                        onClick={closeFormModal}
                        className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C]"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-[#F8F9FB]">
                    {formError && (
                        <div className="flex items-center gap-3 bg-[#FFF0F0] border border-[#E74C3C]/20 text-[#E74C3C] rounded-[12px] px-5 py-4 text-[13px] font-semibold">
                            <AlertTriangle size={18} />
                            {formError}
                        </div>
                    )}

                    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6 space-y-5">
                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-2">
                                Name <span className="text-[#E74C3C]">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder="e.g. Cafe Essentials"
                                className="w-full h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-2">
                                Slug <span className="text-[#E74C3C]">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.slug}
                                onChange={(e) => {
                                    setSlugManuallyEdited(true);
                                    setFormData((prev) => ({ ...prev, slug: slugify(e.target.value) }));
                                }}
                                placeholder="auto-generated-from-name"
                                className="w-full h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-mono font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-2">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                rows={3}
                                placeholder="Short line shown on the collection card"
                                className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white resize-none"
                            />
                        </div>

                        <ImageUpload
                            value={formData.imageUrl}
                            onChange={(url) => setFormData((prev) => ({ ...prev, imageUrl: url }))}
                            folder="collections"
                            label="Collection Image"
                            size="md"
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[13px] font-bold text-[#181725] mb-2">Sort Order</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={formData.sortOrder}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            sortOrder: parseInt(e.target.value, 10) || 0,
                                        }))
                                    }
                                    className="w-full h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
                                />
                            </div>
                            <div className="flex items-end pb-1">
                                <button
                                    type="button"
                                    onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                                    className="flex items-center gap-3"
                                >
                                    <div
                                        className={cn(
                                            'relative w-[44px] h-[24px] rounded-full transition-colors',
                                            formData.isActive ? 'bg-[#6B1D2E]' : 'bg-[#EEEEEE]',
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'absolute top-[2px] left-[2px] w-[20px] h-[20px] bg-white rounded-full shadow-sm transition-transform',
                                                formData.isActive && 'translate-x-[20px]',
                                            )}
                                        />
                                    </div>
                                    <span className="text-[13px] font-bold text-[#181725]">Is Active</span>
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => void openPickerFromForm()}
                            className="w-full min-h-12 rounded-[12px] border border-[#E9E3DD] bg-[#FAF7F2] text-[13px] font-bold text-[#6B1D2E] hover:bg-[#F8E8EC] inline-flex items-center justify-center gap-2"
                        >
                            <Package size={16} />
                            Manage SKUs ({formSkus.length})
                        </button>
                    </div>
                </div>

                <div className="px-8 py-6 border-t border-[#EEEEEE] shrink-0 flex items-center gap-4">
                    <button
                        type="button"
                        onClick={closeFormModal}
                        className="flex-1 h-[48px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[14px] font-bold hover:bg-[#EEEEEE]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            void handleSubmit(e);
                        }}
                        disabled={formLoading}
                        className="flex-1 h-[48px] bg-[#6B1D2E] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#5A1926] flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        {formLoading && <Loader2 size={16} className="animate-spin" />}
                        {editing ? 'Update Collection' : 'Create Collection'}
                    </button>
                </div>
            </div>

            {showDeleteModal && deleting && (
                <div
                    className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={() => {
                        setShowDeleteModal(false);
                        setDeleting(null);
                    }}
                >
                    <div
                        className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-2xl w-full max-w-[440px] mx-4 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-8 text-center">
                            <div className="w-[64px] h-[64px] mx-auto mb-5 rounded-full bg-[#FFF0F0] flex items-center justify-center">
                                <AlertTriangle size={32} className="text-[#E74C3C]" />
                            </div>
                            <h3 className="text-[20px] font-[900] text-[#181725] mb-2">Delete Collection?</h3>
                            <p className="text-[14px] text-[#7C7C7C] font-medium leading-relaxed">
                                Delete <strong className="text-[#181725]">{deleting.name}</strong>? The collection
                                disappears from the storefront. Master SKUs are not deleted.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 p-6 border-t border-[#EEEEEE]">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setDeleting(null);
                                }}
                                className="flex-1 h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#7C7C7C] rounded-[10px] text-[14px] font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleDelete()}
                                disabled={deleteLoading}
                                className="flex-1 h-[46px] bg-[#E74C3C] text-white rounded-[10px] text-[14px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {deleteLoading && <Loader2 size={16} className="animate-spin" />}
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPicker && (
                <CollectionSkuPicker
                    selected={pickerSkus}
                    onChange={setPickerSkus}
                    onClose={() => {
                        setShowPicker(false);
                        setPickerTarget(null);
                    }}
                    onSave={() => void handlePickerSave()}
                    saving={pickerSaving}
                    loadingSelected={pickerLoading}
                />
            )}
        </div>
    );
}
