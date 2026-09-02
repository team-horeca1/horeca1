'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, Loader2, Pencil, Trash2, Tag, X, Search, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomerGroup {
  id: string;
  name: string;
  _count: { members: number; assignments: number };
}

interface GroupMember {
  id: string;
  userId: string | null;
  businessAccountId: string | null;
}

interface TargetCustomer {
  userId: string;
  label: string;
}

// ─── Member Picker ────────────────────────────────────────────────────────────

interface MemberPickerProps {
  customers: TargetCustomer[];
  loadingCustomers: boolean;
  selected: string[];
  onChange: (userIds: string[]) => void;
}

function MemberPicker({ customers, loadingCustomers, selected, onChange }: MemberPickerProps) {
  const [query, setQuery] = useState('');

  const byId = useMemo(() => {
    const m = new Map<string, TargetCustomer>();
    for (const c of customers) m.set(c.userId, c);
    return m;
  }, [customers]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => !selected.includes(c.userId))
      .filter((c) => (q ? c.label.toLowerCase().includes(q) : true))
      .slice(0, 50);
  }, [customers, selected, query]);

  const add = (userId: string) => {
    if (!selected.includes(userId)) onChange([...selected, userId]);
  };
  const remove = (userId: string) => onChange(selected.filter((id) => id !== userId));

  return (
    <div>
      <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">
        Members <span className="text-[#AEAEAE] font-normal">— search and add the customers in this group</span>
      </label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((userId) => {
            const cust = byId.get(userId);
            return (
              <span
                key={userId}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-primary-light text-primary text-[12px] font-semibold"
              >
                {cust?.label ?? userId}
                <button
                  type="button"
                  onClick={() => remove(userId)}
                  className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-primary/15 transition-colors"
                  title="Remove"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers by name…"
          className="w-full h-[40px] pl-9 pr-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
        />
      </div>

      {/* Results */}
      <div className="mt-2 max-h-[200px] overflow-y-auto rounded-[10px] border border-[#F0F0F0]">
        {loadingCustomers ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="animate-spin text-primary" size={18} />
          </div>
        ) : results.length === 0 ? (
          <p className="text-[12px] text-[#AEAEAE] text-center py-6">
            {customers.length === 0
              ? 'No customers available to add yet.'
              : query.trim()
                ? 'No customers match your search.'
                : 'All matching customers are already added.'}
          </p>
        ) : (
          results.map((c) => (
            <button
              key={c.userId}
              type="button"
              onClick={() => add(c.userId)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#F8FAFC] transition-colors border-b border-[#F5F5F5] last:border-b-0"
            >
              <span className="text-[13px] text-[#181725] truncate">{c.label}</span>
              <Plus size={13} className="text-primary shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Create / Edit Modal ────────────────────────────────────────────────────

interface GroupModalProps {
  group: CustomerGroup | null; // null = create
  customers: TargetCustomer[];
  loadingCustomers: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function GroupModal({ group, customers, loadingCustomers, onClose, onSaved }: GroupModalProps) {
  const isEdit = !!group;
  const [name, setName] = useState(group?.name ?? '');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // When editing, fetch the group's current members so the picker is pre-filled.
  useEffect(() => {
    if (!group) return;
    let cancelled = false;
    (async () => {
      setLoadingMembers(true);
      try {
        const res = await fetch(`/api/v1/vendor/customer-groups/${group.id}`);
        const json = await res.json();
        if (!cancelled && json.success) {
          const members: GroupMember[] = json.data.members ?? [];
          setMemberIds(members.map((m) => m.userId).filter((id): id is string => !!id));
        }
      } catch {
        if (!cancelled) toast.error('Could not load this group’s members');
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [group]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    const body = {
      name: name.trim(),
      members: memberIds.map((userId) => ({ userId })),
    };
    try {
      const res = await fetch(
        isEdit ? `/api/v1/vendor/customer-groups/${group!.id}` : '/api/v1/vendor/customer-groups',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (json.success) {
        toast.success(isEdit ? 'Group updated' : 'Group created');
        onSaved();
        onClose();
      } else {
        setError(json.error ?? 'Failed to save');
      }
    } catch {
      setError('Something went wrong — check your connection and retry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[440px] shadow-2xl">
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-[#181725]">{isEdit ? 'Edit Group' : 'New Group'}</h2>
          <button onClick={onClose} className="p-1 rounded-[6px] hover:bg-[#F5F5F5]">
            <X size={16} className="text-[#AEAEAE]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Premium Cafes, North Zone Hotels"
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-primary/50 bg-white"
              autoFocus
            />
          </div>

          {loadingMembers ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="animate-spin text-primary" size={20} />
            </div>
          ) : (
            <MemberPicker
              customers={customers}
              loadingCustomers={loadingCustomers}
              selected={memberIds}
              onChange={setMemberIds}
            />
          )}

          {error && <p className="text-[12px] text-[#E74C3C]">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[#EEEEEE] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 h-[38px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingMembers}
            className="px-5 h-[38px] rounded-[10px] bg-primary text-white text-[13px] font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {isEdit ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VendorCustomerGroupsPage() {
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<TargetCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerGroup | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/customer-groups');
      const json = await res.json();
      if (json.success) setGroups(json.data);
      else toast.error(json.error ?? 'Failed to load groups');
    } catch {
      toast.error('Could not load customer groups — check your connection and retry');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const res = await fetch('/api/v1/vendor/pricing-targets');
      const json = await res.json();
      if (json.success) setCustomers(json.data.customers ?? []);
    } catch {
      // Picker shows its own empty state; no blocking toast needed.
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); fetchCustomers(); }, [fetchGroups, fetchCustomers]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (g: CustomerGroup) => { setEditing(g); setModalOpen(true); };

  const handleDelete = async (g: CustomerGroup) => {
    const msg =
      `Delete the group “${g.name}”?\n\n` +
      `Its members will be removed and any price lists assigned to this group ` +
      `(${g._count.assignments}) will lose that assignment. This cannot be undone.`;
    if (!window.confirm(msg)) return;
    setDeleting(g.id);
    try {
      const res = await fetch(`/api/v1/vendor/customer-groups/${g.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setGroups((prev) => prev.filter((x) => x.id !== g.id));
        toast.success('Group deleted');
      } else {
        toast.error(json.error ?? 'Failed to delete group');
      }
    } catch {
      toast.error('Could not delete the group — check your connection and retry');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-[#181725]">Customer Groups</h1>
          <p className="text-[12px] text-[#AEAEAE]">Group customers together, then give a whole group its own price list.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 h-[38px] rounded-[10px] bg-primary text-white text-[13px] font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus size={15} />
          New group
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] py-16 text-center shadow-sm">
          <Users size={36} className="text-[#E5E7EB] mx-auto mb-3" />
          <p className="text-[14px] font-bold text-[#AEAEAE]">No customer groups yet</p>
          <p className="text-[12px] text-[#AEAEAE] mt-1">
            Bundle customers into a group, then assign a price list to the whole group at once. Create one to get started.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 flex items-center gap-2 mx-auto px-4 h-[36px] rounded-[10px] bg-primary text-white text-[12px] font-bold hover:bg-primary-dark transition-colors"
          >
            <Plus size={13} />
            Create first group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((g) => (
            <div key={g.id} className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 flex flex-col gap-3.5">
              {/* Title + actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="shrink-0 w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center">
                    <Users size={16} className="text-primary" />
                  </span>
                  <p className="text-[15px] font-bold text-[#181725] truncate">{g.name}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(g)}
                    className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#F5F5F5] transition-colors text-[#7C7C7C]"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(g)}
                    disabled={deleting === g.id}
                    className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#FFF0F0] transition-colors text-[#E74C3C] disabled:opacity-40"
                    title="Delete"
                  >
                    {deleting === g.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-[13px] text-[#7C7C7C]">
                <span className="flex items-center gap-1.5">
                  <Users size={13} className="text-[#AEAEAE]" />
                  {g._count.members} customer{g._count.members !== 1 ? 's' : ''}
                </span>
                <span className="text-[#E5E7EB]">·</span>
                <span className="flex items-center gap-1.5">
                  <Tag size={13} className="text-[#AEAEAE]" />
                  {g._count.assignments} price list{g._count.assignments !== 1 ? 's' : ''}
                </span>
              </div>

              {g._count.members === 0 && (
                <p className="text-[12px] font-semibold text-[#D97706] flex items-center gap-1.5">
                  <AlertCircle size={12} /> No customers in this group yet
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <GroupModal
          group={editing}
          customers={customers}
          loadingCustomers={loadingCustomers}
          onClose={() => setModalOpen(false)}
          onSaved={fetchGroups}
        />
      )}
    </div>
  );
}
