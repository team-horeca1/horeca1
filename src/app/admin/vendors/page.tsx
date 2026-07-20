'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Loader2,
  Plus,
  Users,
  Boxes,
  ShoppingBag,
  ShieldCheck,
  Building2,
  ChevronDown,
  ChevronRight,
  Store,
  LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminImpersonate } from '@/hooks/useAdminImpersonate';
import {
  AdminStatusBadge,
  AdminRegistryPageHeader,
  AdminRegistryStatsGrid,
  AdminRegistryFilterBar,
  registryFilterPillClass,
  AdminRegistryLoadingState,
  AdminRegistryEmptyState,
} from '@/components/features/admin/entity';

const AddVendorWizard = dynamic(
  () => import('@/components/features/admin/AddVendorWizard').then((mod) => mod.AddVendorWizard),
  {
    loading: () => (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center">
        <div className="bg-white rounded-[24px] p-10 flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-[#299E60]" size={36} />
          <span className="text-[13px] font-bold text-[#6B7280]">Loading wizard...</span>
        </div>
      </div>
    ),
    ssr: false,
  },
);

interface SupplierStore {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  rating: number;
  isVerified: boolean;
  isActive: boolean;
  isPrimaryStore: boolean;
  createdAt: string;
  productCount: number;
  orderCount: number;
}

interface SupplierBusiness {
  id: string;
  legalName: string;
  displayName: string | null;
  status: string;
  stores: SupplierStore[];
}

interface SupplierRow {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  hcid: string | null;
  storeCount: number;
  businessCount: number;
  verifiedCount: number;
  businesses: SupplierBusiness[];
}

