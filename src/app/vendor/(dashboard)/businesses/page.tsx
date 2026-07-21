'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, LayoutGrid, List, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { setEnteredStore } from '@/lib/supplierPortalLevel';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
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

const VIEW_STORAGE_KEY = 'horeca_vendor_businesses_view';

type ViewMode = 'grid' | 'table';

interface StoreRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isVerified: boolean;
  isPrimaryStore: boolean;
  logoUrl: string | null;
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

export default function VendorBusinessesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [editBusiness, setEditBusiness] = useState<BusinessRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [profile, setProfile] = useState<VendorProfileValues>({ ...EMPTY_VENDOR_PROFILE });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editProfile, setEditProfile] = useState<VendorProfileValues>({ ...EMPTY_VENDOR_PROFILE });
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  const fetchBusinesses = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/supplier/businesses');
      const json = await res.json();
      if (json.success) setBusinesses(json.data as BusinessRow[]);
      else toast.error(json.error?.message ?? 'Failed to load businesses');
    } catch {
      toast.error('Failed to load businesses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setEnteredStore(false);
    void fetchBusinesses();
  }, [fetchBusinesses]);

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

  const resetAddBusiness = () => {
    setProfile({ ...EMPTY_VENDOR_PROFILE });
    setFieldErrors({});
    setShowAddBusiness(false);
  };

  const handleAddBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const legalName = (profile.legalName ?? profile.businessName ?? '').trim();
    const errors: Record<string, string> = {};
    if (legalName.length < 2) errors.legalName = 'Legal business name is required';
    const typeSelections = getEffectiveVendorTypeSelections(profile);
    if (typeSelections.length === 0) {
      errors.vendorTypeSelections = 'Select at least one vendor type and sub-type';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/supplier/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName,
          displayName: (profile.displayName ?? profile.tradeName ?? '').trim() || undefined,
          gstin: (profile.gstin ?? profile.gstNumber ?? '').trim() || undefined,
          vendorTypeSelections: typeSelections,
          businessSize: profile.businessSize || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to create business');
        return;
      }
      toast.success('Business created — add an Online Store when ready');
      const newId = json.data?.businessAccountId as string | undefined;
      resetAddBusiness();
      if (newId) {
        router.push(`/vendor/businesses/${newId}`);
        return;
      }
      setLoading(true);
      await fetchBusinesses();
    } catch {
      toast.error('Failed to create business');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBusiness || submitting) return;

    const legalName = (editProfile.legalName ?? editProfile.businessName ?? '').trim();
    const errors: Record<string, string> = {};
    if (legalName.length < 2) errors.legalName = 'Legal business name is required';
    const typeSelections = getEffectiveVendorTypeSelections(editProfile);
    if (typeSelections.length === 0) {
      errors.vendorTypeSelections = 'Select at least one vendor type and sub-type';
    }
    setEditFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/supplier/businesses/${editBusiness.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName,
          displayName: (editProfile.displayName ?? editProfile.tradeName ?? '').trim() || legalName,
          gstin: (editProfile.gstin ?? editProfile.gstNumber ?? '').trim() || undefined,
          vendorTypeSelections: typeSelections,
          businessSize: editProfile.businessSize || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to update business');
        return;
      }
      toast.success('Business updated');
      setEditBusiness(null);
      await fetchBusinesses();
    } catch {
      toast.error('Failed to update business');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (ba: BusinessRow) => {
    const selections = normalizeVendorTypeSelections(ba.vendorTypeSelections);
    setEditBusiness(ba);
    setEditFieldErrors({});
    setEditProfile({
      ...EMPTY_VENDOR_PROFILE,
      legalName: ba.legalName,
      businessName: ba.legalName,
      displayName: ba.displayName ?? '',
      tradeName: ba.displayName ?? '',
      gstin: ba.gstin ?? '',
      gstNumber: ba.gstin ?? '',
      vendorTypeSelections: selections,
      businessSize: ba.businessSize ?? '',
    });
  };

  const handleDeleteBusiness = async (ba: BusinessRow) => {
    const ok = await confirm({
      title: 'Delete Business?',
      message: `Delete “${ba.displayName ?? ba.legalName}” and all its Online Stores? This cannot be undone. Businesses with order history cannot be deleted.`,
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/supplier/businesses/${ba.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to delete business');
        return;
      }
      toast.success('Business deleted');
      setLoading(true);
      await fetchBusinesses();
    } catch {
      toast.error('Failed to delete business');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#299E60]" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold text-[#181725] leading-tight">Businesses</h1>
          <p className="text-[12px] text-[#7C7C7C] mt-0.5">
            Open a business to manage Online Stores. Stores need admin approval before going live.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {businesses.length > 0 && (
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
            onClick={() => setShowAddBusiness(true)}
            className="inline-flex items-center gap-1.5 h-[36px] px-3.5 bg-[#299E60] hover:bg-[#238a54] text-white text-[13px] font-bold rounded-[8px] transition-colors"
          >
            <Plus size={15} />
            Add Business
          </button>
        </div>
      </div>

      {businesses.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[12px] px-6 py-10 text-center">
          <Building2 size={24} className="text-[#299E60] mx-auto mb-2" />
          <h2 className="text-[15px] font-bold text-[#181725] mb-1">No businesses yet</h2>
          <p className="text-[13px] text-[#7C7C7C] mb-4">
            Create a business for mapping (no approval). The first online store waits for super-admin approval before customers can see it.
          </p>
          <button
            type="button"
            onClick={() => setShowAddBusiness(true)}
            className="inline-flex items-center gap-1.5 h-[36px] px-4 bg-[#299E60] hover:bg-[#238a54] text-white text-[13px] font-bold rounded-[8px]"
          >
            <Plus size={15} />
            Add Business
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="bg-white border border-[#E5E7EB] rounded-[12px] overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-[#F0F0F0]">
            <h2 className="text-[13px] font-bold text-[#181725]">Businesses</h2>
            <p className="text-[11px] text-[#7C7C7C]">Open a business to manage its Online Stores.</p>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {businesses.map((ba) => {
            const activeCount = ba.stores.filter((s) => s.isActive).length;
            return (
              <div
                key={ba.id}
                className="bg-white border border-[#EEEEEE] rounded-[10px] p-3.5 hover:border-[#299E60]/40 hover:shadow-sm transition-all cursor-pointer"
                data-testid="business-card"
                onClick={() => router.push(`/vendor/businesses/${ba.id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-[14px] text-[#181725] truncate">
                      {ba.displayName ?? ba.legalName}
                    </p>
                    {ba.isPrimary && (
                      <p className="text-[10px] font-bold uppercase text-[#AEAEAE]">Primary</p>
                    )}
                    {!ba.isPrimary && ba.displayName && ba.displayName !== ba.legalName && (
                      <p className="text-[11px] text-[#AEAEAE] truncate">{ba.legalName}</p>
                    )}
                  </div>
                  {!ba.isPrimary && (
                    <span className="shrink-0 text-[11px] font-semibold text-[#AEAEAE] capitalize">
                      {ba.status || 'Active'}
                    </span>
                  )}
                </div>
                <p className="text-[#AEAEAE] font-mono text-[12px] truncate mb-3">
                  {activeCount} / {ba.storeCount} stores
                </p>
                <div className="inline-flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/vendor/businesses/${ba.id}`}
                    className="inline-flex items-center gap-1 h-[30px] px-2.5 text-[12px] font-bold text-white bg-[#299E60] hover:bg-[#238a54] rounded-[6px]"
                    data-testid="view-business"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => openEdit(ba)}
                    className="inline-flex items-center gap-1 h-[30px] px-2 text-[12px] font-semibold text-[#7C7C7C] hover:text-[#181725] hover:bg-[#F3F4F6] rounded-[6px]"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDeleteBusiness(ba)}
                    className="inline-flex items-center gap-1 h-[30px] px-2 text-[12px] font-semibold text-[#E74C3C] hover:bg-[#FEE2E2] disabled:opacity-40 rounded-[6px]"
                    data-testid="delete-business"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#E5E7EB] rounded-[12px] overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-[#F0F0F0]">
            <h2 className="text-[13px] font-bold text-[#181725]">Businesses</h2>
            <p className="text-[11px] text-[#7C7C7C]">Open a business to manage its Online Stores.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F9FAFB] text-[#6B7280] uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Business</th>
                  <th className="px-4 py-2.5 font-bold">GST</th>
                  <th className="px-4 py-2.5 font-bold">Stores</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {businesses.map((ba) => {
                  const activeCount = ba.stores.filter((s) => s.isActive).length;
                  return (
                    <tr
                      key={ba.id}
                      className="hover:bg-[#FAFBFC] cursor-pointer"
                      data-testid="business-card"
                      onClick={() => router.push(`/vendor/businesses/${ba.id}`)}
                    >
                      <td className="px-4 py-2.5 min-w-[180px]">
                        <p className="font-semibold text-[#181725] truncate">
                          {ba.displayName ?? ba.legalName}
                        </p>
                        {ba.isPrimary && (
                          <p className="text-[10px] font-bold uppercase text-[#AEAEAE]">Primary</p>
                        )}
                        {!ba.isPrimary && ba.displayName && ba.displayName !== ba.legalName && (
                          <p className="text-[11px] text-[#AEAEAE] truncate">{ba.legalName}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[#7C7C7C] font-mono text-[12px] whitespace-nowrap">
                        {ba.gstin || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[#AEAEAE] font-mono text-[12px] whitespace-nowrap">
                        {activeCount} / {ba.storeCount}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[11px] text-[#AEAEAE] capitalize">{ba.status || '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                          <Link
                            href={`/vendor/businesses/${ba.id}`}
                            className="inline-flex items-center gap-1 h-[30px] px-2.5 text-[12px] font-bold text-white bg-[#299E60] hover:bg-[#238a54] rounded-[6px]"
                            data-testid="view-business"
                          >
                            View
                          </Link>
                          <button
                            type="button"
                            onClick={() => openEdit(ba)}
                            className="inline-flex items-center gap-1 h-[30px] px-2 text-[12px] font-semibold text-[#7C7C7C] hover:text-[#181725] hover:bg-[#F3F4F6] rounded-[6px]"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleDeleteBusiness(ba)}
                            className="inline-flex items-center gap-1 h-[30px] px-2 text-[12px] font-semibold text-[#E74C3C] hover:bg-[#FEE2E2] disabled:opacity-40 rounded-[6px]"
                            data-testid="delete-business"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddBusiness && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-[16px] w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-xl border border-[#EEEEEE]">
            <div className="px-5 py-4 border-b border-[#F0F0F0] sticky top-0 bg-white z-10">
              <h3 className="text-[16px] font-bold text-[#181725]">Add Business</h3>
              <p className="text-[12px] text-[#7C7C7C] mt-0.5">
                Mapping only — no admin approval. Add Online Stores from the business page when you are ready.
              </p>
            </div>
            <form onSubmit={handleAddBusiness} className="px-5 py-4 space-y-4">
              <VendorProfileForm
                value={profile}
                onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
                errors={fieldErrors}
                onFieldBlur={(field, value) => {
                  const msg = validateVendorFieldBlur(field, value);
                  setFieldErrors((prev) => ({ ...prev, [field]: msg }));
                }}
                visibleSections={{ identity: true, ops: true }}
                layout="wide"
              />
              <div className="flex gap-2 pt-1 sticky bottom-0 bg-white pb-1">
                <button
                  type="button"
                  onClick={resetAddBusiness}
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
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editBusiness && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-[16px] w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-xl border border-[#EEEEEE]">
            <div className="px-5 py-4 border-b border-[#F0F0F0] sticky top-0 bg-white z-10">
              <h3 className="text-[16px] font-bold text-[#181725]">Edit Business</h3>
              <p className="text-[12px] text-[#7C7C7C] mt-0.5">
                Update legal name, display name, and business profile.
              </p>
            </div>
            <form onSubmit={handleEditBusiness} className="px-5 py-4 space-y-4">
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
              />
              <div className="flex gap-2 pt-1 sticky bottom-0 bg-white pb-1">
                <button
                  type="button"
                  onClick={() => setEditBusiness(null)}
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
    </div>
  );
}
