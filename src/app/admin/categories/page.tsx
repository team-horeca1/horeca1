'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Plus,
    Search,
    Loader2,
    Tag,
    CheckCircle,
    Clock,
    XCircle,
    Edit2,
    Trash2,
    Upload,
    Download,
    FileSpreadsheet,
    FileText,
    ChevronRight,
    ChevronDown,
    X,
    AlertTriangle,
    FolderTree,
    Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import {
    AdminRegistryPageHeader,
    AdminRegistryFilterBar,
} from '@/components/features/admin/entity';

const cellInput = 'bg-transparent border border-transparent hover:border-[#D1D5DB] focus:border-[#299E60] focus:bg-white focus:ring-1 focus:ring-[#299E60]/20 px-1.5 py-1 rounded-[4px] outline-none w-full text-[12.5px] tabular-nums transition-colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    imageUrl: string | null;
    sortOrder: number;
    isActive: boolean;
    approvalStatus: 'pending' | 'approved' | 'rejected';
    approvalNote: string | null;
    suggestedBy: string | null;
    createdAt: string;
    children?: Category[];
    _count?: { products: number };
}

interface CategoryFormData {
    name: string;
    slug: string;
    parentId: string | null;
    parentCategoryIds: string[];
    imageUrl: string;
    sortOrder: number;
    isActive: boolean;
}

