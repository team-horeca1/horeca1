'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  Banknote,
  Building2,
  Calendar,
  FileText,
  LayoutDashboard,
  ListOrdered,
  Loader2,
  Mail,
  Phone,
  Save,
  Tag,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { setAllowedOfflineModes } from '@/lib/vendorPaymentModes';
import {
  AdminEntityContactGrid,
  AdminEntityDetailHeader,
  AdminEntityHeroCard,
  AdminEntityStatsRow,
  AdminEntityTabBar,
  AdminEntityTabContent,
  AdminEntityTabPanel,
  AdminRegistryLoadingState,
  AdminStatusBadge,
} from '@/components/features/admin/entity';

interface CustomerUser {
  id: string;
  fullName: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

interface Mapping {
  id: string;
  mappingId: string;
  status: 'active' | 'blocked' | 'suspended';
  priceListId: string | null;
  territory: string | null;
  salespersonId: string | null;
  deliveryRoute: string | null;
  tags: string[];
  notes: string | null;
  paymentTerms: string | null;
  allowedPaymentModes: string[];
  priceList: { id: string; name: string; discountPercent: number } | null;
  salesperson: { id: string; name: string; code: string | null } | null;
}

interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string;
  totalAmount: number;
  customerPoNumber: string | null;
  createdAt: string;
}

interface PriceList {
  id: string;
  name: string;
  discountPercent: number;
}

interface DetailPayload {
  user: CustomerUser;
  mapping: Mapping | null;
  orders: CustomerOrder[];
  orderCount: number;
  totalSpend: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  confirmed: 'Accepted',
  processing: 'Packed',
  ready_for_dispatch: 'Ready',
  shipped: 'Dispatched',
  partially_delivered: 'Partial',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

function publicApiError(json: { error?: { message?: string } } | null, fallback: string): string {
  const raw = json?.error?.message;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  if (raw.includes('invocation') || raw.includes('TURBOPACK') || raw.includes('prisma.')) {
    return fallback;
  }
  return raw;
}

function formatDateIndian(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function mappingStatusBadge(status: Mapping['status'] | null | undefined) {
  if (!status) return <AdminStatusBadge variant="pending" label="Not mapped" />;
  if (status === 'active') return <AdminStatusBadge variant="active" />;
  if (status === 'suspended') return <AdminStatusBadge variant="pending" label="Suspended" />;
  return <AdminStatusBadge variant="inactive" label="Blocked" />;
}

export default function VendorCustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params?.userId === 'string' ? params.userId : '';
  const { can } = usePermissions();
  const canEdit = can('customers.edit');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DetailPayload | null>(null);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [salespersons, setSalespersons] = useState<Array<{ id: string; name: string; code: string | null }>>([]);
  const [savingPay, setSavingPay] = useState(false);
  const [savingCrm, setSavingCrm] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'crm' | 'orders'>('overview');

  const [bankTransfer, setBankTransfer] = useState(false);
  const [poNumber, setPoNumber] = useState(false);
  const [status, setStatus] = useState<'active' | 'blocked' | 'suspended'>('active');
  const [priceListId, setPriceListId] = useState('');
  const [territory, setTerritory] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [deliveryRoute, setDeliveryRoute] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [custRes, plRes, spRes] = await Promise.all([
        fetch(`/api/v1/vendor/customers/user/${userId}`),
        fetch('/api/v1/vendor/price-lists'),
        fetch('/api/v1/vendor/salespersons'),
      ]);
      const [custJson, plJson, spJson] = await Promise.all([custRes.json(), plRes.json(), spRes.json()]);
      if (!custRes.ok || !custJson.success) {
        throw new Error(publicApiError(custJson, 'Customer not found'));
      }
      const payload = custJson.data as DetailPayload;
      setData(payload);
      const modes = payload.mapping?.allowedPaymentModes ?? [];
      setBankTransfer(modes.includes('bank_transfer'));
      setPoNumber(modes.includes('po_number'));
      setStatus(payload.mapping?.status ?? 'active');
      setPriceListId(payload.mapping?.priceListId ?? '');
      setTerritory(payload.mapping?.territory ?? '');
      setSalespersonId(payload.mapping?.salespersonId ?? '');
      setDeliveryRoute(payload.mapping?.deliveryRoute ?? '');
      setPaymentTerms(payload.mapping?.paymentTerms ?? '');
      setNotes(payload.mapping?.notes ?? '');
      setTags(payload.mapping?.tags ?? []);
      if (plJson.success) setPriceLists(plJson.data as PriceList[]);
      if (spJson.success) setSalespersons(spJson.data ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load customer';
      setError(
        message.includes('invocation') || message.includes('TURBOPACK')
          ? 'Failed to load customer'
          : message,
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const upsertMapping = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/v1/vendor/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...body }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(publicApiError(json, 'Save failed'));
    }
    return json.data as { id: string; allowedPaymentModes?: string[] };
  };

