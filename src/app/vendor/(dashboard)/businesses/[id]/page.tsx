'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  LogIn,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { setEnteredStore } from '@/lib/supplierPortalLevel';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { FormErrorBanner } from '@/components/ui/form';
import { extractApiError, parseJsonResponse } from '@/lib/apiError';
import {
  StoreSetupWizard,
  type StoreSetupPayload,
} from '@/components/features/vendor/StoreSetupWizard';
import {
  VendorProfileForm,
  type VendorProfileValues,
} from '@/components/features/vendor/VendorProfileForm';
import { EMPTY_VENDOR_PROFILE } from '@/components/features/vendor/vendorProfileDefaults';
import {
  getEffectiveVendorTypeSelections,
  validateFieldBlur as validateVendorFieldBlur,
} from '@/lib/validators/vendor-profile';
import { normalizeVendorTypeSelections } from '@/lib/constants/vendorProfile';

const VIEW_STORAGE_KEY = 'horeca_vendor_stores_view';

type ViewMode = 'grid' | 'table';

interface StoreRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isVerified: boolean;
  isPrimaryStore: boolean;
  logoUrl: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

interface BusinessRow {
  id: string;
  legalName: string;
  displayName: string | null;
  gstin: string | null;
  status: string;
  isPrimary: boolean;
  vendorTypeSelections?: unknown;
  businessSize?: string | null;
  stores: StoreRow[];
  storeCount: number;
}

