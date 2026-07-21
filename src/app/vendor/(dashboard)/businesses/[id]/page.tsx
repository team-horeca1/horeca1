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
} from 'lucide-react';
import { toast } from 'sonner';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { setEnteredStore } from '@/lib/supplierPortalLevel';
import { cn } from '@/lib/utils';
import {
  StoreSetupWizard,
  type StoreSetupPayload,
} from '@/components/features/vendor/StoreSetupWizard';

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
}

interface BusinessRow {
  id: string;
  legalName: string;
  displayName: string | null;
  gstin: string | null;
  status: string;
  isPrimary: boolean;
  stores: StoreRow[];
  storeCount: number;
}

export default function BusinessDetailPage() {
  const params = useParams();
  const businessId = typeof params?.id === 'string' ? params.id : '';
  const { switchOnlineStore, activeVendorId } = useBusinessAccountSwitcher();

  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [editStore, setEditStore] = useState<StoreRow | null>(null);
  const [editStoreName, setEditStoreName] = useState('');
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
      toast.error('This store is not active yet');
      return;
    }
    setEnteringId(store.id);
    try {
      setEnteredStore(true);
      if (store.id !== activeVendorId) {
        await switchOnlineStore(store.id);
      }
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

  const handleEditStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStore || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/supplier/stores/${editStore.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: editStoreName.trim(),
          storeDisplayName: editStoreName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to update store');
        return;
      }
      toast.success('Online store updated');
      setEditStore(null);
      await fetchBusiness();
    } catch {
      toast.error('Failed to update store');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (store: StoreRow) => {
    setEditStore(store);
    setEditStoreName(store.name);
  };

  const renderStoreActions = (store: StoreRow) => (
    <div className="inline-flex items-center gap-1 flex-wrap">
      <button
        type="button"
        disabled={!store.isActive || enteringId === store.id}
        onClick={() => void handleEnterStore(store)}
        className="inline-flex items-center gap-1 h-[30px] px-2.5 text-[12px] font-bold text-white bg-[#299E60] hover:bg-[#238a54] disabled:opacity-50 rounded-[6px]"
        data-testid="enter-store"
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
        onClick={() => openEdit(store)}
        className="inline-flex items-center gap-1 h-[30px] px-2 text-[12px] font-semibold text-[#7C7C7C] hover:text-[#181725] hover:bg-[#F3F4F6] rounded-[6px]"
      >
        <Pencil size={12} />
        Edit
      </button>
    </div>
  );

  const renderStoreStatus = (store: StoreRow) => {
    const isSession = store.id === activeVendorId;
    return (
      <>
        {isSession && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#EEF8F1] text-[#299E60] mr-1">
            Session
          </span>
        )}
        {!store.isActive ? (
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F5F5F5] text-[#AEAEAE]">
            Disabled
          </span>
        ) : !isSession ? (
          <span className="text-[11px] font-semibold text-[#299E60]">Active</span>
        ) : null}
      </>
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
              business.displayName && business.displayName !== business.legalName
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
                  !store.isActive && 'opacity-70',
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
                  <div className="shrink-0 whitespace-nowrap">{renderStoreStatus(store)}</div>
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
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {business.stores.map((store) => (
                  <tr
                    key={store.id}
                    className={cn('hover:bg-[#FAFBFC]', !store.isActive && 'opacity-70')}
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
                    <td className="px-4 py-2.5 whitespace-nowrap">{renderStoreStatus(store)}</td>
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

      {editStore && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-[16px] w-full max-w-[400px] shadow-xl border border-[#EEEEEE]">
            <div className="px-5 py-4 border-b border-[#F0F0F0]">
              <h3 className="text-[16px] font-bold text-[#181725]">Edit Online Store</h3>
            </div>
            <form onSubmit={handleEditStore} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-[#181725] mb-1">Store name</label>
                <input
                  required
                  minLength={2}
                  value={editStoreName}
                  onChange={(e) => setEditStoreName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EEEEEE] rounded-[8px] text-[13px] outline-none focus:border-[#299E60]"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditStore(null)}
                  className="flex-1 h-[36px] border border-[#EEEEEE] rounded-[8px] text-[13px] font-semibold text-[#7C7C7C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-[36px] bg-[#299E60] text-white rounded-[8px] text-[13px] font-bold disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