  const savePaymentModes = async (nextBank: boolean, nextPo: boolean) => {
    if (!canEdit) return;
    setSavingPay(true);
    try {
      const allowedPaymentModes = setAllowedOfflineModes(data?.mapping?.allowedPaymentModes, {
        bankTransfer: nextBank,
        poNumber: nextPo,
      });
      await upsertMapping({ allowedPaymentModes });
      setBankTransfer(nextBank);
      setPoNumber(nextPo);
      toast.success('Payment options updated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save payment options');
    } finally {
      setSavingPay(false);
    }
  };

  const saveCrm = async () => {
    if (!canEdit) return;
    setSavingCrm(true);
    try {
      await upsertMapping({
        status,
        priceListId: priceListId || null,
        territory: territory || null,
        salespersonId: salespersonId || null,
        deliveryRoute: deliveryRoute || null,
        paymentTerms: paymentTerms || null,
        notes: notes || null,
        tags,
        allowedPaymentModes: setAllowedOfflineModes(data?.mapping?.allowedPaymentModes, {
          bankTransfer,
          poNumber,
        }),
      });
      toast.success('Customer saved');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save customer');
    } finally {
      setSavingCrm(false);
    }
  };

  const addTag = () => {
    const value = tagInput.trim().replace(/,$/, '');
    if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
    setTagInput('');
  };

  if (loading) {
    return <AdminRegistryLoadingState message="Loading customer details..." />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-[16px] font-bold text-[#4B4B4B]">{error || 'Customer not found'}</p>
        <button
          type="button"
          onClick={() => router.push('/vendor/customers')}
          className="px-4 min-h-12 bg-[#6B1D2E] text-white rounded-xl text-[14px] font-semibold hover:bg-[#5A1926] transition-colors"
        >
          Back to customers
        </button>
      </div>
    );
  }

  const displayName = data.user.businessName ?? data.user.fullName;
  const initial = (displayName || 'U').charAt(0).toUpperCase();

