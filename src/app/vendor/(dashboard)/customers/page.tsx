'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users, Loader2, CheckCircle, Tag, Bell, Trash2, Plus, CalendarDays, X, History,
  Mail, Phone, Building2, Banknote, FileText, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DEFAULT_VENDOR_CUSTOMER_PAYMENT_MODES } from '@/lib/vendorPaymentModes';
import {
  AdminStatusBadge,
  AdminRegistryPageHeader,
  AdminRegistryStatsGrid,
  AdminRegistryFilterBar,
  registryFilterPillClass,
  AdminRegistryLoadingState,
  AdminRegistryEmptyState,
  AdminRegistryTableShell,
  AdminRegistryTableHead,
  AdminRegistryTableBody,
  AdminRegistryRowActions,
  AdminRegistryOverflowMenu,
  AdminRegistryOverflowMenuItem,
  AdminRegistryViewToggle,
  useAdminDesktop,
} from '@/components/features/admin/entity';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceList {
  id: string;
  name: string;
  discountPercent: number;
}

interface VendorCustomerUser {
  id: string;
  fullName: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
}

interface VendorCustomer {
  id: string;
  mappingId: string | null;
  userId: string;
  status: 'active' | 'blocked' | 'suspended' | null;
  priceListId: string | null;
  territory: string | null;
  salesExecutive: string | null;
  salespersonId: string | null;
  salesperson?: { id: string; name: string; code: string | null } | null;
  deliveryRoute: string | null;
  tags: string[];
  notes: string | null;
  paymentTerms: string | null;
  allowedPaymentModes?: string[];
  createdAt: string;
  user: VendorCustomerUser;
  priceList: PriceList | null;
  orderCount: number;
  totalSpend: number;
  lastOrderAt: string | null;
}