interface ImportResult {
    created: number;
    // The import API returns structured { row, message } errors; the client-side
    // catch path pushes a plain string. Render must tolerate both.
    errors: Array<string | { row: number; message: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const INITIAL_FORM: CategoryFormData = {
    name: '',
    slug: '',
    parentId: null,
    parentCategoryIds: [],
    imageUrl: '',
    sortOrder: 0,
    isActive: true,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CategoriesPage() {
    const { has } = usePermissions();
    const canWriteProducts = has('products.edit');
    const searchParams = useSearchParams();
    const editIdParam = searchParams.get('editId');
    const autoOpenedRef = useRef(false);
    // Data state
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Search & filter
    const [searchQuery, setSearchQuery] = useState('');

    // Modals
    const [showFormModal, setShowFormModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [formData, setFormData] = useState<CategoryFormData>(INITIAL_FORM);
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    // Toggle loading tracker
    const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);

    // Saving rows state (for inline editing loaders)
    const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
    const originalCategoriesRef = useRef<Record<string, Category>>({});

    // Expanded parents
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const fileInputRef = useRef<HTMLInputElement>(null);

    // -----------------------------------------------------------------------
    // Fetch
    // -----------------------------------------------------------------------

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/admin/categories');
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to fetch categories');
            const cats = json.data ?? json.categories ?? [];
            setCategories(cats);

            // Cache original values
            const cache: Record<string, Category> = {};
            cats.forEach((c: Category) => {
                cache[c.id] = JSON.parse(JSON.stringify(c));
            });
            originalCategoriesRef.current = cache;
        } catch (err) {
            console.error('Failed to fetch categories:', err);
            setError(err instanceof Error ? err.message : 'Failed to load categories');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    // -----------------------------------------------------------------------
    // Hierarchy helpers
    // -----------------------------------------------------------------------

    const hierarchicalCategories = useMemo(() => {
        const topLevel = categories
            .filter((c) => !c.parentId)
            .sort((a, b) => a.sortOrder - b.sortOrder);

        return topLevel.map((parent) => ({
            ...parent,
            children: categories
                .filter((c) => c.parentId === parent.id)
                .sort((a, b) => a.sortOrder - b.sortOrder),
        }));
    }, [categories]);

    const filteredCategories = useMemo(() => {
        if (!searchQuery.trim()) return hierarchicalCategories;

        const q = searchQuery.toLowerCase();
        return hierarchicalCategories
            .map((parent) => {
                const parentMatches =
                    parent.name.toLowerCase().includes(q) ||
                    parent.slug.toLowerCase().includes(q);
                const matchingChildren = (parent.children || []).filter(
                    (child) =>
                        child.name.toLowerCase().includes(q) ||
                        child.slug.toLowerCase().includes(q)
                );
                if (parentMatches) return parent;
                if (matchingChildren.length > 0) return { ...parent, children: matchingChildren };
                return null;
            })
            .filter(Boolean) as Category[];
    }, [hierarchicalCategories, searchQuery]);

    // -----------------------------------------------------------------------
    // Stats
    // -----------------------------------------------------------------------

    const stats = useMemo(() => {
        const total = categories.length;
        const active = categories.filter((c) => c.isActive && c.approvalStatus === 'approved').length;
        const pending = categories.filter((c) => c.approvalStatus === 'pending').length;
        const inactive = categories.filter((c) => !c.isActive || c.approvalStatus === 'rejected').length;
        return { total, active, pending, inactive };
    }, [categories]);

    // -----------------------------------------------------------------------
    // Expand / Collapse
    // -----------------------------------------------------------------------

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Auto-expand parents that have children on initial load
    useEffect(() => {
        const withChildren = hierarchicalCategories
            .filter((c) => c.children && c.children.length > 0)
            .map((c) => c.id);
        setExpandedIds(new Set(withChildren));
    }, [hierarchicalCategories]);

    // -----------------------------------------------------------------------
    // Form modal
    // -----------------------------------------------------------------------

    const openCreateModal = () => {
        setEditingCategory(null);
        setFormData(INITIAL_FORM);
        setSlugManuallyEdited(false);
        setFormError(null);
        setShowFormModal(true);
    };

    // Auto-open edit modal when ?editId=… is in URL (e.g. from Approvals page)
    useEffect(() => {
        if (!editIdParam || autoOpenedRef.current || loading) return;
        const target = categories.find(c => c.id === editIdParam);
        if (target) {
            autoOpenedRef.current = true;
            openEditModal(target);
        }
    }, [editIdParam, loading, categories]);

    const openEditModal = async (cat: Category) => {
        setEditingCategory(cat);
        let parentCategoryIds: string[] = cat.parentId ? [cat.parentId] : [];
        try {
            const res = await fetch(`/api/v1/admin/categories/${cat.id}`);
            const json = await res.json();
            if (res.ok && Array.isArray(json.data?.parentCategoryIds)) {
                parentCategoryIds = json.data.parentCategoryIds;
            }
        } catch {
            // keep fallback from parentId
        }
        setFormData({
            name: cat.name,
            slug: cat.slug,
            parentId: cat.parentId,
            parentCategoryIds,
            imageUrl: cat.imageUrl || '',
            sortOrder: cat.sortOrder,
            isActive: cat.isActive,
        });
        setSlugManuallyEdited(true);
        setFormError(null);
        setShowFormModal(true);
    };

    const closeFormModal = () => {
        setShowFormModal(false);
        setEditingCategory(null);
        setFormData(INITIAL_FORM);
        setFormError(null);
    };

    const handleNameChange = (name: string) => {
        setFormData((prev) => ({
            ...prev,
            name,
            slug: slugManuallyEdited ? prev.slug : slugify(name),
        }));
    };

    const handleSlugChange = (slug: string) => {
        setSlugManuallyEdited(true);
        setFormData((prev) => ({ ...prev, slug: slugify(slug) }));
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
            parentId: formData.parentId || null,
            imageUrl: formData.imageUrl.trim() || null,
            sortOrder: formData.sortOrder,
            isActive: formData.isActive,
        };

        if (formData.parentId || formData.parentCategoryIds.length > 0) {
            const linkedParents =
                formData.parentCategoryIds.length > 0
                    ? formData.parentCategoryIds
                    : formData.parentId
                      ? [formData.parentId]
                      : [];
            body.parentCategoryIds = linkedParents;
            body.parentId = linkedParents[0] ?? null;
        }

        try {
            const url = editingCategory
                ? `/api/v1/admin/categories/${editingCategory.id}`
                : '/api/v1/admin/categories';

            const res = await fetch(url, {
                method: editingCategory ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error?.message || json.error || json.message || 'Operation failed');

            closeFormModal();
            fetchCategories();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setFormLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Delete
    // -----------------------------------------------------------------------

    const openDeleteModal = (cat: Category) => {
        setDeletingCategory(cat);
        setShowDeleteModal(true);
    };

    const closeDeleteModal = () => {
        setShowDeleteModal(false);
        setDeletingCategory(null);
    };

    const handleDelete = async () => {
        if (!deletingCategory) return;
        setDeleteLoading(true);
        try {
            const res = await fetch(`/api/v1/admin/categories/${deletingCategory.id}`, {
                method: 'DELETE',
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error?.message || json.error || json.message || 'Delete failed');
            closeDeleteModal();
            fetchCategories();
            toast.success('Category deleted successfully');
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setDeleteLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Cell Editing and Toggle Active
    // -----------------------------------------------------------------------

    const handleCellChange = (catId: string, field: keyof Category, value: Category[keyof Category]) => {
        setCategories((prev) =>
            prev.map((c) => (c.id === catId ? { ...c, [field]: value } as Category : c))
        );
    };

    const handleInlineEdit = async (catId: string, field: keyof Category, value: Category[keyof Category], originalValue: Category[keyof Category]) => {
        if (value === originalValue) return;

        if (field === 'name' && (!value || !String(value).trim())) {
            toast.error('Category name cannot be empty');
            handleCellChange(catId, 'name', originalValue);
            return;
        }
        if (field === 'slug' && (!value || !String(value).trim())) {
            toast.error('Category slug cannot be empty');
            handleCellChange(catId, 'slug', originalValue);
            return;
        }

        setSavingRows((prev) => {
            const next = new Set(prev);
            next.add(catId);
            return next;
        });

        try {
            let url = `/api/v1/admin/categories/${catId}`;
            let bodyPayload: Record<string, unknown> = {};

            if (field === 'approvalStatus') {
                url = `/api/v1/admin/categories/${catId}/approval`;
                bodyPayload = {
                    action: value === 'approved' ? 'approve' : 'reject',
                    note: 'Status updated inline'
                };
            } else {
                bodyPayload = { [field]: value };
            }

            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
            });
            const json = await res.json();

            if (json.success) {
                toast.success('Category updated');
                const updatedCategory = json.data;
                setCategories(prev => prev.map(c => c.id === catId ? { ...c, ...updatedCategory } : c));
                if (originalCategoriesRef.current[catId]) {
                    originalCategoriesRef.current[catId] = {
                        ...originalCategoriesRef.current[catId],
                        ...updatedCategory,
                    };
                }
            } else {
                toast.error(json.error || json.message || 'Failed to update category');
                handleCellChange(catId, field, originalValue);
            }
        } catch (err) {
            console.error('Failed to update inline category:', err);
            toast.error('Network error. Failed to save changes.');
            handleCellChange(catId, field, originalValue);
        } finally {
            setSavingRows((prev) => {
                const next = new Set(prev);
                next.delete(catId);
                return next;
            });
        }
    };

    const handleToggleActive = async (cat: Category) => {
        setToggleLoadingId(cat.id);
        try {
            const res = await fetch(`/api/v1/admin/categories/${cat.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !cat.isActive }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Toggle failed');
            setCategories((prev) =>
                prev.map((c) => (c.id === cat.id ? { ...c, isActive: !c.isActive } : c))
            );
            if (originalCategoriesRef.current[cat.id]) {
                originalCategoriesRef.current[cat.id].isActive = !cat.isActive;
            }
            toast.success('Category active status updated');
        } catch (err) {
            console.error('Toggle active failed:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to toggle active status');
        } finally {
            setToggleLoadingId(null);
        }
    };

    // -----------------------------------------------------------------------
    // Import
    // -----------------------------------------------------------------------

    const openImportModal = () => {
        setImportFile(null);
        setImportResult(null);
        setShowImportModal(true);
    };

    const closeImportModal = () => {
        setShowImportModal(false);
        setImportFile(null);
        setImportResult(null);
    };

    const handleImport = async () => {
        if (!importFile) return;
        setImportLoading(true);
        setImportResult(null);
        try {
            const fd = new FormData();
            fd.append('file', importFile);

            const res = await fetch('/api/v1/admin/categories/import', {
                method: 'POST',
                body: fd,
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Import failed');

            setImportResult({
                created: json.data?.created ?? json.created ?? 0,
                errors: json.data?.errors ?? json.errors ?? [],
            });
            fetchCategories();
        } catch (err) {
            setImportResult({
                created: 0,
                errors: [err instanceof Error ? err.message : 'Import failed'],
            });
        } finally {
            setImportLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Export
    // -----------------------------------------------------------------------

    const handleExport = (format: 'csv' | 'xlsx') => {
        window.open(`/api/v1/admin/categories/export?format=${format}`, '_blank');
    };

    // -----------------------------------------------------------------------
    // Possible parents for dropdown (exclude self and own children on edit)
    // -----------------------------------------------------------------------

    const parentOptions = useMemo(() => {
        const topLevel = categories.filter((c) => !c.parentId);
        if (!editingCategory) return topLevel;
        // Exclude the category itself and its children
        const excludeIds = new Set([
            editingCategory.id,
            ...categories.filter((c) => c.parentId === editingCategory.id).map((c) => c.id),
        ]);
        return topLevel.filter((c) => !excludeIds.has(c.id));
    }, [categories, editingCategory]);



    // -----------------------------------------------------------------------
    // Category row renderer
    // -----------------------------------------------------------------------



    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 animate-spin text-[#299E60]" />
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
            {/* ============================================================= */}
            {/* Header */}
            {/* ============================================================= */}
            <AdminRegistryPageHeader
                title="Category Management"
                subtitle="Organize and manage your product categories"
                actions={
                    <>
                        {/* Import */}
                        <button
                            onClick={openImportModal}
                            className="h-[44px] px-5 flex items-center gap-2 bg-white border border-[#D1D5DB] rounded-[12px] text-[14px] font-bold text-[#181725] hover:border-[#299E60]/40 hover:shadow-sm transition-all"
                        >
                            <Upload size={16} />
                            Import
                        </button>

                        {/* Export dropdown */}
                        <div className="relative group">
                            <button className="h-[44px] px-5 flex items-center gap-2 bg-white border border-[#D1D5DB] rounded-[12px] text-[14px] font-bold text-[#181725] hover:border-[#299E60]/40 hover:shadow-sm transition-all">
                                <Download size={16} />
                                Export
                                <ChevronDown size={14} className="text-[#AEAEAE]" />
                            </button>
                            <div className="absolute right-0 top-full mt-2 bg-white border border-[#D1D5DB] rounded-[12px] shadow-lg py-2 w-[180px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                                <button
                                    onClick={() => handleExport('csv')}
                                    className="w-full px-4 py-2.5 text-left text-[14px] font-medium text-[#181725] hover:bg-[#F8F9FB] flex items-center gap-2.5 transition-colors"
                                >
                                    <FileText size={16} className="text-[#299E60]" />
                                    Export CSV
                                </button>
                                <button
                                    onClick={() => handleExport('xlsx')}
                                    className="w-full px-4 py-2.5 text-left text-[14px] font-medium text-[#181725] hover:bg-[#F8F9FB] flex items-center gap-2.5 transition-colors"
                                >
                                    <FileSpreadsheet size={16} className="text-[#299E60]" />
                                    Export Excel
                                </button>
                            </div>
                        </div>

                        {/* Add Category */}
                        {canWriteProducts && (
                            <button
                                onClick={openCreateModal}
                                className="h-[44px] px-6 flex items-center gap-2 bg-[#299E60] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#238a54] shadow-sm shadow-[#299E60]/20 transition-all active:scale-[0.98] shrink-0"
                            >
                                <Plus size={18} strokeWidth={2.5} />
                                Add Category
                            </button>
                        )}
                    </>
                }
            />

            {/* ============================================================= */}
            {/* Stats */}
            {/* ============================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    {
                        label: 'Total Categories',
                        value: stats.total,
                        icon: FolderTree,
                        color: '#3B82F6',
                        bgColor: '#EFF6FF',
                    },
                    {
                        label: 'Active',
                        value: stats.active,
                        icon: CheckCircle,
                        color: '#299E60',
                        bgColor: '#EEF8F1',
                    },
                    {
                        label: 'Pending Approval',
                        value: stats.pending,
                        icon: Clock,
                        color: '#F59E0B',
                        bgColor: '#FFF7E6',
                    },
                    {
                        label: 'Inactive',
                        value: stats.inactive,
                        icon: XCircle,
                        color: '#9CA3AF',
                        bgColor: '#F3F4F6',
                    },
                ].map((stat, idx) => (
                    <div
                        key={idx}
                        className="bg-white p-6 rounded-[14px] border border-[#D1D5DB] shadow-sm flex items-center gap-5"
                    >
                        <div
                            className="w-[56px] h-[56px] rounded-[14px] flex items-center justify-center shrink-0"
                            style={{ backgroundColor: stat.bgColor, color: stat.color }}
                        >
                            <stat.icon size={26} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[13px] font-bold text-[#AEAEAE] mb-1 uppercase tracking-wider">
                                {stat.label}
                            </p>
                            <h3 className="text-[28px] font-[900] text-[#181725] leading-none">
                                {stat.value}
                            </h3>
                        </div>
                    </div>
                ))}
            </div>

            {/* ============================================================= */}
            {/* Error banner */}
            {/* ============================================================= */}
            {error && (
                <div className="bg-[#FFF0F0] border border-[#E74C3C]/20 rounded-[14px] p-5 flex items-center gap-3">
                    <AlertTriangle size={20} className="text-[#E74C3C] shrink-0" />
                    <p className="text-[14px] font-medium text-[#E74C3C]">{error}</p>
                    <button
                        onClick={fetchCategories}
                        className="ml-auto text-[13px] font-bold text-[#E74C3C] underline hover:no-underline"
                    >
                        Retry
                    </button>
                </div>
            )}

            <AdminRegistryFilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search categories..."
            />

            {/* ============================================================= */}
            {/* Category Table */}
            {/* ============================================================= */}
            <div className="bg-white rounded-[14px] border border-[#D1D5DB] shadow-sm overflow-hidden">

                {/* Table */}
                <div className="overflow-x-auto min-h-[300px]">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                            <tr className="bg-[#F9FAFB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider border-b border-[#D1D5DB]">
                                <th className="pl-8 pr-6 py-3.5 sticky left-0 bg-[#F9FAFB] z-20 min-w-[280px] border-r border-[#D1D5DB]">
                                    Category
                                </th>
                                <th className="px-6 py-3.5 min-w-[200px] border-r border-[#D1D5DB]">
                                    Slug
                                </th>
                                <th className="px-6 py-3.5 min-w-[110px] border-r border-[#D1D5DB]">
                                    Products
                                </th>
                                <th className="px-6 py-3.5 min-w-[110px] text-right border-r border-[#D1D5DB]">
                                    Sort Order
                                </th>
                                <th className="px-6 py-3.5 min-w-[130px] border-r border-[#D1D5DB]">
                                    Status
                                </th>
                                <th className="px-6 py-3.5 min-w-[130px] border-r border-[#D1D5DB]">
                                    Active
                                </th>
                                <th className="pl-4 pr-8 py-3.5 text-right sticky right-0 bg-[#F9FAFB] z-20 min-w-[100px] border-l border-[#D1D5DB]">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D1D5DB]">
                            {filteredCategories.map((parent) => {
                                const children = parent.children || [];
                                const hasChildren = children.length > 0;
                                const isExpanded = expandedIds.has(parent.id);

                                return (
                                    <React.Fragment key={parent.id}>
                                        <CategoryRow
                                            cat={parent}
                                            hasChildren={hasChildren}
                                            isExpanded={isExpanded}
                                            toggleExpand={toggleExpand}
                                            handleCellChange={handleCellChange}
                                            handleInlineEdit={handleInlineEdit}
                                            originalCat={originalCategoriesRef.current[parent.id]}
                                            toggleLoadingId={toggleLoadingId}
                                            savingRows={savingRows}
                                            openEditModal={openEditModal}
                                            openDeleteModal={openDeleteModal}
                                            handleToggleActive={handleToggleActive}
                                        />
                                        {hasChildren &&
                                            isExpanded &&
                                            children.map((child) => (
                                                <CategoryRow
                                                    key={child.id}
                                                    cat={child}
                                                    isChild
                                                    toggleExpand={toggleExpand}
                                                    handleCellChange={handleCellChange}
                                                    handleInlineEdit={handleInlineEdit}
                                                    originalCat={originalCategoriesRef.current[child.id]}
                                                    toggleLoadingId={toggleLoadingId}
                                                    savingRows={savingRows}
                                                    openEditModal={openEditModal}
                                                    openDeleteModal={openDeleteModal}
                                                    handleToggleActive={handleToggleActive}
                                                />
                                            ))}
                                    </React.Fragment>
                                );
                            })}

                            {filteredCategories.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-16 h-16 bg-[#F8F9FB] rounded-full flex items-center justify-center text-[#AEAEAE]">
                                                <FolderTree size={32} />
                                            </div>
                                            <p className="text-[#AEAEAE] font-bold">
                                                {searchQuery
                                                    ? `No categories found matching "${searchQuery}"`
                                                    : 'No categories yet. Click "Add Category" to create one.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-6 bg-[#FDFDFD] border-t border-[#EEEEEE]">
                    <p className="text-[13px] text-[#AEAEAE] font-bold uppercase tracking-wider">
                        Showing{' '}
                        <span className="text-[#181725]">{categories.length}</span> categor
                        {categories.length !== 1 ? 'ies' : 'y'} ({stats.active} active)
                    </p>
                </div>
            </div>

            {/* ============================================================= */}
            {/* Add / Edit Sliding Panel                                       */}
            {/* ============================================================= */}

            {/* Backdrop */}
            <div
                className={cn(
                    'fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300',
                    showFormModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                )}
                onClick={closeFormModal}
            />

            {/* Panel */}
            <div
                className={cn(
                    'fixed top-0 right-0 h-full w-full max-w-[540px] bg-white z-[70] shadow-2xl transition-transform duration-300 ease-in-out flex flex-col',
                    showFormModal ? 'translate-x-0' : 'translate-x-full',
                )}
            >
                {/* Panel Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-[#EEEEEE] shrink-0">
                    <h2 className="text-[22px] font-[900] text-[#181725]">
                        {editingCategory ? 'Edit Category' : 'Add Category'}
                    </h2>
                    <button
                        onClick={closeFormModal}
                        className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center hover:bg-[#F8F9FB] text-[#7C7C7C] hover:text-[#181725] transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Panel Body */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-[#F8F9FB]">
                    {formError && (
                        <div className="flex items-center gap-3 bg-[#FFF0F0] border border-[#E74C3C]/20 text-[#E74C3C] rounded-[12px] px-5 py-4 text-[13px] font-semibold">
                            <AlertTriangle size={18} />
                            {formError}
                        </div>
                    )}

                    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6 space-y-5">
                        {/* Name */}
                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-2">
                                Name <span className="text-[#E74C3C]">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder="e.g. Dairy & Milk Products"
                                className="w-full h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-medium outline-none transition-all placeholder:text-[#AEAEAE] focus:border-[#299E60]/40 focus:bg-white focus:shadow-sm"
                                autoFocus
                            />
                        </div>

                        {/* Slug */}
                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-2">
                                Slug <span className="text-[#E74C3C]">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.slug}
                                onChange={(e) => handleSlugChange(e.target.value)}
                                placeholder="auto-generated-from-name"
                                className="w-full h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-mono font-medium outline-none transition-all placeholder:text-[#AEAEAE] focus:border-[#299E60]/40 focus:bg-white focus:shadow-sm"
                            />
                            <p className="text-[11px] text-[#AEAEAE] mt-1.5 font-medium">
                                Auto-generated from name. Edit manually if needed.
                            </p>
                        </div>

                        {/* Parent Category */}
                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-2">
                                Parent Category
                            </label>
                            <select
                                value={formData.parentId || ''}
                                onChange={(e) => {
                                    const nextParent = e.target.value || null;
                                    setFormData((prev) => ({
                                        ...prev,
                                        parentId: nextParent,
                                        parentCategoryIds: nextParent
                                            ? prev.parentCategoryIds.includes(nextParent)
                                                ? prev.parentCategoryIds
                                                : [nextParent, ...prev.parentCategoryIds.filter((id) => id !== nextParent)]
                                            : [],
                                    }));
                                }}
                                className="w-full h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-medium outline-none transition-all focus:border-[#299E60]/40 focus:bg-white focus:shadow-sm appearance-none cursor-pointer"
                            >
                                <option value="">None (Top-level category)</option>
                                {parentOptions.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {formData.parentId && (
                            <div>
                                <label className="block text-[13px] font-bold text-[#181725] mb-2">
                                    Linked Parent Categories
                                </label>
                                <p className="text-[11px] text-[#AEAEAE] mb-2 font-medium">
                                    A sub-category can appear under multiple parent categories. First checked is primary.
                                </p>
                                <div className="space-y-2 max-h-[180px] overflow-y-auto border border-[#EEEEEE] rounded-[10px] p-3 bg-[#F8F9FB]">
                                    {parentOptions.map((cat) => {
                                        const checked = formData.parentCategoryIds.includes(cat.id);
                                        return (
                                            <label
                                                key={cat.id}
                                                className="flex items-center gap-2 text-[13px] font-medium text-[#181725] cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => {
                                                        setFormData((prev) => {
                                                            let nextIds = prev.parentCategoryIds;
                                                            if (e.target.checked) {
                                                                nextIds = [...nextIds, cat.id];
                                                            } else {
                                                                nextIds = nextIds.filter((id) => id !== cat.id);
                                                            }
                                                            return {
                                                                ...prev,
                                                                parentCategoryIds: nextIds,
                                                                parentId: nextIds[0] ?? null,
                                                            };
                                                        });
                                                    }}
                                                    className="rounded border-gray-300 text-[#299E60] focus:ring-[#299E60]/30"
                                                />
                                                {cat.name}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Category Image */}
                        <div>
                            <ImageUpload
                                value={formData.imageUrl}
                                onChange={(url) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        imageUrl: url,
                                    }))
                                }
                                folder="categories"
                                label="Category Image"
                                size="md"
                            />
                        </div>

                        {/* Sort Order + Is Active row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[13px] font-bold text-[#181725] mb-2">
                                    Sort Order
                                </label>
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
                                    className="w-full h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-medium outline-none transition-all focus:border-[#299E60]/40 focus:bg-white focus:shadow-sm"
                                />
                            </div>
                            <div className="flex items-end pb-1">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            isActive: !prev.isActive,
                                        }))
                                    }
                                    className="flex items-center gap-3 select-none"
                                >
                                    <div
                                        className={cn(
                                            'relative w-[44px] h-[24px] rounded-full transition-colors',
                                            formData.isActive ? 'bg-[#299E60]' : 'bg-[#EEEEEE]'
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'absolute top-[2px] left-[2px] w-[20px] h-[20px] bg-white rounded-full shadow-sm transition-transform',
                                                formData.isActive && 'translate-x-[20px]'
                                            )}
                                        />
                                    </div>
                                    <span className="text-[13px] font-bold text-[#181725]">
                                        Is Active
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Panel Footer */}
                <div className="px-8 py-6 border-t border-[#EEEEEE] shrink-0 flex items-center gap-4">
                    <button
                        type="button"
                        onClick={closeFormModal}
                        className="flex-1 h-[48px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#181725] rounded-[12px] text-[14px] font-bold hover:bg-[#EEEEEE] transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            handleSubmit(e);
                        }}
                        disabled={formLoading}
                        className="flex-1 h-[48px] bg-[#299E60] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#238a54] shadow-sm shadow-[#299E60]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {formLoading && <Loader2 size={16} className="animate-spin" />}
                        {editingCategory ? 'Update Category' : 'Create Category'}
                    </button>
                </div>
            </div>

            {/* ============================================================= */}
            {/* Delete Confirmation Modal */}
            {/* ============================================================= */}
            {showDeleteModal && deletingCategory && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={closeDeleteModal}
                >
                    <div
                        className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-2xl w-full max-w-[440px] mx-4 max-h-[calc(100vh-2rem)] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-8 text-center">
                            <div className="w-[64px] h-[64px] mx-auto mb-5 rounded-full bg-[#FFF0F0] flex items-center justify-center">
                                <AlertTriangle size={32} className="text-[#E74C3C]" />
                            </div>
                            <h3 className="text-[20px] font-[900] text-[#181725] mb-2">
                                Delete Category?
                            </h3>
                            <p className="text-[14px] text-[#7C7C7C] font-medium leading-relaxed">
                                Are you sure you want to delete{' '}
                                <strong className="text-[#181725]">
                                    {deletingCategory.name}
                                </strong>
                                ? This will deactivate the category and remove it from the storefront.
                            </p>
                        </div>

                        <div className="flex items-center gap-3 p-6 border-t border-[#EEEEEE]">
                            <button
                                onClick={closeDeleteModal}
                                className="flex-1 h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#7C7C7C] rounded-[10px] text-[14px] font-bold hover:bg-[#EEEEEE] transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleteLoading}
                                className="flex-1 h-[46px] bg-[#E74C3C] text-white rounded-[10px] text-[14px] font-bold hover:bg-[#cf4436] shadow-sm shadow-[#E74C3C]/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {deleteLoading && (
                                    <Loader2 size={16} className="animate-spin" />
                                )}
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================= */}
            {/* Import Modal */}
            {/* ============================================================= */}
            {showImportModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={closeImportModal}
                >
                    <div
                        className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-2xl w-full max-w-[500px] mx-4 max-h-[calc(100vh-2rem)] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="flex items-center justify-between p-6 border-b border-[#EEEEEE]">
                            <h2 className="text-[20px] font-[900] text-[#181725]">
                                Import Categories
                            </h2>
                            <button
                                onClick={closeImportModal}
                                className="w-[36px] h-[36px] flex items-center justify-center rounded-[10px] bg-[#F1F4F9] text-[#7C7C7C] hover:bg-[#EEEEEE] transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="p-6 space-y-5">
                            {/* Info */}
                            <div className="bg-[#EFF6FF] border border-[#3B82F6]/10 rounded-[10px] p-4">
                                <p className="text-[13px] font-medium text-[#3B82F6] leading-relaxed">
                                    Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file
                                    with the following columns:{' '}
                                    <code className="bg-white/60 px-1.5 py-0.5 rounded text-[12px] font-mono">
                                        name, slug, parentSlug, imageUrl, sortOrder
                                    </code>
                                </p>
                            </div>

                            {/* File upload area */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    'border-2 border-dashed rounded-[12px] p-8 text-center cursor-pointer transition-all',
                                    importFile
                                        ? 'border-[#299E60] bg-[#EEF8F1]'
                                        : 'border-[#EEEEEE] hover:border-[#299E60]/40 hover:bg-[#F8F9FB]'
                                )}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    className="hidden"
                                    onChange={(e) => {
                                        setImportFile(e.target.files?.[0] || null);
                                        setImportResult(null);
                                    }}
                                />
                                {importFile ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <FileSpreadsheet
                                            size={32}
                                            className="text-[#299E60]"
                                        />
                                        <p className="text-[14px] font-bold text-[#181725]">
                                            {importFile.name}
                                        </p>
                                        <p className="text-[12px] text-[#7C7C7C]">
                                            {(importFile.size / 1024).toFixed(1)} KB
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <Upload size={32} className="text-[#AEAEAE]" />
                                        <p className="text-[14px] font-bold text-[#7C7C7C]">
                                            Click to select a file
                                        </p>
                                        <p className="text-[12px] text-[#AEAEAE]">
                                            Accepted: .csv, .xlsx
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Import results */}
                            {importResult && (
                                <div className="space-y-3">
                                    {importResult.created > 0 && (
                                        <div className="bg-[#EEF8F1] border border-[#299E60]/10 rounded-[10px] p-4 flex items-center gap-3">
                                            <CheckCircle
                                                size={20}
                                                className="text-[#299E60] shrink-0"
                                            />
                                            <p className="text-[14px] font-bold text-[#299E60]">
                                                Successfully created {importResult.created}{' '}
                                                categor{importResult.created !== 1 ? 'ies' : 'y'}
                                            </p>
                                        </div>
                                    )}
                                    {importResult.errors.length > 0 && (
                                        <div className="bg-[#FFF0F0] border border-[#E74C3C]/10 rounded-[10px] p-4 space-y-2">
                                            <p className="text-[13px] font-bold text-[#E74C3C]">
                                                {importResult.errors.length} error
                                                {importResult.errors.length !== 1 ? 's' : ''}:
                                            </p>
                                            <ul className="text-[12px] text-[#E74C3C] space-y-1 max-h-[120px] overflow-y-auto">
                                                {importResult.errors.map((err, i) => (
                                                    <li key={i} className="flex items-start gap-1.5">
                                                        <span className="mt-0.5 shrink-0">-</span>
                                                        {typeof err === 'string' ? err : `Row ${err.row}: ${err.message}`}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeImportModal}
                                    className="flex-1 h-[46px] bg-[#F8F9FB] border border-[#EEEEEE] text-[#7C7C7C] rounded-[10px] text-[14px] font-bold hover:bg-[#EEEEEE] transition-all"
                                >
                                    {importResult ? 'Close' : 'Cancel'}
                                </button>
                                {!importResult && (
                                    <button
                                        onClick={handleImport}
                                        disabled={!importFile || importLoading}
                                        className="flex-1 h-[46px] bg-[#299E60] text-white rounded-[10px] text-[14px] font-bold hover:bg-[#238a54] shadow-sm shadow-[#299E60]/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {importLoading && (
                                            <Loader2 size={16} className="animate-spin" />
                                        )}
                                        Upload & Import
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const CategoryRow = ({
    cat,
    isChild = false,
    hasChildren = false,
    isExpanded = false,
    toggleExpand,
    handleCellChange,
    handleInlineEdit,
    originalCat,
    toggleLoadingId,
    savingRows,
    openEditModal,
    openDeleteModal,
    handleToggleActive,
}: {
    cat: Category;
    isChild?: boolean;
    hasChildren?: boolean;
    isExpanded?: boolean;
    toggleExpand: (id: string) => void;
    handleCellChange: (catId: string, field: keyof Category, value: Category[keyof Category]) => void;
    handleInlineEdit: (catId: string, field: keyof Category, value: Category[keyof Category], originalValue: Category[keyof Category]) => Promise<void>;
    originalCat?: Category;
    toggleLoadingId: string | null;
    savingRows: Set<string>;
    openEditModal: (cat: Category) => void;
    openDeleteModal: (cat: Category) => void;
    handleToggleActive: (cat: Category) => void;
}) => {
    const { has } = usePermissions();
    const canWriteProducts = has('products.edit');

    return (
        <tr
            className={cn(
                'hover:bg-[#F9FAFB]/60 transition-colors group text-[13px]',
                isChild && 'bg-[#FAFBFC]'
            )}
        >
            {/* Name + Image (sticky left) */}
            <td className={cn(
                "pl-8 pr-6 py-3 sticky left-0 z-10 border-r border-[#D1D5DB] transition-colors align-middle",
                isChild ? "bg-[#FAFBFC] group-hover:bg-[#F9FAFB]" : "bg-white group-hover:bg-[#F9FAFB]"
            )}>
                <div className={cn('flex items-center gap-3', isChild && 'pl-8')}>
                    {/* Expand/collapse or indent indicator */}
                    {!isChild && hasChildren ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleExpand(cat.id);
                            }}
                            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[#EEEEEE] transition-colors shrink-0"
                        >
                            {isExpanded ? (
                                <ChevronDown size={16} className="text-[#7C7C7C]" />
                            ) : (
                                <ChevronRight size={16} className="text-[#7C7C7C]" />
                            )}
                        </button>
                    ) : !isChild ? (
                        <div className="w-6 h-6 shrink-0" />
                    ) : (
                        <div className="flex items-center text-gray-300 -ml-5 mr-1 shrink-0 select-none">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 5v7a2 2 0 0 0 2 2h8" />
                            </svg>
                        </div>
                    )}

                    {/* Thumbnail */}
                    {cat.imageUrl ? (
                        <img
                            src={cat.imageUrl}
                            alt={cat.name}
                            className="w-9 h-9 rounded-[8px] object-cover border border-[#D1D5DB] shrink-0"
                        />
                    ) : (
                        <div className="w-9 h-9 rounded-[8px] bg-[#F1F4F9] flex items-center justify-center shrink-0">
                            <Tag size={15} className="text-[#AEAEAE]" />
                        </div>
                    )}

                    <div className="min-w-0 flex-1">
                        <input
                            type="text"
                            value={cat.name}
                            onChange={e => handleCellChange(cat.id, 'name', e.target.value)}
                            onBlur={e => handleInlineEdit(cat.id, 'name', e.target.value, originalCat?.name)}
                            className={cn(cellInput, isChild ? "font-semibold text-[#4B5563] text-[13px] -ml-1.5 px-1.5 py-0.5" : "font-extrabold text-[#181725] text-[13.5px] -ml-1.5 px-1.5 py-0.5")}
                        />
                        {isChild && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider bg-[#F3F4F6] text-[#6B7280] rounded-[4px] mt-1 select-none">
                                Subcategory
                            </span>
                        )}
                    </div>
                </div>
            </td>

            {/* Slug */}
            <td className="px-6 py-3 border-r border-[#D1D5DB] align-middle">
                <input
                    type="text"
                    value={cat.slug}
                    onChange={e => handleCellChange(cat.id, 'slug', e.target.value)}
                    onBlur={e => handleInlineEdit(cat.id, 'slug', e.target.value, originalCat?.slug)}
                    className={cn(cellInput, "font-mono text-[#7C7C7C] px-1.5 py-0.5")}
                />
            </td>

            {/* Products */}
            <td className="px-6 py-3 border-r border-[#D1D5DB] align-middle">
                <div className="flex items-center gap-1.5 px-1.5 font-semibold text-[#181725]">
                    <Package size={14} className="text-[#AEAEAE]" />
                    <span>{cat._count?.products ?? 0}</span>
                </div>
            </td>

            {/* Sort Order */}
            <td className="px-6 py-3 border-r border-[#D1D5DB] bg-[#FAFAFA]/10 align-middle">
                <input
                    type="number"
                    value={cat.sortOrder}
                    onChange={e => handleCellChange(cat.id, 'sortOrder', parseInt(e.target.value, 10) || 0)}
                    onBlur={e => handleInlineEdit(cat.id, 'sortOrder', parseInt(e.target.value, 10) || 0, originalCat?.sortOrder ?? 0)}
                    className={cn(cellInput, "text-right font-medium text-[#7C7C7C] max-w-[65px] px-1.5 py-0.5 ml-auto")}
                />
            </td>

            {/* Status */}
            <td className="px-6 py-3 border-r border-[#D1D5DB] align-middle">
                <select
                    value={cat.approvalStatus}
                    onChange={e => {
                        const val = e.target.value as Category['approvalStatus'];
                        handleCellChange(cat.id, 'approvalStatus', val);
                        handleInlineEdit(cat.id, 'approvalStatus', val, originalCat?.approvalStatus);
                    }}
                    className={cn(cellInput, "font-semibold appearance-none py-1 px-1.5 cursor-pointer max-w-[110px]", 
                        cat.approvalStatus === 'approved' && "text-[#299E60]",
                        cat.approvalStatus === 'pending' && "text-[#F59E0B]",
                        cat.approvalStatus === 'rejected' && "text-[#E74C3C]"
                    )}
                >
                    <option value="pending" className="text-[#F59E0B] font-semibold">Pending</option>
                    <option value="approved" className="text-[#299E60] font-semibold">Approved</option>
                    <option value="rejected" className="text-[#E74C3C] font-semibold">Rejected</option>
                </select>
            </td>

            {/* Active toggle */}
            <td className="px-6 py-3 border-r border-[#D1D5DB] align-middle">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleToggleActive(cat);
                    }}
                    disabled={toggleLoadingId === cat.id}
                    className="flex items-center gap-2 disabled:opacity-50 px-1 py-0.5"
                    title={cat.isActive ? 'Click to deactivate' : 'Click to activate'}
                >
                    {toggleLoadingId === cat.id ? (
                        <Loader2 size={15} className="animate-spin text-[#AEAEAE]" />
                    ) : (
                        <div
                            className="relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-200"
                            style={{ backgroundColor: cat.isActive ? '#299E60' : '#D1D5DB' }}
                        >
                            <span className="inline-block h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform duration-200" style={{ transform: cat.isActive ? 'translateX(17px)' : 'translateX(3px)' }} />
                        </div>
                    )}
                    <span
                        className={cn(
                            'text-[12.5px] font-bold',
                            cat.isActive ? 'text-[#299E60]' : 'text-[#AEAEAE]'
                        )}
                    >
                        {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                </button>
            </td>

            {/* Actions (sticky right) */}
            <td className="pl-4 pr-8 py-3 sticky right-0 bg-white group-hover:bg-[#F9FAFB] z-10 border-l border-[#D1D5DB] text-right align-middle">
                <div className="flex items-center justify-end gap-2">
                    {savingRows.has(cat.id) ? (
                        <Loader2 size={16} className="animate-spin text-[#299E60] mx-auto mr-4" />
                    ) : (
                        <>
                            {canWriteProducts && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openEditModal(cat);
                                    }}
                                    className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] bg-[#F1F4F9] text-[#7C7C7C] hover:bg-[#EEF8F1] hover:text-[#299E60] transition-all"
                                    title="Edit category"
                                >
                                    <Edit2 size={14} />
                                </button>
                            )}
                            {canWriteProducts && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openDeleteModal(cat);
                                    }}
                                    className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] bg-[#F1F4F9] text-[#7C7C7C] hover:bg-[#FFF0F0] hover:text-[#E74C3C] transition-all"
                                    title="Delete category"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
}



