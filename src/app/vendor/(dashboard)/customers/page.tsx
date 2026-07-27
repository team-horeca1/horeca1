'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Search, Loader2, MoreVertical, CheckCircle, XCircle,
  PauseCircle, Tag, Bell, Trash2, Plus, CalendarDays, X, DollarSign, History,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  userId: string;
  status: 'active' | 'blocked' | 'suspended';
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

const STATUS_ICONS = {
  active: <CheckCircle size={13} className="text-[#299E60]" />,
  blocked: <XCircle size={13} className="text-[#E74C3C]" />,
  suspended: <PauseCircle size={13} className="text-amber-500" />,
};

const STATUS_LABELS = { active: 'Active', blocked: 'Blocked', suspended: 'Suspended' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(isoStr: string) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d}d ago`;
  return new Date(isoStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

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
        <Bell size={13} className="text-[#299E60]" />
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
          className="flex-1 h-[36px] px-3 rounded-[8px] border border-[#EEEEEE] text-[12px] outline-none focus:border-[#299E60]/50 bg-white"
        />
        <input
          type="date"
          value={newDueDate}
          onChange={(e) => setNewDueDate(e.target.value)}
          className="h-[36px] px-2 rounded-[8px] border border-[#EEEEEE] text-[12px] outline-none focus:border-[#299E60]/50 bg-white text-[#7C7C7C]"
        />
        <button
          onClick={() => void handleAdd()}
          disabled={adding || !newTitle.trim()}
          className="h-[36px] w-[36px] flex items-center justify-center rounded-[8px] bg-[#299E60] text-white hover:bg-[#238a54] transition-colors disabled:opacity-40"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 size={16} className="animate-spin text-[#299E60]" />
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
                    ? 'bg-[#299E60] border-[#299E60]'
                    : 'border-[#AEAEAE] hover:border-[#299E60]'
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
  const [status, setStatus] = useState(customer.status);
  const [priceListId, setPriceListId] = useState(customer.priceListId ?? '');
  const [territory, setTerritory] = useState(customer.territory ?? '');
  const [salespersonId, setSalespersonId] = useState(customer.salespersonId ?? '');
  const [salespersons, setSalespersons] = useState<Array<{ id: string; name: string; code: string | null }>>([]);
  const [deliveryRoute, setDeliveryRoute] = useState(customer.deliveryRoute ?? '');
  const [paymentTerms, setPaymentTerms] = useState(customer.paymentTerms ?? '');
  const [allowedModes, setAllowedModes] = useState<string[]>(customer.allowedPaymentModes ?? ['cod', 'prepaid', 'credit', 'cheque']);
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
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/vendor/customers/${customer.id}`, {
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
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
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
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
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
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Payment Terms</label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. Net 30"
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Salesperson</label>
              <select
                value={salespersonId}
                onChange={(e) => setSalespersonId(e.target.value)}
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
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
                className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-2">Allowed payment modes at checkout</label>
            <div className="flex flex-wrap gap-2">
              {(['cod', 'prepaid', 'credit', 'cheque', 'online'] as const).map((mode) => (
                <label key={mode} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#181725] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowedModes.includes(mode)}
                    onChange={(e) => {
                      setAllowedModes((prev) => e.target.checked ? [...prev, mode] : prev.filter((m) => m !== mode));
                    }}
                    className="w-4 h-4 rounded text-[#299E60]"
                  />
                  {mode.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white resize-none"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Customer Tags</label>
            <div className="w-full min-h-[40px] px-3 py-2 rounded-[10px] border border-[#EEEEEE] bg-white flex flex-wrap gap-1.5 items-center focus-within:border-[#299E60]/50">
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
            className="px-5 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] transition-colors disabled:opacity-50"
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
        const res = await fetch(`/api/v1/vendor/price-history?customerId=${customer.id}`);
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
                    <span className="text-[#299E60]">{e.newValue ?? '—'}</span>
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
  const [customers, setCustomers] = useState<VendorCustomer[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editCustomer, setEditCustomer] = useState<VendorCustomer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<VendorCustomer | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  // Set of VendorCustomer.id (not userId) that have overdue/today tasks
  const [dueCustomerIds, setDueCustomerIds] = useState<Set<string>>(new Set());

  const fetchCustomers = useCallback(async (p = 1, q = '', s = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      if (s) params.set('status', s);
      const [custRes, plRes] = await Promise.all([
        fetch(`/api/v1/vendor/customers?${params}`),
        fetch('/api/v1/vendor/price-lists'),
      ]);
      const [custJson, plJson] = await Promise.all([custRes.json(), plRes.json()]);
      if (custJson.success) {
        const list: VendorCustomer[] = custJson.data.customers;
        setCustomers(list);
        setHasMore(custJson.data.hasMore);
        // Fetch due task indicators in background
        fetchDueCustomerIds(list.map((c) => c.id))
          .then((ids) => setDueCustomerIds(ids))
          .catch(() => { /* ignore */ });
      }
      if (plJson.success) setPriceLists(plJson.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchCustomers(1, search, statusFilter); }, [fetchCustomers, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchCustomers(1, search, statusFilter);
  };

  const handleCustomerSaved = (updated: VendorCustomer) => {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const FILTERS = [
    { label: 'All', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Suspended', value: 'suspended' },
    { label: 'Blocked', value: 'blocked' },
  ];

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[24px] font-bold text-[#181725]">Customers</h1>
          <p className="text-[12px] text-[#AEAEAE]">Manage your B2B customer accounts, pricing, and credit terms</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <form onSubmit={handleSearch} className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone…"
            className="w-[260px] h-[36px] pl-8 pr-3 rounded-[10px] border border-[#EEEEEE] bg-white text-[12px] outline-none focus:border-[#299E60]/40"
          />
        </form>

        <div className="flex bg-[#F5F5F5] rounded-[10px] p-0.5 gap-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className={cn(
                'h-[30px] px-3 rounded-[8px] text-[12px] font-semibold transition-all',
                statusFilter === f.value
                  ? 'bg-white text-[#181725] shadow-sm'
                  : 'text-[#7C7C7C] hover:text-[#181725]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-[#299E60]" size={28} />
          </div>
        ) : customers.length === 0 ? (
          <div className="py-14 text-center">
            <Users size={36} className="text-[#E5E7EB] mx-auto mb-3" />
            <p className="text-[13px] font-bold text-[#AEAEAE]">No customers found</p>
            <p className="text-[12px] text-[#AEAEAE] mt-1">Customers appear here once they place an order with you</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#F5F5F5]">
                  <th className="text-left px-5 py-3 font-semibold text-[#7C7C7C]">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Price List</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Territory</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Orders</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Total Spend</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Last Order</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5]">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div>
                          <p className="font-semibold text-[#181725] truncate max-w-[160px]">
                            {c.user.businessName ?? c.user.fullName}
                          </p>
                          <p className="text-[#AEAEAE] truncate">{c.user.email ?? c.user.phone ?? '—'}</p>
                          {c.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {dueCustomerIds.has(c.id) && (
                          <Bell
                            size={12}
                            className="text-amber-500 flex-shrink-0"
                            aria-label="Has tasks due today or overdue"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {STATUS_ICONS[c.status]}
                        <span className="text-[#181725]">{STATUS_LABELS[c.status]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {c.priceList ? (
                        <span className="flex items-center gap-1 text-[#299E60]">
                          <Tag size={11} />
                          {c.priceList.name}
                        </span>
                      ) : (
                        <span className="text-[#AEAEAE]">Default</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[#7C7C7C]">{c.territory ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-[#181725]">{c.orderCount}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-[#181725]">
                      ₹{c.totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3.5 text-right text-[#AEAEAE]">
                      {c.lastOrderAt ? relativeTime(c.lastOrderAt) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setHistoryCustomer(c)}
                          className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors text-[#7C7C7C]"
                          title="Price history"
                          aria-label="View price history"
                        >
                          <History size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditCustomer(c)}
                          className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors text-[#7C7C7C]"
                          aria-label="Edit customer"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