export default function BusinessDetailPage() {
  const params = useParams();
  const businessId = typeof params?.id === 'string' ? params.id : '';
  const { switchOnlineStore } = useBusinessAccountSwitcher();
  const confirm = useConfirm();

  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [editStoreId, setEditStoreId] = useState<string | null>(null);
  const [editStoreInitial, setEditStoreInitial] = useState<Partial<StoreSetupPayload> | null>(null);
  const [editStoreLoading, setEditStoreLoading] = useState(false);
  const [editBusinessOpen, setEditBusinessOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<VendorProfileValues>({ ...EMPTY_VENDOR_PROFILE });
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});
  const [editBannerError, setEditBannerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const fetchBusiness = useCallback(async () => {
    if (!businessId) return;
    try {
      const res = await fetch('/api/v1/supplier/businesses');
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error?.message ?? 'Failed to load business');
        return;
      }
      const rows = json.data as BusinessRow[];
      const found = rows.find((b) => b.id === businessId) ?? null;
      setBusiness(found);
      if (!found) toast.error('Business not found');
    } catch {
      toast.error('Failed to load business');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    setEnteredStore(false);
    void fetchBusiness();
  }, [fetchBusiness]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === 'grid' || stored === 'table') {
        Promise.resolve().then(() => setViewMode(stored));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const handleEnterStore = async (store: StoreRow) => {
    if (!store.isActive) {
      toast.error('This store is inactive');
      return;
    }
    // Pending approval: still allow Enter for team ops (marketplace visibility is separate).
    setEnteringId(store.id);
    try {
      setEnteredStore(true);
      await switchOnlineStore(store.id, businessId);
      toast.success(`Entered ${store.name}`);
      window.location.assign('/vendor/dashboard');
    } catch (err) {
      setEnteredStore(false);
      toast.error(err instanceof Error ? err.message : 'Failed to enter store');
      setEnteringId(null);
    }
  };

  const handleAddStore = async (payload: StoreSetupPayload) => {
    if (!businessId || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/supplier/businesses/${businessId}/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to create online store');
        return;
      }
      toast.success('Online store created');
      setAddStoreOpen(false);
      await fetchBusiness();
    } catch {
      toast.error('Failed to create online store');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditStore = async (payload: StoreSetupPayload) => {
    if (!editStoreId || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/supplier/stores/${editStoreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to update store');
        return;
      }
      toast.success('Online store updated');
      setEditStoreId(null);
      setEditStoreInitial(null);
      await fetchBusiness();
    } catch {
      toast.error('Failed to update store');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = async (store: StoreRow) => {
    if (editStoreLoading) return;
    setEditStoreLoading(true);
    try {
      const res = await fetch(`/api/v1/supplier/stores/${store.id}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to load store details');
        return;
      }
      setEditStoreId(store.id);
      setEditStoreInitial(json.data as Partial<StoreSetupPayload>);
    } catch {
      toast.error('Failed to load store details');
    } finally {
      setEditStoreLoading(false);
    }
  };

  const openEditBusiness = () => {
    if (!business) return;
    const selections = normalizeVendorTypeSelections(business.vendorTypeSelections);
    // Treat displayName that merely mirrors legalName (or a store name copied in
    // during registration) as "not set", so legal-name edits propagate to the
    // displayed name instead of being shadowed by the stale copy.
    const storeNames = business.stores.map((s) => s.name);
    const customDisplayName =
      business.displayName &&
      business.displayName !== business.legalName &&
      !storeNames.includes(business.displayName)
        ? business.displayName
        : '';
    setEditFieldErrors({});
    setEditBannerError(null);
    setEditProfile({
      ...EMPTY_VENDOR_PROFILE,
      legalName: business.legalName,
      businessName: business.legalName,
      displayName: customDisplayName,
      tradeName: customDisplayName,
      gstin: business.gstin ?? '',
      gstNumber: business.gstin ?? '',
      vendorTypeSelections: selections,
      businessSize: business.businessSize ?? '',
    });
    setEditBusinessOpen(true);
  };

  const handleEditBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || submitting) return;
    const legalName = (editProfile.legalName ?? editProfile.businessName ?? '').trim();
    const errors: Record<string, string> = {};
    if (legalName.length < 2) errors.legalName = 'Legal business name is required';
    const typeSelections = getEffectiveVendorTypeSelections(editProfile);
    if (typeSelections.length === 0) {
      errors.vendorTypeSelections = 'Select at least one vendor type and sub-type';
    }
    setEditFieldErrors(errors);
    setEditBannerError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/supplier/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName,
          // Empty custom display → sync to legal (also clears store-name bleed)
          displayName: (editProfile.displayName ?? '').trim() || legalName,
          gstin: (editProfile.gstin ?? editProfile.gstNumber ?? '').trim() || undefined,
          vendorTypeSelections: typeSelections,
          businessSize: editProfile.businessSize || null,
        }),
      });
      const json = await parseJsonResponse(res);
      if (!res.ok || !json.success) {
        const parsed = extractApiError(json, 'Failed to update business');
        setEditBannerError(parsed.message);
        if (parsed.fields) setEditFieldErrors((prev) => ({ ...prev, ...parsed.fields }));
        toast.error(parsed.message);
        return;
      }
      toast.success('Business updated');
      setEditBusinessOpen(false);
      setEditBannerError(null);
      await fetchBusiness();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update business';
      setEditBannerError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStore = async (store: StoreRow) => {
    const ok = await confirm({
      title: 'Delete Online Store?',
      message: `Delete “${store.name}”? This cannot be undone. Stores with orders cannot be deleted.`,
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/supplier/stores/${store.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to delete online store');
        return;
      }
      toast.success('Online store deleted');
      await fetchBusiness();
    } catch {
      toast.error('Failed to delete online store');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStoreActions = (store: StoreRow) => {
    return (
      <div className="inline-flex items-center gap-1 flex-wrap">
        <button
          type="button"
          disabled={!store.isActive || enteringId === store.id}
          onClick={() => void handleEnterStore(store)}
          className="inline-flex items-center gap-1 h-[30px] px-2.5 text-[12px] font-bold text-white bg-[#299E60] hover:bg-[#238a54] disabled:opacity-50 rounded-[6px]"
          data-testid="enter-store"
          title={!store.isVerified ? 'Pending marketplace approval — ops access still available' : undefined}
        >
          {enteringId === store.id ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <LogIn size={12} />
          )}
          Enter
        </button>
        <button
          type="button"
          disabled={editStoreLoading}
          onClick={() => void openEdit(store)}
          className="inline-flex items-center gap-1 h-[30px] px-2 text-[12px] font-semibold text-[#7C7C7C] hover:text-[#181725] hover:bg-[#F3F4F6] disabled:opacity-50 rounded-[6px]"
        >
          {editStoreLoading ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
          Edit
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleDeleteStore(store)}
          className="inline-flex items-center gap-1 h-[30px] px-2 text-[12px] font-semibold text-[#E74C3C] hover:bg-[#FEE2E2] disabled:opacity-40 rounded-[6px]"
          title="Delete store"
          data-testid="delete-store"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#299E60]" size={28} />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="max-w-[720px] mx-auto text-center py-12">
        <p className="text-[13px] text-[#7C7C7C] mb-3">Business not found.</p>
        <Link href="/vendor/businesses" className="text-[13px] font-bold text-[#299E60]">
          ← Businesses
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-4" data-testid="business-detail">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link
            href="/vendor/businesses"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#299E60] hover:text-[#238a54]"
            data-testid="back-to-supplier"
          >
            <ArrowLeft size={13} />
            Businesses
          </Link>
          <h1 className="text-[20px] font-bold text-[#181725] leading-tight mt-0.5 truncate">
            {business.displayName ?? business.legalName}
          </h1>
          <p className="text-[12px] text-[#7C7C7C] mt-0.5 truncate">
            {[
              business.displayName
                && business.displayName !== business.legalName
                && !business.stores.some((s) => s.name === business.displayName)
                ? business.legalName
                : null,
              business.gstin ? `GST ${business.gstin}` : null,
              `${business.stores.filter((s) => s.isActive).length}/${business.storeCount} stores active`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
          <button
            type="button"
            onClick={openEditBusiness}
            className="inline-flex items-center gap-1.5 h-[36px] px-3 border border-[#EEEEEE] text-[#7C7C7C] hover:text-[#181725] hover:bg-[#F8F9FB] text-[13px] font-bold rounded-[8px] transition-colors"
          >
            <Pencil size={14} />
            Edit Business
          </button>
          {business.stores.length > 0 && (
            <div className="flex items-center bg-[#F3F4F6] border border-[#D1D5DB] rounded-[10px] p-1">
              <button
                type="button"
                onClick={() => changeViewMode('grid')}
                className={cn(
                  'p-2 rounded-[8px] transition-all flex items-center gap-1.5 text-[12px] font-bold',
                  viewMode === 'grid'
                    ? 'bg-white text-[#111827] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#111827]',
                )}
                aria-pressed={viewMode === 'grid'}
                aria-label="Cards view"
              >
                <LayoutGrid size={15} />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => changeViewMode('table')}
                className={cn(
                  'p-2 rounded-[8px] transition-all flex items-center gap-1.5 text-[12px] font-bold',
                  viewMode === 'table'
                    ? 'bg-white text-[#111827] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#111827]',
                )}
                aria-pressed={viewMode === 'table'}
                aria-label="Table view"
              >
                <List size={15} />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setAddStoreOpen(true)}
            className="inline-flex items-center gap-1.5 h-[36px] px-3.5 bg-[#299E60] hover:bg-[#238a54] text-white text-[13px] font-bold rounded-[8px] transition-colors"
          >
            <Plus size={15} />
            Add Online Store
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-[12px] overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 border-b border-[#F0F0F0]">
          <h2 className="text-[13px] font-bold text-[#181725]">Online Stores</h2>
          <p className="text-[11px] text-[#7C7C7C]">
            Enter a store for products, inventory, and orders.
          </p>
        </div>

        {business.stores.length === 0 ? (
          <p className="px-4 py-8 text-[13px] text-[#AEAEAE] text-center">No online stores yet.</p>
        ) : viewMode === 'grid' ? (
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {business.stores.map((store) => (
              <div
                key={store.id}
                className={cn(
                  'border border-[#EEEEEE] rounded-[10px] p-3.5 hover:border-[#299E60]/40 hover:shadow-sm transition-all',
                  !store.isVerified && 'opacity-70',
                )}
                data-testid="store-row"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-[14px] text-[#181725] truncate">{store.name}</p>
                    {store.isPrimaryStore && (
                      <p className="text-[10px] font-bold uppercase text-[#AEAEAE]">Primary</p>
                    )}
                  </div>
                </div>
                <p className="text-[#AEAEAE] font-mono text-[12px] truncate mb-3">/{store.slug}</p>
                {renderStoreActions(store)}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F9FAFB] text-[#6B7280] uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Store</th>
                  <th className="px-4 py-2.5 font-bold">Slug</th>
                  <th className="px-4 py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {business.stores.map((store) => (
                  <tr
                    key={store.id}
                    className={cn('hover:bg-[#FAFBFC]', !store.isVerified && 'opacity-70')}
                    data-testid="store-row"
                  >
                    <td className="px-4 py-2.5 min-w-[160px]">
                      <p className="font-semibold text-[#181725] truncate">{store.name}</p>
                      {store.isPrimaryStore && (
                        <p className="text-[10px] font-bold uppercase text-[#AEAEAE]">Primary</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[#AEAEAE] font-mono text-[12px] truncate max-w-[160px]">
                      /{store.slug}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex justify-end">{renderStoreActions(store)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addStoreOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
          <StoreSetupWizard
            submitting={submitting}
            onCancel={() => setAddStoreOpen(false)}
            onSubmit={handleAddStore}
          />
        </div>
      )}

      {editBusinessOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-[16px] w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-xl border border-[#EEEEEE]">
            <div className="px-5 py-4 border-b border-[#F0F0F0] sticky top-0 bg-white z-10">
              <h3 className="text-[16px] font-bold text-[#181725]">Edit Business</h3>
              <p className="text-[12px] text-[#7C7C7C] mt-0.5">
                Update legal name, display name, and business profile.
              </p>
            </div>
            <form onSubmit={handleEditBusiness} className="px-5 py-4 space-y-4">
              <FormErrorBanner message={editBannerError} />
              <VendorProfileForm
                value={editProfile}
                onChange={(patch) => setEditProfile((prev) => ({ ...prev, ...patch }))}
                errors={editFieldErrors}
                onFieldBlur={(field, value) => {
                  const msg = validateVendorFieldBlur(field, value);
                  setEditFieldErrors((prev) => ({ ...prev, [field]: msg }));
                }}
                visibleSections={{ identity: true, ops: true }}
                layout="wide"
                showDisplayName
              />
              <div className="flex gap-2 pt-1 sticky bottom-0 bg-white pb-1">
                <button
                  type="button"
                  onClick={() => setEditBusinessOpen(false)}
                  disabled={submitting}
                  className="flex-1 h-[36px] border border-[#EEEEEE] rounded-[8px] text-[13px] font-semibold text-[#7C7C7C] hover:bg-[#F8F9FB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-[36px] bg-[#299E60] hover:bg-[#238a54] text-white rounded-[8px] text-[13px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editStoreId && editStoreInitial && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
          <StoreSetupWizard
            mode="edit"
            initialValues={editStoreInitial}
            submitting={submitting}
            onCancel={() => {
              setEditStoreId(null);
              setEditStoreInitial(null);
            }}
            onSubmit={handleEditStore}
          />
        </div>
      )}
    </div>
  );
}