interface CustomerTask {
  id: string;
  customerId: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  isDone: boolean;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

function mappingStatusBadge(status: VendorCustomer['status']) {
  if (!status) return <AdminStatusBadge variant="pending" label="Not mapped" />;
  if (status === 'active') return <AdminStatusBadge variant="active" />;
  if (status === 'suspended') return <AdminStatusBadge variant="pending" label="Suspended" />;
  return <AdminStatusBadge variant="inactive" label="Blocked" />;
}

function OfflinePayChips({ modes }: { modes?: string[] }) {
  const bank = modes?.includes('bank_transfer');
  const po = modes?.includes('po_number');
  if (!bank && !po) return <span className="text-[#9CA3AF]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {bank && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#F8E8EC] text-[#6B1D2E]">Bank</span>
      )}
      {po && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#F8E8EC] text-[#6B1D2E]">PO</span>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return 'overdue' | 'today' | 'upcoming' | null */
function dueDateState(dueDate: string | null): 'overdue' | 'today' | 'upcoming' | null {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(dueDate);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  if (due < todayStart) return 'overdue';
  if (due < todayEnd) return 'today';
  return 'upcoming';
}

function formatDue(dueDate: string): string {
  return new Date(dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Tasks Section ────────────────────────────────────────────────────────────

interface TasksSectionProps {
  customerId: string;
}

function TasksSection({ customerId }: TasksSectionProps) {
  const [tasks, setTasks] = useState<CustomerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [adding, setAdding] = useState(false);

  // Load tasks for this customer
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/vendor/customer-tasks?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) setTasks(json.data as CustomerTask[]);
      })
      .catch(() => { /* silently ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId]);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/v1/vendor/customer-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          title: newTitle.trim(),
          dueDate: newDueDate ? new Date(newDueDate).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setTasks((prev) => [json.data as CustomerTask, ...prev]);
        setNewTitle('');
        setNewDueDate('');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (task: CustomerTask) => {
    const updated = { ...task, isDone: !task.isDone };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    const res = await fetch(`/api/v1/vendor/customer-tasks?id=${encodeURIComponent(task.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: updated.isDone }),
    });
    const json = await res.json();
    if (!json.success) {
      // Revert on failure
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  };

  const handleDelete = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    const res = await fetch(`/api/v1/vendor/customer-tasks?id=${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.success) {
      // Revert: re-fetch
      fetch(`/api/v1/vendor/customer-tasks?customerId=${encodeURIComponent(customerId)}`)
        .then((r) => r.json())
        .then((j) => { if (j.success) setTasks(j.data as CustomerTask[]); })
        .catch(() => { /* ignore */ });
    }
  };

  const dueBadge = (task: CustomerTask) => {
    if (!task.dueDate) return null;
    const state = dueDateState(task.dueDate);
    const base = 'text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] flex items-center gap-0.5';
    if (state === 'overdue')
      return <span className={cn(base, 'bg-red-50 text-red-600')}><CalendarDays size={9} />{formatDue(task.dueDate)}</span>;
    if (state === 'today')
      return <span className={cn(base, 'bg-amber-50 text-amber-600')}><CalendarDays size={9} />Today</span>;
    return <span className={cn(base, 'bg-[#F5F5F5] text-[#7C7C7C]')}><CalendarDays size={9} />{formatDue(task.dueDate)}</span>;
  };

  return (
    <div className="pt-4 border-t border-[#F5F5F5]">
      <p className="text-[12px] font-bold text-[#181725] mb-3 flex items-center gap-1.5">
        <Bell size={13} className="text-primary" />
        Tasks &amp; Reminders
      </p>

      {/* Add task form */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
          placeholder="e.g. Follow up on payment, Call to check stock needs"
          className="flex-1 h-[36px] px-3 rounded-[8px] border border-[#EEEEEE] text-[12px] outline-none focus:border-primary/50 bg-white"
        />
        <input
          type="date"
          value={newDueDate}
          onChange={(e) => setNewDueDate(e.target.value)}
          className="h-[36px] px-2 rounded-[8px] border border-[#EEEEEE] text-[12px] outline-none focus:border-primary/50 bg-white text-[#7C7C7C]"
        />
        <button
          onClick={() => void handleAdd()}
          disabled={adding || !newTitle.trim()}
          className="h-[36px] w-[36px] flex items-center justify-center rounded-[8px] bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-40"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 size={16} className="animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-[11px] text-[#AEAEAE] text-center py-2">No tasks yet — add one above</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={cn(
                'flex items-start gap-2 p-2 rounded-[8px] group transition-colors',
                task.isDone ? 'bg-[#FAFAFA]' : 'bg-white border border-[#F5F5F5]'
              )}
            >
              {/* Checkbox */}
              <button
                onClick={() => void handleToggle(task)}
                className={cn(
                  'mt-0.5 flex-shrink-0 w-[16px] h-[16px] rounded-[4px] border-2 flex items-center justify-center transition-colors',
                  task.isDone
                    ? 'bg-primary border-primary'
                    : 'border-[#AEAEAE] hover:border-primary'
                )}
              >
                {task.isDone && <CheckCircle size={10} className="text-white" />}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={cn('text-[12px] leading-snug break-words', task.isDone ? 'line-through text-[#AEAEAE]' : 'text-[#181725]')}>
                  {task.title}
                </p>
                {!task.isDone && dueBadge(task) && (
                  <div className="mt-0.5">{dueBadge(task)}</div>
                )}
              </div>

              {/* Delete */}
              <button
                onClick={() => void handleDelete(task.id)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded-[4px] hover:bg-red-50 text-[#AEAEAE] hover:text-red-500 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Bell Badge Helper ────────────────────────────────────────────────────────

/**
 * Fetches tasks for all customers in one parallel call per customer, then
 * builds a Set of customerIds that have overdue or today-due tasks.
 * Called once on page load — results memoised in the parent.
 */
async function fetchDueCustomerIds(customerIds: string[]): Promise<Set<string>> {
  if (customerIds.length === 0) return new Set();
  const results = await Promise.all(
    customerIds.map((id) =>
      fetch(`/api/v1/vendor/customer-tasks?customerId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((j: { success: boolean; data?: CustomerTask[] }) => ({
          id,
          tasks: j.success ? (j.data ?? []) : [],
        }))
        .catch(() => ({ id, tasks: [] as CustomerTask[] }))
    )
  );
  const dueIds = new Set<string>();
  for (const { id, tasks } of results) {
    const hasDue = tasks.some(
      (t) => !t.isDone && t.dueDate && dueDateState(t.dueDate) !== 'upcoming'
    );
    if (hasDue) dueIds.add(id);
  }
  return dueIds;
}

// ─── Edit Customer Modal ──────────────────────────────────────────────────────

interface EditModalProps {
  customer: VendorCustomer;
  priceLists: PriceList[];
  onClose: () => void;
  onSave: (updated: VendorCustomer) => void;
}

function EditModal({ customer, priceLists, onClose, onSave }: EditModalProps) {
  const [status, setStatus] = useState(customer.status ?? 'active');
  const [priceListId, setPriceListId] = useState(customer.priceListId ?? '');
  const [territory, setTerritory] = useState(customer.territory ?? '');
  const [salespersonId, setSalespersonId] = useState(customer.salespersonId ?? '');
  const [salespersons, setSalespersons] = useState<Array<{ id: string; name: string; code: string | null }>>([]);
  const [deliveryRoute, setDeliveryRoute] = useState(customer.deliveryRoute ?? '');
  const [paymentTerms, setPaymentTerms] = useState(customer.paymentTerms ?? '');
  const [allowedModes, setAllowedModes] = useState<string[]>(
    customer.allowedPaymentModes ?? [...DEFAULT_VENDOR_CUSTOMER_PAYMENT_MODES],
  );
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [tags, setTags] = useState<string[]>(customer.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/v1/vendor/salespersons')
      .then((r) => r.json())
      .then((json) => { if (json.success) setSalespersons(json.data ?? []); })
      .catch(() => {});
  }, []);

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const value = tagInput.trim().replace(/,$/, '');
      if (value && !tags.includes(value)) {
        setTags((prev) => [...prev, value]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    if (!customer.mappingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/vendor/customers/${customer.mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          priceListId: priceListId || null,
          territory: territory || null,
          salespersonId: salespersonId || null,
          deliveryRoute: deliveryRoute || null,
          paymentTerms: paymentTerms || null,
          allowedPaymentModes: allowedModes,
          notes: notes || null,
          tags,
        }),
      });
      const json = await res.json();
      if (json.success) {
        onSave({ ...customer, ...json.data });
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[520px] shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex-shrink-0">
          <h2 className="text-[16px] font-bold text-[#181725]">Edit Customer</h2>
          <p className="text-[12px] text-[#AEAEAE]">
            {customer.user.businessName ?? customer.user.fullName}
          </p>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Price List</label>
            <select
              value={priceListId}
              onChange={(e) => setPriceListId(e.target.value)}
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
            >
              <option value="">Default pricing</option>
              {priceLists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name} ({pl.discountPercent}% off)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Territory</label>
              <input
                type="text"
                value={territory}
                onChange={(e) => setTerritory(e.target.value)}
                placeholder="e.g. North Zone"
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Payment Terms</label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. Net 30"
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Salesperson</label>
              <select
                value={salespersonId}
                onChange={(e) => setSalespersonId(e.target.value)}
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
              >
                <option value="">Unassigned</option>
                {salespersons.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}{sp.code ? ` (${sp.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Delivery Route</label>
              <input
                type="text"
                value={deliveryRoute}
                onChange={(e) => setDeliveryRoute(e.target.value)}
                placeholder="e.g. Route A"
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-2">Allowed payment modes at checkout</label>
            <div className="flex flex-wrap gap-2">
              {([
                ['cod', 'COD'],
                ['prepaid', 'Prepaid'],
                ['credit', 'DiSCCO'],
                ['online', 'Online'],
                ['cheque', 'Cheque'],
                ['bank_transfer', 'Bank Transfer'],
                ['po_number', 'PO Number'],
              ] as const).map(([mode, label]) => (
                <label key={mode} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#181725] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowedModes.includes(mode)}
                    onChange={(e) => {
                      setAllowedModes((prev) => e.target.checked ? [...prev, mode] : prev.filter((m) => m !== mode));
                    }}
                    className="w-4 h-4 rounded text-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-[#AEAEAE] mt-1.5">Bank Transfer and PO Number stay off until you tick them for this customer.</p>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white resize-none"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Customer Tags</label>
            <div className="w-full min-h-[40px] px-3 py-2 rounded-[10px] border border-[#EEEEEE] bg-white flex flex-wrap gap-1.5 items-center focus-within:border-primary/50">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-blue-900 transition-colors"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={tags.length === 0 ? 'Type and press Enter…' : ''}
                className="flex-1 min-w-[120px] text-[13px] outline-none bg-transparent placeholder:text-[#AEAEAE]"
              />
            </div>
            <p className="text-[11px] text-[#AEAEAE] mt-1">Press Enter or comma to add a tag</p>
          </div>

          {/* Tasks & Reminders section */}
          <TasksSection customerId={customer.id} />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#EEEEEE] flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 h-[38px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-5 h-[38px] rounded-[10px] bg-primary text-white text-[13px] font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Price History Modal (flow 23) ────────────────────────────────────────────

interface PriceHistoryModalProps {
  customer: VendorCustomer;
  onClose: () => void;
}

function PriceHistoryModal({ customer, onClose }: PriceHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [priceListName, setPriceListName] = useState<string | null>(null);
  const [entries, setEntries] = useState<Array<{
    id: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    source: string;
    productName: string;
    productSku: string | null;
    changedAt: string;
    actorName: string | null;
  }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/vendor/price-history?customerId=${customer.mappingId ?? customer.id}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setEntries(json.data.entries ?? []);
          setPriceListName(json.data.priceListName ?? null);
          setMessage(json.data.message ?? null);
        } else {
          setMessage(json.error ?? 'Could not load price history');
        }
      } catch {
        if (!cancelled) setMessage('Could not load price history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customer.id]);

  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[640px] shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h2 className="text-[16px] font-bold text-[#181725]">Price history</h2>
            <p className="text-[12px] text-[#AEAEAE]">
              {customer.user.businessName ?? customer.user.fullName}
              {priceListName ? ` · ${priceListName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[8px] hover:bg-[#F5F5F5] text-[#7C7C7C]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#AEAEAE]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : message && entries.length === 0 ? (
            <p className="text-[13px] text-[#7C7C7C] py-8 text-center">{message}</p>
          ) : entries.length === 0 ? (
            <p className="text-[13px] text-[#AEAEAE] py-8 text-center">No pricelist price changes recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="border-b border-[#F5F5F5] pb-2 last:border-0">
                  <div className="text-[12px] text-[#181725] font-semibold">
                    {e.productName}
                    {e.productSku ? <span className="text-[#AEAEAE] font-normal"> · {e.productSku}</span> : null}
                  </div>
                  <div className="text-[11px] text-[#7C7C7C]">
                    <span className="font-bold text-[#181725]">{e.field}</span>
                    {' · '}
                    {e.source}
                    {' · '}
                    {new Date(e.changedAt).toLocaleString()}
                    {e.actorName ? ` · ${e.actorName}` : ''}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] break-all">
                    <span className="text-[#E74C3C]">{e.oldValue ?? '—'}</span>
                    {' → '}
                    <span className="text-primary">{e.newValue ?? '—'}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VendorCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<VendorCustomer[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editCustomer, setEditCustomer] = useState<VendorCustomer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<VendorCustomer | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [dueCustomerIds, setDueCustomerIds] = useState<Set<string>>(new Set());
  const [totals, setTotals] = useState({ total: 0, mapped: 0, bankTransfer: 0, poNumber: 0 });
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const isDesktop = useAdminDesktop();
  const effectiveView = isDesktop ? viewMode : 'grid';
  const [activeMenu, setActiveMenu] = useState<{ id: string; top: number; right: number } | null>(null);

  const fetchCustomers = useCallback(async (p = 1, q = '', s = '') => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      if (s) params.set('status', s);
      const [custRes, plRes] = await Promise.all([
        fetch(`/api/v1/vendor/customers?${params}`),
        fetch('/api/v1/vendor/price-lists'),
      ]);
      const [custJson, plJson] = await Promise.all([custRes.json(), plRes.json()]);
      if (!custRes.ok || !custJson.success) {
        if (p === 1) setCustomers([]);
        toast.error(typeof custJson?.error?.message === 'string' ? custJson.error.message : 'Failed to load customers');
        return;
      }
      const list: VendorCustomer[] = custJson.data.customers;
      setCustomers((prev) => (p === 1 ? list : [...prev, ...list]));
      setHasMore(Boolean(custJson.data.hasMore));
      if (custJson.data.totals) {
        setTotals({
          total: custJson.data.totals.total ?? 0,
          mapped: custJson.data.totals.mapped ?? 0,
          bankTransfer: custJson.data.totals.bankTransfer ?? 0,
          poNumber: custJson.data.totals.poNumber ?? 0,
        });
      }
      fetchDueCustomerIds(list.map((c) => c.mappingId).filter((id): id is string => !!id))
        .then((ids) => setDueCustomerIds((prev) => (p === 1 ? ids : new Set([...prev, ...ids]))))
        .catch(() => { /* ignore */ });
      if (plJson.success) setPriceLists(plJson.data);
    } catch {
      if (p === 1) setCustomers([]);
      toast.error('Network error loading customers');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      void fetchCustomers(1, search, statusFilter);
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchCustomers, search, statusFilter]);

  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    if (activeMenu !== null) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeMenu]);

  useEffect(() => {
    if (!activeMenu) return;
    const close = () => setActiveMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [activeMenu]);

  const handleCustomerSaved = (updated: VendorCustomer) => {
    setCustomers((prev) => prev.map((c) => (c.userId === updated.userId ? { ...c, ...updated } : c)));
  };

  const openDetails = (userId: string) => router.push(`/vendor/customers/${userId}`);

  const FILTERS = [
    { label: 'All', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Blocked', value: 'blocked' },
  ];

  const stats = [
    { label: 'Customers', value: totals.total, icon: Users, iconBg: 'bg-[#F8E8EC]', iconColor: 'text-[#6B1D2E]' },
    { label: 'Mapped', value: totals.mapped, icon: Tag, iconBg: 'bg-[#EEF2FF]', iconColor: 'text-[#2563EB]' },
    { label: 'Bank Transfer', value: totals.bankTransfer, icon: Banknote, iconBg: 'bg-[#F8E8EC]', iconColor: 'text-[#6B1D2E]' },
    { label: 'PO Number', value: totals.poNumber, icon: FileText, iconBg: 'bg-[#FEF3C7]', iconColor: 'text-[#B45309]' },
  ];

  return (
    <div className="space-y-5 pb-10">
      <AdminRegistryPageHeader
        title="Customers"
        subtitle="All Horeca buyers — enable Bank Transfer or PO Number per customer on their detail page."
      />

      <AdminRegistryStatsGrid stats={stats} />

      <AdminRegistryFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email, phone..."
        searching={loading && customers.length > 0}
        leftSlot={
          FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              type="button"
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className={registryFilterPillClass(statusFilter === f.value)}
            >
              {f.label}
            </button>
          ))
        }
        trailingSlot={<AdminRegistryViewToggle viewMode={viewMode} onChange={setViewMode} />}
      />

      {loading && customers.length === 0 ? (
        <AdminRegistryLoadingState message="Loading customers..." />
      ) : customers.length === 0 ? (
        <AdminRegistryEmptyState
          icon={Users}
          title={search || statusFilter ? 'No matched results' : 'No customers found'}
          subtitle="Marketplace customers will appear here. Try a different search."
        />
      ) : effectiveView === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {customers.map((c) => {
            const name = c.user.businessName ?? c.user.fullName;
            return (
              <div
                key={c.userId}
                className="bg-white rounded-[16px] border border-[#D1D5DB] shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md hover:border-[#6B1D2E]/30 hover:-translate-y-0.5 transition-all w-full relative"
              >
                <button
                  type="button"
                  onClick={() => openDetails(c.userId)}
                  className="p-5 flex-1 flex flex-col text-left"
                >
                  <div className="bg-[#F9FAFB] rounded-[12px] h-[100px] relative flex items-center justify-center p-4 border border-[#F3F4F6] mb-4">
                    <div className="absolute top-2.5 right-2.5">{mappingStatusBadge(c.status)}</div>
                    {c.mappingId && dueCustomerIds.has(c.mappingId) && (
                      <Bell size={14} className="absolute top-2.5 left-2.5 text-amber-500" aria-label="Has tasks due" />
                    )}
                    <div className="w-[60px] h-[60px] rounded-full bg-[#6B1D2E]/10 flex items-center justify-center border border-[#6B1D2E]/20">
                      <span className="text-[22px] font-black text-[#6B1D2E]">{name.charAt(0).toUpperCase()}</span>
                    </div>
                  </div>
                  <h3 className="text-[16px] font-extrabold text-[#111827] line-clamp-1">{name}</h3>
                  <p className="text-[12px] text-[#6B7280] mt-0.5 line-clamp-1">{c.user.fullName}</p>
                  <div className="mt-2"><OfflinePayChips modes={c.allowedPaymentModes} /></div>
                  <div className="space-y-2 mt-auto pt-3 border-t border-[#F3F4F6]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail size={13} className="text-[#9CA3AF] shrink-0" />
                      <span className="text-[12px] font-semibold text-[#4B5563] truncate">{c.user.email || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-[#9CA3AF] shrink-0" />
                      <span className="text-[12px] font-semibold text-[#4B5563]">{c.user.phone || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 size={13} className="text-[#9CA3AF] shrink-0" />
                      <span className="text-[12px] font-semibold text-[#4B5563] truncate">{c.user.businessName || '—'}</span>
                    </div>
                    <p className="text-[12px] font-bold text-[#111827] tabular-nums">
                      {c.orderCount} orders · ₹{c.totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </button>
                <div className="p-4 border-t border-[#D1D5DB] bg-white flex items-center gap-2">
                  <Link
                    href={`/vendor/customers/${c.userId}`}
                    className="flex-1 min-h-12 bg-[#6B1D2E] text-white rounded-[12px] text-[13px] font-semibold hover:bg-[#5A1926] transition-all flex items-center justify-center"
                  >
                    Details
                  </Link>
                  {c.mappingId && (
                    <button
                      type="button"
                      onClick={() => setEditCustomer(c)}
                      className="min-h-12 px-3 rounded-[12px] border border-[#E5E7EB] text-[#374151] font-semibold hover:bg-[#F9FAFB]"
                      aria-label="Edit CRM"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <AdminRegistryTableShell minWidth="1100px">
          <AdminRegistryTableHead>
            <th className="px-6 py-3.5 font-bold min-w-[220px] border-r border-[#D1D5DB]">Customer</th>
            <th className="px-6 py-3.5 font-bold min-w-[180px] border-r border-[#D1D5DB]">Email</th>
            <th className="px-6 py-3.5 font-bold min-w-[120px] border-r border-[#D1D5DB]">Phone</th>
            <th className="px-6 py-3.5 font-bold text-center w-[110px] border-r border-[#D1D5DB]">Status</th>
            <th className="px-6 py-3.5 font-bold min-w-[110px] border-r border-[#D1D5DB]">Offline pay</th>
            <th className="px-6 py-3.5 font-bold text-right w-[80px] border-r border-[#D1D5DB]">Orders</th>
            <th className="px-6 py-3.5 font-bold text-right min-w-[110px] border-r border-[#D1D5DB]">Spend</th>
            <th className="px-6 py-3.5 font-bold text-left min-w-[200px]">Actions</th>
          </AdminRegistryTableHead>
          <AdminRegistryTableBody>
            {customers.map((c) => {
              const name = c.user.businessName ?? c.user.fullName;
              return (
                <tr
                  key={c.userId}
                  onClick={() => openDetails(c.userId)}
                  className="group hover:bg-[#F9FAFB]/60 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3 align-middle border-r border-[#D1D5DB]">
                    <div className="flex items-center gap-3">
                      <div className="w-[42px] h-[42px] rounded-[10px] bg-[#F3F4F6] overflow-hidden shrink-0 border border-[#E5E7EB] flex items-center justify-center">
                        <span className="text-[15px] font-black text-[#6B1D2E]">{name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-[#111827] truncate group-hover:text-[#6B1D2E] transition-colors flex items-center gap-1.5">
                          {name}
                          {c.mappingId && dueCustomerIds.has(c.mappingId) && (
                            <Bell size={12} className="text-amber-500 shrink-0" aria-label="Has tasks due" />
                          )}
                        </p>
                        <p className="text-[12px] text-[#9CA3AF] truncate">{c.user.fullName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-[13px] font-medium text-[#4B5563] truncate max-w-[200px] align-middle border-r border-[#D1D5DB]">
                    {c.user.email || '—'}
                  </td>
                  <td className="px-6 py-3 text-[11px] text-[#9CA3AF] font-semibold font-mono align-middle border-r border-[#D1D5DB]">
                    {c.user.phone || '—'}
                  </td>
                  <td className="px-6 py-3 text-center align-middle border-r border-[#D1D5DB]">
                    {mappingStatusBadge(c.status)}
                  </td>
                  <td className="px-6 py-3 align-middle border-r border-[#D1D5DB]">
                    <OfflinePayChips modes={c.allowedPaymentModes} />
                  </td>
                  <td className="px-6 py-3 text-right font-bold tabular-nums text-[#111827] align-middle border-r border-[#D1D5DB]">
                    {c.orderCount}
                  </td>
                  <td className="px-6 py-3 text-right font-bold tabular-nums text-[#111827] align-middle border-r border-[#D1D5DB]">
                    ₹{c.totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-6 py-3 text-left align-middle" onClick={(e) => e.stopPropagation()}>
                    <AdminRegistryRowActions
                      detailsHref={`/vendor/customers/${c.userId}`}
                      onDetailsClick={(e) => e.stopPropagation()}
                      showMenu={Boolean(c.mappingId)}
                      menuOpen={activeMenu?.id === c.userId}
                      onMenuToggle={c.mappingId ? (e) => {
                        e.stopPropagation();
                        if (activeMenu?.id === c.userId) {
                          setActiveMenu(null);
                          return;
                        }
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        setActiveMenu({
                          id: c.userId,
                          top: rect.bottom + 6,
                          right: window.innerWidth - rect.right,
                        });
                      } : undefined}
                    />
                  </td>
                </tr>
              );
            })}
          </AdminRegistryTableBody>
        </AdminRegistryTableShell>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              void fetchCustomers(next, search, statusFilter);
            }}
            className="min-h-12 px-5 rounded-[12px] border border-[#E5E7EB] bg-white text-[13px] font-bold text-[#374151] hover:bg-[#F9FAFB] disabled:opacity-60 flex items-center gap-2"
          >
            {loadingMore && <Loader2 size={14} className="animate-spin" />}
            Load more
          </button>
        </div>
      )}

      <AdminRegistryOverflowMenu active={activeMenu}>
        {activeMenu && (() => {
          const c = customers.find((row) => row.userId === activeMenu.id);
          if (!c?.mappingId) return null;
          return (
            <>
              <AdminRegistryOverflowMenuItem
                icon={<Pencil size={14} />}
                label="Edit CRM"
                onClick={() => { setEditCustomer(c); setActiveMenu(null); }}
              />
              <AdminRegistryOverflowMenuItem
                icon={<History size={14} />}
                label="Price history"
                onClick={() => { setHistoryCustomer(c); setActiveMenu(null); }}
              />
            </>
          );
        })()}
      </AdminRegistryOverflowMenu>

      {editCustomer && (
        <EditModal
          customer={editCustomer}
          priceLists={priceLists}
          onClose={() => setEditCustomer(null)}
          onSave={handleCustomerSaved}
        />
      )}
      {historyCustomer && (
        <PriceHistoryModal
          customer={historyCustomer}
          onClose={() => setHistoryCustomer(null)}
        />
      )}
    </div>
  );
}