  const stats = [
    { label: 'Orders with you', value: data.orderCount, icon: ListOrdered, color: '#6B1D2E' },
    {
      label: 'Total spend',
      value: `₹${data.totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      icon: Banknote,
      color: '#6B1D2E',
    },
    { label: 'Member since', value: formatDateIndian(data.user.createdAt), icon: Calendar, color: '#2563EB' },
    {
      label: 'CRM status',
      value: data.mapping
        ? data.mapping.status.charAt(0).toUpperCase() + data.mapping.status.slice(1)
        : 'Not mapped',
      icon: Users,
      color: '#F59E0B',
    },
  ];

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'crm' as const, label: 'CRM', icon: Tag },
    { id: 'orders' as const, label: 'Orders', icon: ListOrdered, badge: data.orderCount > 0 ? (
      <span className="text-[10px] font-bold bg-[#F8E8EC] text-[#6B1D2E] px-1.5 py-0.5 rounded-full">{data.orderCount}</span>
    ) : undefined },
  ];

  const fieldClass = 'w-full h-[42px] px-3 rounded-[10px] border border-divider text-[13px] outline-none focus:border-primary/50 bg-ivory font-medium';

  return (
    <div className="space-y-6 pb-12">
      <AdminEntityDetailHeader
        onBack={() => router.push('/vendor/customers')}
        breadcrumbs={[
          { label: 'Customers', href: '/vendor/customers' },
          { label: displayName },
        ]}
      />

      <AdminEntityHeroCard
        avatar={
          <div className="w-[140px] h-[140px] rounded-[16px] bg-[#F9FAFB] border border-[#E5E7EB] overflow-hidden shadow-inner flex items-center justify-center">
            <span className="text-[48px] font-black text-[#6B1D2E]">{initial}</span>
          </div>
        }
        avatarFooter={mappingStatusBadge(data.mapping?.status)}
        title={displayName}
        badges={
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-1.5">
            {bankTransfer && (
              <span className="text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border bg-[#F8E8EC] text-[#6B1D2E] border-[#6B1D2E]/15">
                Bank Transfer
              </span>
            )}
            {poNumber && (
              <span className="text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border bg-[#F8E8EC] text-[#6B1D2E] border-[#6B1D2E]/15">
                PO Number
              </span>
            )}
          </div>
        }
        subtitle={
          data.user.businessName ? (
            <p className="text-[13px] text-[#6B7280] font-medium mt-2">{data.user.fullName}</p>
          ) : undefined
        }
        contact={
          <AdminEntityContactGrid
            accent="#6B1D2E"
            accentBg="#F8E8EC"
            items={[
              { icon: Mail, label: 'Email', value: data.user.email || '—' },
              { icon: Phone, label: 'Phone', value: data.user.phone || '—' },
              { icon: Building2, label: 'Business', value: data.user.businessName || '—' },
            ]}
          />
        }
      />

      <AdminEntityStatsRow stats={stats} />

      <AdminEntityTabPanel>
        <AdminEntityTabBar
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as typeof activeTab)}
          tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon, badge: tab.badge }))}
        />
        <AdminEntityTabContent>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[15px] font-bold text-[#111827] mb-1">Offline payment for this customer</h3>
                <p className="text-[13px] text-[#667085] mb-4">
                  Off until you tick them. Checkout only shows these methods for this buyer when ordering from you.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className={cn(
                    'flex items-start gap-3 rounded-[14px] border p-4 cursor-pointer transition-colors',
                    bankTransfer ? 'border-primary/30 bg-[#F8E8EC]' : 'border-divider bg-ivory',
                    (!canEdit || savingPay) && 'opacity-60 cursor-not-allowed',
                  )}>
                    <input
                      type="checkbox"
                      className="mt-1 w-4 h-4 rounded text-primary"
                      checked={bankTransfer}
                      disabled={!canEdit || savingPay}
                      onChange={(e) => void savePaymentModes(e.target.checked, poNumber)}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#181725]">
                        <Banknote size={14} /> Bank Transfer
                      </span>
                      <span className="block text-[12px] text-[#7C7C7C] mt-0.5">
                        NEFT / RTGS / IMPS — unpaid until you mark paid
                      </span>
                    </span>
                  </label>
                  <label className={cn(
                    'flex items-start gap-3 rounded-[14px] border p-4 cursor-pointer transition-colors',
                    poNumber ? 'border-primary/30 bg-[#F8E8EC]' : 'border-divider bg-ivory',
                    (!canEdit || savingPay) && 'opacity-60 cursor-not-allowed',
                  )}>
                    <input
                      type="checkbox"
                      className="mt-1 w-4 h-4 rounded text-primary"
                      checked={poNumber}
                      disabled={!canEdit || savingPay}
                      onChange={(e) => void savePaymentModes(bankTransfer, e.target.checked)}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#181725]">
                        <FileText size={14} /> PO Number
                      </span>
                      <span className="block text-[12px] text-[#7C7C7C] mt-0.5">
                        Enterprise purchase order — they enter their company PO at checkout
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-ivory p-6 rounded-[14px] border border-divider">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-[10px] bg-[#F8E8EC] flex items-center justify-center text-[#6B1D2E]">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-[#7C7C7C]">Account created</p>
                    <p className="text-[14px] font-bold text-[#181725]">{formatDateIndian(data.user.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-[10px] bg-[#F8E8EC] flex items-center justify-center text-[#6B1D2E]">
                    <Tag size={20} />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-[#7C7C7C]">Price list</p>
                    <p className="text-[14px] font-bold text-[#181725]">{data.mapping?.priceList?.name ?? 'Default'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'crm' && (
            <div className="max-w-xl space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  disabled={!canEdit}
                  className={fieldClass}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Price list</label>
                <select
                  value={priceListId}
                  onChange={(e) => setPriceListId(e.target.value)}
                  disabled={!canEdit}
                  className={fieldClass}
                >
                  <option value="">Default</option>
                  {priceLists.map((pl) => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Territory</label>
                  <input
                    value={territory}
                    onChange={(e) => setTerritory(e.target.value)}
                    disabled={!canEdit}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Payment terms</label>
                  <input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    disabled={!canEdit}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Salesperson</label>
                  <select
                    value={salespersonId}
                    onChange={(e) => setSalespersonId(e.target.value)}
                    disabled={!canEdit}
                    className={fieldClass}
                  >
                    <option value="">None</option>
                    {salespersons.map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.name}{sp.code ? ` (${sp.code})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Delivery route</label>
                  <input
                    value={deliveryRoute}
                    onChange={(e) => setDeliveryRoute(e.target.value)}
                    disabled={!canEdit}
                    className={fieldClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canEdit}
                  rows={3}
                  className="w-full px-3 py-2 rounded-[10px] border border-divider text-[13px] outline-none focus:border-primary/50 bg-ivory resize-none"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                      className="text-[11px] bg-[#F8E8EC] text-[#6B1D2E] px-2 py-0.5 rounded-full font-semibold"
                    >
                      {tag} ×
                    </button>
                  ))}
                </div>
                <input
                  value={tagInput}
                  disabled={!canEdit}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag and press Enter"
                  className={fieldClass}
                />
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void saveCrm()}
                  disabled={savingCrm}
                  className="min-h-12 px-5 rounded-[12px] bg-[#6B1D2E] text-white text-[13px] font-bold hover:bg-[#5A1926] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingCrm ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save CRM
                </button>
              )}
            </div>
          )}

          {activeTab === 'orders' && (
            data.orders.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[#AEAEAE]">No orders from this customer with your store yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-divider text-[#667085] text-[11px] uppercase">
                      <th className="text-left px-2 py-2.5 font-semibold">Order</th>
                      <th className="text-left px-2 py-2.5 font-semibold">Status</th>
                      <th className="text-left px-2 py-2.5 font-semibold">Payment</th>
                      <th className="text-right px-2 py-2.5 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {data.orders.map((o) => (
                      <tr key={o.id} className="hover:bg-ivory">
                        <td className="px-2 py-3">
                          <Link href={`/vendor/orders/${o.id}`} className="font-semibold text-primary hover:underline">
                            {o.orderNumber}
                          </Link>
                          <p className="text-[11px] text-[#AEAEAE]">{formatDateIndian(o.createdAt)}</p>
                        </td>
                        <td className="px-2 py-3 text-[#181725]">{STATUS_LABELS[o.status] ?? o.status}</td>
                        <td className="px-2 py-3">
                          <p className="text-[#181725]">
                            {o.paymentMethod === 'po_number' ? 'PO Number' : o.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : o.paymentMethod ?? '—'}
                          </p>
                          {o.customerPoNumber && (
                            <p className="text-[11px] font-mono text-[#7C7C7C]">{o.customerPoNumber}</p>
                          )}
                        </td>
                        <td className="px-2 py-3 text-right font-bold tabular-nums">₹{o.totalAmount.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </AdminEntityTabContent>
      </AdminEntityTabPanel>
    </div>
  );
}