export default function SuppliersPage() {
  const router = useRouter();
  const { has: can } = usePermissions();
  const canWriteSettings = can('settings.edit');
  const canEditVendors = can('vendors.edit');
  const { start: startVendorView, loading: impersonateLoading } = useAdminImpersonate('vendor');

  const [searchQuery, setSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<'all' | 'pending' | 'verified'>('all');
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetch('/api/v1/admin/vendors?view=suppliers&limit=100')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setSuppliers(json.data.suppliers ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return suppliers
      .map((s) => {
        const businesses = s.businesses
          .map((b) => ({
            ...b,
            stores: b.stores.filter((st) => {
              if (vendorFilter === 'pending' && st.isVerified) return false;
              if (vendorFilter === 'verified' && !st.isVerified) return false;
              return true;
            }),
          }))
          .filter((b) => b.stores.length > 0);

        const matchesSearch =
          !q
          || (s.fullName || '').toLowerCase().includes(q)
          || (s.email || '').toLowerCase().includes(q)
          || (s.hcid || '').toLowerCase().includes(q)
          || businesses.some(
            (b) =>
              (b.legalName || '').toLowerCase().includes(q)
              || (b.displayName || '').toLowerCase().includes(q)
              || b.stores.some((st) => (st.name || '').toLowerCase().includes(q)),
          );

        if (!matchesSearch || businesses.length === 0) return null;
        return { ...s, businesses };
      })
      .filter(Boolean) as SupplierRow[];
  }, [suppliers, searchQuery, vendorFilter]);

  const stats = useMemo(() => {
    const allStores = suppliers.flatMap((s) => s.businesses.flatMap((b) => b.stores));
    return {
      totalSuppliers: suppliers.length,
      pendingVerification: allStores.filter((s) => !s.isVerified).length,
      totalProducts: allStores.reduce((sum, s) => sum + s.productCount, 0),
      totalOrders: allStores.reduce((sum, s) => sum + s.orderCount, 0),
    };
  }, [suppliers]);

  if (loading) {
    return <AdminRegistryLoadingState message="Loading suppliers registry..." />;
  }

  const registryStats = [
    { label: 'Total Suppliers', value: stats.totalSuppliers, icon: Users, iconBg: 'bg-[#EEF8F1]', iconColor: 'text-[#299E60]' },
    { label: 'Pending Approval', value: stats.pendingVerification, icon: ShieldCheck, iconBg: 'bg-[#FFF8EB]', iconColor: 'text-[#D97706]' },
    { label: 'Total Products', value: stats.totalProducts, icon: Boxes, iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#3B82F6]' },
    { label: 'Orders Placed', value: stats.totalOrders, icon: ShoppingBag, iconBg: 'bg-[#FDF2F2]', iconColor: 'text-[#EF4444]' },
  ];

  return (
    <div className="space-y-8 pb-10 px-4 md:px-0">
      <AdminRegistryPageHeader
        title="Suppliers"
        subtitle="Supplier → Business → Online Store. Impersonate a Supplier to open their portal, then drill into a store."
        actions={
          canWriteSettings ? (
            <button
              onClick={() => setShowCreate(true)}
              className="h-[44px] px-5 bg-[#299E60] text-white rounded-[12px] text-[13px] font-bold hover:bg-[#238a54] active:scale-95 transition-all shadow-md shadow-[#299E60]/10 flex items-center gap-2 shrink-0"
            >
              <Plus size={16} />
              Add Supplier
            </button>
          ) : undefined
        }
      />

      <AdminRegistryStatsGrid stats={registryStats} />

      <AdminRegistryFilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by supplier, business, store, email, HCID..."
        leftSlot={
          <>
            {(
              [
                { id: 'all' as const, label: 'All' },
                { id: 'pending' as const, label: 'Pending' },
                { id: 'verified' as const, label: 'Verified' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setVendorFilter(f.id)}
                className={registryFilterPillClass(vendorFilter === f.id)}
              >
                {f.label}
              </button>
            ))}
          </>
        }
      />

      {filtered.length === 0 ? (
        <AdminRegistryEmptyState
          icon={Building2}
          title={searchQuery || vendorFilter !== 'all' ? 'No matched results' : 'No suppliers registered yet'}
          subtitle={
            searchQuery || vendorFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Click "Add Supplier" to register the first seller partner.'
          }
        />
      ) : (
        <div className="bg-white border border-[#E5E7EB] rounded-[16px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F9FAFB] text-[#6B7280] uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Supplier</th>
                  <th className="px-4 py-3.5 font-bold">Businesses</th>
                  <th className="px-4 py-3.5 font-bold">Stores</th>
                  <th className="px-4 py-3.5 font-bold">Verified</th>
                  <th className="px-4 py-3.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {filtered.map((s) => {
                  const open = expanded[s.userId] ?? true;
                  return (
                    <React.Fragment key={s.userId}>
                      <tr className="hover:bg-[#FAFBFC]">
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => setExpanded((prev) => ({ ...prev, [s.userId]: !open }))}
                            className="flex items-start gap-2 text-left w-full"
                          >
                            {open ? (
                              <ChevronDown size={16} className="text-[#9CA3AF] mt-0.5 shrink-0" />
                            ) : (
                              <ChevronRight size={16} className="text-[#9CA3AF] mt-0.5 shrink-0" />
                            )}
                            <span>
                              <span className="block font-bold text-[#111827]">
                                {s.fullName || s.email || 'Supplier'}
                              </span>
                              <span className="block text-[12px] text-[#6B7280]">{s.email}</span>
                              {s.hcid && (
                                <span className="block text-[11px] text-[#9CA3AF] font-mono mt-0.5">
                                  {s.hcid}
                                </span>
                              )}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-4 font-semibold text-[#111827]">{s.businessCount}</td>
                        <td className="px-4 py-4 font-semibold text-[#111827]">{s.storeCount}</td>
                        <td className="px-4 py-4 text-[#6B7280]">
                          {s.verifiedCount}/{s.storeCount}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {canEditVendors && (
                              <button
                                type="button"
                                disabled={impersonateLoading || s.storeCount < 1}
                                onClick={() => void startVendorView(s.userId)}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold rounded-[8px]',
                                  'bg-[#EEF8F1] text-[#299E60] hover:bg-[#DCFCE7] disabled:opacity-50',
                                )}
                                data-testid="impersonate-supplier"
                              >
                                <LayoutDashboard size={13} />
                                Impersonate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open
                        && s.businesses.map((b) => (
                          <React.Fragment key={b.id}>
                            <tr className="bg-[#F8FAF9]">
                              <td colSpan={5} className="px-5 py-2.5">
                                <div className="flex items-center gap-2 ml-6 text-[12px] font-bold text-[#299E60]">
                                  <Building2 size={14} />
                                  {b.displayName ?? b.legalName}
                                  {b.displayName && b.displayName !== b.legalName && (
                                    <span className="font-normal text-[#9CA3AF]">· {b.legalName}</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {b.stores.map((st) => (
                              <tr key={st.id} className="hover:bg-[#FAFBFC]">
                                <td className="px-5 py-3 pl-14" colSpan={2}>
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center shrink-0">
                                      <Store size={14} className="text-[#299E60]" />
                                    </div>
                                    <div className="min-w-0">
                                      <button
                                        type="button"
                                        onClick={() => router.push(`/admin/vendors/${st.id}`)}
                                        className="font-semibold text-[#111827] hover:text-[#299E60] truncate block text-left"
                                      >
                                        {st.name}
                                      </button>
                                      <span className="text-[11px] text-[#9CA3AF]">/{st.slug}</span>
                                    </div>
                                    <AdminStatusBadge
                                      variant={st.isVerified ? 'verified' : 'pending'}
                                      label={st.isVerified ? 'Verified' : 'Pending'}
                                      className="shrink-0 normal-case"
                                    />
                                    {!st.isActive && (
                                      <span className="text-[10px] font-bold uppercase text-[#AEAEAE] bg-[#F3F4F6] px-1.5 py-0.5 rounded">
                                        Disabled
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-[#6B7280]">{st.productCount} products</td>
                                <td className="px-4 py-3 text-[#6B7280]">{st.orderCount} orders</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => router.push(`/admin/vendors/${st.id}`)}
                                      className="px-2.5 py-1.5 text-[12px] font-semibold text-[#6B7280] hover:text-[#111827] rounded-[8px] hover:bg-[#F3F4F6]"
                                    >
                                      Details
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <AddVendorWizard
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setLoading(true);
            fetch('/api/v1/admin/vendors?view=suppliers&limit=100')
              .then((res) => res.json())
              .then((json) => {
                if (json.success) setSuppliers(json.data.suppliers ?? []);
              })
              .finally(() => setLoading(false));
            toast.success('Supplier created');
          }}
        />
      )}

    </div>
  );
}
