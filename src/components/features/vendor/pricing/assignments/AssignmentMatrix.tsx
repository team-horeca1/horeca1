'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AssignmentType, CustomerTarget, PriceListCol } from '../types';
import { CustomerPricePanel } from './CustomerPricePanel';
import { ConflictDialog, type PreviewConflict } from './ConflictDialog';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';

type PriceListAssignment = {
  type: AssignmentType;
  userId?: string | null;
  businessAccountId?: string | null;
  outletId?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  pincode?: string | null;
  area?: string | null;
  segment?: string | null;
  groupId?: string | null;
  creditStatus?: string | null;
};

type PriceListWithAssignments = PriceListCol & { assignments?: PriceListAssignment[] };

type TargetRow = {
  id: string;
  name: string;
  type: AssignmentType;
  value: string;
  displayType: string;
  hcidDisplay?: string | null;
  searchText: string;
};

/** One-line Zoho-style explanation shown under the filter pills. */
const FILTER_HELP: Record<string, string> = {
  all: 'Tick a box to give that price list to a customer or a group of customers. Use the filters to find them faster.',
  customer: 'Give a special price list to specific buyers (search by name or Customer ID).',
  group: "Bundle multiple customers (e.g. 'VIP Hotels') and assign a list to the whole group in one tick.",
  credit_status: 'Auto-price by DiSCCO credit state (Active credit vs Pending/Closed).',
  pincode: 'From your delivery service areas + customer addresses, or add any pincode.',
  area: 'City / locality / state (e.g. Navi Mumbai, Thane).',
  segment: 'Customer tags like Hotel, Cafe, Caterer, Distributor.',
};

type PricingTargets = {
  customers: CustomerTarget[];
  pincodes: string[];
  cities: string[];
  segments: string[];
  creditStatuses: string[];
};

type EffectiveRow = {
  userId: string;
  label: string;
  tags: string[];
  creditStatus: string | null;
  effective: {
    priceListId: string | null;
    priceListName: string;
    via: string;
    assignedAt: string | null;
    lists?: Array<{ priceListId: string; priceListName: string; via: string; assignedAt: string | null; itemCount: number }>;
  };
  conflict?: { productCount: number; listNames: string[] } | null;
};

interface Props {
  priceLists: PriceListCol[];
  onReloadLists?: () => void;
  onOpenExplain?: (customerId: string) => void;
  /** Switch to the Prices tab in Compare mode so the supplier can fix overlaps. */
  onReviewConflicts?: () => void;
}

function buildTarget(target: TargetRow) {
  switch (target.type) {
    case 'customer':
      return { type: 'customer' as const, userId: target.value };
    case 'pincode':
      return { type: 'pincode' as const, pincode: target.value };
    case 'area':
      return { type: 'area' as const, area: target.value };
    case 'segment':
      return { type: 'segment' as const, segment: target.value };
    case 'group':
      return { type: 'group' as const, groupId: target.value };
    case 'credit_status':
      return { type: 'credit_status' as const, creditStatus: target.value };
    default:
      return { type: target.type, segment: target.value };
  }
}

export function AssignmentMatrix({ priceLists, onReloadLists, onOpenExplain, onReviewConflicts }: Props) {
  const [lists, setLists] = useState<PriceListWithAssignments[]>([]);
  const [targets, setTargets] = useState<PricingTargets | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [effective, setEffective] = useState<EffectiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [pendingConflict, setPendingConflict] = useState<{
    list: PriceListWithAssignments;
    nextAssignments: PriceListAssignment[];
    conflicts: PreviewConflict[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listsRes, targetsRes, groupsRes, effRes] = await Promise.all([
        fetch('/api/v1/vendor/price-lists'),
        fetch('/api/v1/vendor/pricing-targets'),
        fetch('/api/v1/vendor/customer-groups'),
        fetch('/api/v1/vendor/price-lists/assignments/effective'),
      ]);
      const [listsJson, targetsJson, groupsJson, effJson] = await Promise.all([
        listsRes.json(),
        targetsRes.json(),
        groupsRes.json(),
        effRes.json(),
      ]);
      if (listsJson.success && Array.isArray(listsJson.data)) {
        setLists(
          listsJson.data.map((l: PriceListWithAssignments & { discountPercent: number }) => ({
            id: l.id,
            name: l.name,
            discountPercent: Number(l.discountPercent),
            kind: l.kind,
            priority: l.priority,
            assignments: l.assignments ?? [],
          })),
        );
      }
      if (targetsJson.success) setTargets(targetsJson.data as PricingTargets);
      if (groupsJson.success && Array.isArray(groupsJson.data)) {
        setGroups(groupsJson.data.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
      }
      if (effJson.success && Array.isArray(effJson.data)) {
        setEffective(effJson.data as EffectiveRow[]);
      }
    } catch {
      toast.error('Failed to load assignment data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const displayLists = lists.length > 0 ? lists : priceLists.map((p) => ({ ...p, assignments: [] }));

  const [customRows, setCustomRows] = useState<TargetRow[]>([]);

  const targetRows = useMemo(() => {
    if (!targets) return [] as TargetRow[];
    const rows: TargetRow[] = [];
    targets.customers.forEach((c) => {
      rows.push({
        id: `customer:${c.userId}`,
        name: c.label,
        type: 'customer',
        value: c.userId,
        displayType: 'Customer',
        hcidDisplay: c.hcidDisplay ?? null,
        searchText: [c.label, c.hcidDisplay ?? '', ...(c.pincodes ?? []), ...(c.cities ?? []), ...(c.tags ?? [])].join(' ').toLowerCase(),
      });
    });
    targets.pincodes.forEach((p) => {
      rows.push({
        id: `pincode:${p}`,
        name: `Pincode ${p}`,
        type: 'pincode',
        value: p,
        displayType: 'Pincode',
        searchText: `pincode ${p}`,
      });
    });
    targets.cities.forEach((city) => {
      rows.push({
        id: `area:${city}`,
        name: `Area ${city}`,
        type: 'area',
        value: city,
        displayType: 'Area',
        searchText: `area ${city.toLowerCase()}`,
      });
    });
    targets.segments.forEach((seg) => {
      rows.push({
        id: `segment:${seg}`,
        name: `Segment ${seg}`,
        type: 'segment',
        value: seg,
        displayType: 'Segment',
        searchText: `segment ${seg.toLowerCase()}`,
      });
    });
    targets.creditStatuses.forEach((cs) => {
      rows.push({
        id: `credit:${cs}`,
        name: `Credit ${cs}`,
        type: 'credit_status',
        value: cs,
        displayType: 'Credit status',
        searchText: `credit ${cs.toLowerCase()}`,
      });
    });
    groups.forEach((g) => {
      rows.push({
        id: `group:${g.id}`,
        name: g.name,
        type: 'group',
        value: g.id,
        displayType: 'Group',
        searchText: `group ${g.name.toLowerCase()}`,
      });
    });
    for (const r of customRows) {
      if (!rows.some((x) => x.id === r.id)) rows.push(r);
    }

    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch = !q || r.searchText.includes(q) || r.name.toLowerCase().includes(q);
      if (filterType === 'all') return matchesSearch;
      return matchesSearch && r.type === filterType;
    });
  }, [targets, groups, search, filterType, customRows]);

  const isAssigned = (target: TargetRow, list: PriceListWithAssignments) => {
    const assignments = list.assignments ?? [];
    return assignments.some((a) => {
      if (a.type !== target.type) return false;
      if (target.type === 'customer') return a.userId === target.value;
      if (target.type === 'pincode') return a.pincode === target.value;
      if (target.type === 'area') return a.area?.toLowerCase() === target.value.toLowerCase();
      if (target.type === 'segment') return a.segment?.toLowerCase() === target.value.toLowerCase();
      if (target.type === 'group') return a.groupId === target.value;
      if (target.type === 'credit_status') return a.creditStatus === target.value;
      return false;
    });
  };

  const patchAssignments = async (
    priceListId: string,
    assignments: PriceListAssignment[],
    resolutions?: Array<{ userId: string; action: 'skip' | 'replace' }>,
  ) => {
    // Strip null/undefined target fields — list.assignments echoes raw DB rows
    // (irrelevant columns are null), which the API schema rejects.
    const clean = assignments.map((a) => {
      const out: Record<string, string> = { type: a.type };
      if (a.userId) out.userId = a.userId;
      if (a.businessAccountId) out.businessAccountId = a.businessAccountId;
      if (a.outletId) out.outletId = a.outletId;
      if (a.brandId) out.brandId = a.brandId;
      if (a.brandName) out.brandName = a.brandName;
      if (a.pincode) out.pincode = a.pincode;
      if (a.area) out.area = a.area;
      if (a.segment) out.segment = a.segment;
      if (a.groupId) out.groupId = a.groupId;
      if (a.creditStatus) out.creditStatus = a.creditStatus;
      return out;
    });
    const res = await fetch(`/api/v1/vendor/price-lists/${priceListId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: clean, resolutions }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Update failed');
  };

  const toggle = async (target: TargetRow, list: PriceListWithAssignments) => {
    // Assignments are saved as a full-set replace computed from current
    // state. A second toggle while a save is in flight would compute from
    // stale state and silently overwrite the first — ignore it (checkboxes
    // are also disabled while busy).
    if (busyRef.current) return;
    busyRef.current = true;
    const key = `${target.id}:${list.id}`;
    setBusyCell(key);
    try {
      const current = list.assignments ?? [];
      const checked = isAssigned(target, list);

      if (checked) {
        const next = current.filter((a) => {
          if (a.type !== target.type) return true;
          if (target.type === 'customer') return a.userId !== target.value;
          if (target.type === 'pincode') return a.pincode !== target.value;
          if (target.type === 'area') return a.area?.toLowerCase() !== target.value.toLowerCase();
          if (target.type === 'segment') return a.segment?.toLowerCase() !== target.value.toLowerCase();
          if (target.type === 'group') return a.groupId !== target.value;
          if (target.type === 'credit_status') return a.creditStatus !== target.value;
          return true;
        });
        await patchAssignments(list.id, next);
        toast.success('Assignment removed');
        await load();
        onReloadLists?.();
        return;
      }

      // Several lists per customer are fine when they cover different
      // products. Only a SAME-product price overlap needs a decision.
      const nextAssignments = [...current, buildTarget(target) as PriceListAssignment];
      try {
        const previewRes = await fetch('/api/v1/vendor/price-lists/assignments/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceListId: list.id, target: buildTarget(target) }),
        });
        const previewJson = await previewRes.json();
        const conflicts = (previewJson?.data?.conflicts ?? []) as PreviewConflict[];
        if (previewJson.success && conflicts.length > 0) {
          setPendingConflict({ list, nextAssignments, conflicts });
          return;
        }
      } catch { /* preview failed — the save below still enforces conflicts (409) */ }

      await patchAssignments(list.id, nextAssignments);
      toast.success('Assignment saved');
      await load();
      onReloadLists?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      busyRef.current = false;
      setBusyCell(null);
    }
  };

  const resolveConflict = async (action: 'skip' | 'replace') => {
    if (!pendingConflict || busyRef.current) return;
    busyRef.current = true;
    try {
      const resolutions = [...new Set(pendingConflict.conflicts.map((c) => c.userId))].map(
        (userId) => ({ userId, action }),
      );
      await patchAssignments(pendingConflict.list.id, pendingConflict.nextAssignments, resolutions);
      toast.success(action === 'skip' ? 'Kept existing lists — new list not added for those customers' : 'Moved to the new list');
      setPendingConflict(null);
      await load();
      onReloadLists?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      busyRef.current = false;
    }
  };

  const [groupModal, setGroupModal] = useState<{
    groupId: string | null;
    name: string;
    memberIds: string[];
    memberSearch: string;
    saving: boolean;
  } | null>(null);
  const [targetModal, setTargetModal] = useState<{
    type: 'pincode' | 'area' | 'segment';
    value: string;
    priceListId: string;
  } | null>(null);
  /** Area targets should come from Google Maps picks; manual entry is only a fallback. */
  const [manualArea, setManualArea] = useState(false);

  const openEditGroup = async (row: TargetRow) => {
    setGroupModal({ groupId: row.value, name: row.name, memberIds: [], memberSearch: '', saving: true });
    try {
      const res = await fetch(`/api/v1/vendor/customer-groups/${row.value}`);
      const json = await res.json();
      const members = (json.data?.members ?? []) as Array<{ userId: string | null }>;
      setGroupModal((m) => (m ? { ...m, memberIds: members.map((x) => x.userId).filter((x): x is string => !!x), saving: false } : m));
    } catch {
      setGroupModal((m) => (m ? { ...m, saving: false } : m));
      toast.error('Could not load group members');
    }
  };

  const saveGroup = async () => {
    if (!groupModal || !groupModal.name.trim()) return;
    setGroupModal((m) => (m ? { ...m, saving: true } : m));
    try {
      const isEdit = !!groupModal.groupId;
      const res = await fetch(
        isEdit ? `/api/v1/vendor/customer-groups/${groupModal.groupId}` : '/api/v1/vendor/customer-groups',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: groupModal.name.trim(), members: groupModal.memberIds.map((userId) => ({ userId })) }),
        },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to save group');
      toast.success(isEdit ? 'Group updated' : 'Group created — now tick a price list for it');
      setGroupModal(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save group');
      setGroupModal((m) => (m ? { ...m, saving: false } : m));
    }
  };

  const deleteGroup = async () => {
    if (!groupModal?.groupId) return;
    if (!window.confirm(`Delete group "${groupModal.name}"? Price lists assigned to it will lose that assignment.`)) return;
    try {
      const res = await fetch(`/api/v1/vendor/customer-groups/${groupModal.groupId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Delete failed');
      toast.success('Group deleted');
      setGroupModal(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const saveTarget = async () => {
    if (!targetModal || !targetModal.value.trim()) return;
    const value = targetModal.value.trim();
    if (targetModal.type === 'pincode' && !/^\d{4,10}$/.test(value)) {
      toast.error('Pincode should be 4–10 digits (numbers only)');
      return;
    }
    const row: TargetRow = {
      id: `${targetModal.type}:${value}`,
      name: targetModal.type === 'pincode' ? `Pincode ${value}` : targetModal.type === 'area' ? `Area ${value}` : `Segment ${value}`,
      type: targetModal.type,
      value,
      displayType: targetModal.type === 'pincode' ? 'Pincode' : targetModal.type === 'area' ? 'Area' : 'Segment',
      searchText: `${targetModal.type} ${value.toLowerCase()}`,
    };
    setCustomRows((prev) => [...prev.filter((r) => r.id !== row.id), row]);
    const listId = targetModal.priceListId;
    setTargetModal(null);
    setFilterType(targetModal.type);
    if (listId) {
      const list = displayLists.find((l) => l.id === listId);
      if (list && !isAssigned(row, list)) {
        await toggle(row, list);
        return;
      }
    }
    toast.success(`${row.name} added — tick a price list to assign it`);
  };

  const selectedCustomer = targets?.customers.find((c) => c.userId === selectedCustomerId) ?? null;
  const selectedEffective = effective.find((e) => e.userId === selectedCustomerId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#7C7C7C] gap-2">
        <Loader2 size={20} className="animate-spin" /> Loading assignments…
      </div>
    );
  }

  const effectiveByUser = new Map(effective.map((e) => [e.userId, e]));
  const typeCounts = (type: string) => type === 'all' ? targetRows.length : targetRows.filter((r) => r.type === type).length;
  // Counts before type filtering (search still applies via targetRows base is already filtered) — use pill active state only
  const filterPills: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'customer', label: 'Customers' },
    { id: 'group', label: 'Customer groups' },
    { id: 'credit_status', label: 'Credit status' },
    { id: 'pincode', label: 'Pincodes' },
    { id: 'area', label: 'Areas' },
    { id: 'segment', label: 'Segments' },
  ];

  return (
    <div className="space-y-3">
      <div className="p-3.5 rounded-[12px] bg-[#F8E8EC]/60 border border-primary/20 text-[12px]">
        <p className="font-bold text-[#181725]">Who wins if a customer matches several rules?</p>
        <p className="text-[#181725]/80 mt-1 flex flex-wrap items-center gap-1">
          {['Specific outlet', 'Named customer', 'Customer group', 'Credit status', 'Segment / tag', 'Pincode', 'Area / city', 'Base price'].map((s, i, arr) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className="px-2 py-0.5 rounded-full bg-white border border-[#E9E3DD] font-semibold">{s}</span>
              {i < arr.length - 1 && <span className="text-primary font-bold">›</span>}
            </span>
          ))}
        </p>
        <p className="text-[#7C7C7C] mt-1.5">Top beats bottom between different kinds of rules. A customer can be on several lists when they cover different products. If two lists price the same product for a customer, we ask you — Skip, Replace, or Review manually — never silently picked by list order. Products in no list stay at Base price.</p>
      </div>
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 min-h-[480px]">
      <div className="rounded-[12px] border border-[#E9E3DD] bg-white overflow-hidden flex flex-col">
        <div className="p-3 border-b border-[#E9E3DD] space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C7C7C]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by customer name, ID (HC-…), pincode, group…"
                aria-label="Search targets"
                className="w-full h-10 pl-9 pr-3 rounded-[12px] border border-[#E9E3DD] text-[13px] outline-none focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => setGroupModal({ groupId: null, name: '', memberIds: [], memberSearch: '', saving: false })}
              className="h-10 px-3 rounded-[12px] bg-primary text-white text-[12px] font-bold flex items-center gap-1.5 shrink-0"
            >
              <Plus size={14} /> New group
            </button>
            <button
              type="button"
              onClick={() => { setManualArea(false); setTargetModal({ type: 'pincode', value: '', priceListId: '' }); }}
              className="h-10 px-3 rounded-[12px] border border-[#E9E3DD] bg-white text-[12px] font-bold flex items-center gap-1.5 shrink-0"
            >
              <Plus size={14} /> Add pincode / area / segment
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter target type">
            {filterPills.map((p) => (
              <button key={p.id} type="button" onClick={() => setFilterType(p.id)} className={cn('h-8 px-3 rounded-full text-[12px] font-semibold border', filterType === p.id ? 'bg-primary text-white border-primary' : 'bg-white border-[#E9E3DD] text-[#181725] hover:bg-[#FAF7F2]')}>
                {p.label}{filterType === p.id && typeCounts(p.id) > 0 ? ` (${typeCounts(p.id)})` : ''}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#7C7C7C]">{FILTER_HELP[filterType] ?? FILTER_HELP.all}</p>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-[12px] border-collapse min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-[#FAF7F2]">
              <tr>
                <th className="text-left p-2 border-b border-[#E9E3DD] min-w-[200px] sticky left-0 bg-[#FAF7F2] z-20">
                  Target
                </th>
                {displayLists.map((col) => (
                  <th
                    key={col.id}
                    className="p-2 border-b border-l border-[#E9E3DD] font-semibold text-[#181725] min-w-[100px]"
                  >
                    <div className="truncate max-w-[120px]" title={col.name}>{col.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targetRows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    row.type === 'customer' && row.value === selectedCustomerId && 'bg-[#F8E8EC]/40',
                  )}
                >
                  <td
                    className="p-2 border-b border-[#E9E3DD] sticky left-0 bg-white z-10 cursor-pointer"
                    onClick={() => {
                      if (row.type === 'customer') setSelectedCustomerId(row.value);
                    }}
                  >
                    <div className="font-medium text-[#181725] truncate max-w-[220px]">{row.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] px-1.5 py-px rounded-full bg-[#FAF7F2] border border-[#E9E3DD] text-[#7C7C7C] font-semibold">{row.displayType}</span>
                      {row.type === 'customer' && row.hcidDisplay && (
                        <span className="text-[10px] px-1.5 py-px rounded-full bg-white border border-[#E9E3DD] text-[#181725] font-bold tabular-nums" title="Customer ID">{row.hcidDisplay}</span>
                      )}
                      {row.type === 'group' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void openEditGroup(row); }}
                          className="text-[10px] px-1.5 py-px rounded-full bg-white border border-[#E9E3DD] text-primary font-bold flex items-center gap-0.5"
                        >
                          <Pencil size={9} /> Edit group
                        </button>
                      )}
                      {row.type === 'customer' && effectiveByUser.get(row.value) && (() => {
                        const rowEff = effectiveByUser.get(row.value)!;
                        const eff = rowEff.effective;
                        const lists = eff.lists ?? [];
                        if (lists.length > 1) {
                          return (
                            <>
                              <span className="text-[10px] px-1.5 py-px rounded-full bg-[#F8E8EC] text-primary font-bold" title={lists.map((l) => `${l.priceListName} (${l.itemCount} products, ${l.via})`).join(' · ')}>
                                Gets: {lists.map((l) => `${l.priceListName} (${l.itemCount})`).join(' + ')}
                              </span>
                              {rowEff.conflict && (
                                <span className="text-[10px] px-1.5 py-px rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold" title={`Both lists price the same ${rowEff.conflict.productCount} product(s). Remove the overlap in Prices → Compare, or re-tick to choose Skip/Replace.`}>
                                  ⚠ {rowEff.conflict.productCount} product{rowEff.conflict.productCount === 1 ? '' : 's'} priced twice — review
                                </span>
                              )}
                            </>
                          );
                        }
                        return (
                          <span className="text-[10px] px-1.5 py-px rounded-full bg-[#F8E8EC] text-primary font-bold" title={eff.via}>
                            Gets: {eff.priceListName}{lists[0] ? ` (${lists[0].itemCount} products)` : ''}
                          </span>
                        );
                      })()}
                      {row.type === 'customer' && <span className="text-[10px] text-primary font-semibold">View details →</span>}
                    </div>
                  </td>
                  {displayLists.map((col) => {
                    const cellKey = `${row.id}:${col.id}`;
                    const checked = isAssigned(row, col);
                    return (
                      <td key={col.id} className="p-2 border-b border-l border-[#E9E3DD] text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busyCell !== null}
                          onChange={() => void toggle(row, col)}
                          className="w-4 h-4 accent-[#6B1D2E] cursor-pointer"
                          aria-label={`Assign ${col.name} to ${row.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {targetRows.length === 0 && (
            <p className="p-8 text-center text-[#7C7C7C]">No targets match your filters.</p>
          )}
        </div>
      </div>

      <div className="rounded-[12px] border border-[#E9E3DD] bg-white min-h-[240px]">
        <CustomerPricePanel
          customer={selectedCustomer}
          effective={selectedEffective}
          onExplain={
            selectedCustomer && onOpenExplain
              ? () => onOpenExplain(selectedCustomer.userId)
              : undefined
          }
        />
      </div>

      <ConflictDialog
        open={!!pendingConflict}
        listName={pendingConflict?.list.name ?? ''}
        affectedCount={pendingConflict ? new Set(pendingConflict.conflicts.map((c) => c.userId)).size : 0}
        conflicts={pendingConflict?.conflicts ?? []}
        onClose={() => setPendingConflict(null)}
        onSkip={() => void resolveConflict('skip')}
        onReplace={() => void resolveConflict('replace')}
        onReviewManually={() => {
          setPendingConflict(null);
          onReviewConflicts?.();
          toast.message('Compare both lists and remove the overlapping product from one of them, then tick again.');
        }}
      />

      {groupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGroupModal(null)} aria-hidden />
          <div className="relative bg-white rounded-[16px] shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto" role="dialog" aria-label={groupModal.groupId ? 'Edit customer group' : 'New customer group'}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold text-[#181725]">{groupModal.groupId ? 'Edit customer group' : 'New customer group'}</h2>
                <p className="text-[12px] text-[#7C7C7C] mt-0.5">Bundle customers once, then give the whole group a price list in one tick.</p>
              </div>
              <button type="button" onClick={() => setGroupModal(null)} className="p-1.5 rounded-lg hover:bg-[#FAF7F2]" aria-label="Close"><X size={18} /></button>
            </div>
            <label className="block text-[12px] font-semibold text-[#181725]">Group name
              <input
                value={groupModal.name}
                onChange={(e) => setGroupModal((m) => (m ? { ...m, name: e.target.value } : m))}
                placeholder="e.g. VIP Hotels, Premium Cafes"
                className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] font-normal"
              />
            </label>
            <div>
              <p className="text-[12px] font-semibold text-[#181725] mb-1.5">Customers in this group ({groupModal.memberIds.length})</p>
              <input
                value={groupModal.memberSearch}
                onChange={(e) => setGroupModal((m) => (m ? { ...m, memberSearch: e.target.value } : m))}
                placeholder="Search by name or Customer ID (HC-…)"
                aria-label="Search customers for group"
                className="w-full h-10 px-3 border border-[#E9E3DD] rounded-[12px] text-[13px]"
              />
              <div className="mt-2 max-h-[220px] overflow-auto border border-[#E9E3DD] rounded-[12px] divide-y divide-[#E9E3DD]">
                {(targets?.customers ?? [])
                  .filter((c) => {
                    const q = groupModal.memberSearch.trim().toLowerCase();
                    return !q || c.label.toLowerCase().includes(q) || (c.hcidDisplay ?? '').toLowerCase().includes(q);
                  })
                  .slice(0, 100)
                  .map((c) => (
                    <label key={c.userId} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#FAF7F2] text-[13px]">
                      <input
                        type="checkbox"
                        checked={groupModal.memberIds.includes(c.userId)}
                        onChange={(e) => setGroupModal((m) => (m ? { ...m, memberIds: e.target.checked ? [...m.memberIds, c.userId] : m.memberIds.filter((id) => id !== c.userId) } : m))}
                        className="w-4 h-4 accent-[#6B1D2E]"
                      />
                      <span className="font-medium text-[#181725] truncate">{c.label}</span>
                      {c.hcidDisplay && <span className="text-[10px] px-1.5 py-px rounded-full bg-[#FAF7F2] border border-[#E9E3DD] font-bold tabular-nums shrink-0">{c.hcidDisplay}</span>}
                    </label>
                  ))}
                {(targets?.customers ?? []).length === 0 && <p className="p-3 text-[12px] text-[#7C7C7C]">No customers found.</p>}
              </div>
            </div>
            <div className="flex gap-2">
              {groupModal.groupId && (
                <button type="button" onClick={() => void deleteGroup()} className="h-11 px-3 rounded-[12px] border border-red-200 text-red-700 font-semibold text-[13px]">Delete</button>
              )}
              <button type="button" onClick={() => setGroupModal(null)} className="flex-1 h-11 rounded-[12px] border border-[#E9E3DD] font-semibold">Cancel</button>
              <button type="button" disabled={groupModal.saving || !groupModal.name.trim()} onClick={() => void saveGroup()} className="flex-1 h-11 rounded-[12px] bg-primary text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {groupModal.saving && <Loader2 size={15} className="animate-spin" />} {groupModal.groupId ? 'Save group' : 'Create group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {targetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setTargetModal(null)} aria-hidden />
          <div className="relative bg-white rounded-[16px] shadow-xl w-full max-w-md p-6 space-y-4" role="dialog" aria-label="Add pincode, area or segment">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold text-[#181725]">Add pincode / area / segment</h2>
                <p className="text-[12px] text-[#7C7C7C] mt-0.5">Add any target, even if no customer matches it yet. Then tick a price list for it.</p>
              </div>
              <button type="button" onClick={() => setTargetModal(null)} className="p-1.5 rounded-lg hover:bg-[#FAF7F2]" aria-label="Close"><X size={18} /></button>
            </div>
            <label className="block text-[12px] font-semibold text-[#181725]">Type
              <select
                value={targetModal.type}
                onChange={(e) => setTargetModal((m) => (m ? { ...m, type: e.target.value as 'pincode' | 'area' | 'segment', value: '' } : m))}
                className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] bg-white font-normal"
              >
                <option value="pincode">Pincode (e.g. 400706)</option>
                <option value="area">Area / City — pick from map (e.g. Thane, Navi Mumbai)</option>
                <option value="segment">Segment tag (e.g. Hotel, Cafe, Caterer)</option>
              </select>
            </label>
            {targetModal.type === 'area' ? (
              <div className="block">
                <span className="text-[12px] font-semibold text-[#181725]">Area / City</span>
                {manualArea ? (
                  <>
                    <input
                      value={targetModal.value}
                      onChange={(e) => setTargetModal((m) => (m ? { ...m, value: e.target.value } : m))}
                      placeholder="Type the city / area name exactly, e.g. Thane"
                      className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] font-normal"
                    />
                    <button type="button" onClick={() => setManualArea(false)} className="mt-1.5 text-[11px] text-primary font-semibold">
                      Use map search instead (recommended)
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mt-1">
                      <AddressAutocomplete
                        placeholder="Search area or city on the map (e.g. Thane)"
                        initialValue={targetModal.value}
                        onPick={(place) => {
                          // Store Google's own city/state name so it matches the
                          // city/state stored on customer outlets exactly.
                          const name = (place.city || place.state || place.shortAddress.split(',')[0] || '').trim();
                          if (name) setTargetModal((m) => (m ? { ...m, value: name } : m));
                        }}
                        hint="Pick from the map suggestions — the name then matches your customers' addresses exactly, no spelling mistakes."
                      />
                    </div>
                    {targetModal.value ? (
                      <p className="mt-1.5 text-[12px] text-[#181725]">Selected area: <span className="font-bold">{targetModal.value}</span></p>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-amber-700">Pick a suggestion from the map search to add this area.</p>
                    )}
                    <button type="button" onClick={() => setManualArea(true)} className="mt-1 text-[11px] text-[#7C7C7C] font-medium underline">
                      Can&apos;t find it? Type the area name manually
                    </button>
                  </>
                )}
              </div>
            ) : (
              <label className="block text-[12px] font-semibold text-[#181725]">Value
                <input
                  value={targetModal.value}
                  onChange={(e) => setTargetModal((m) => (m ? { ...m, value: e.target.value } : m))}
                  placeholder={targetModal.type === 'pincode' ? 'e.g. 400706' : 'e.g. Hotel'}
                  inputMode={targetModal.type === 'pincode' ? 'numeric' : undefined}
                  className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] font-normal"
                />
              </label>
            )}
            <label className="block text-[12px] font-semibold text-[#181725]">Assign to price list now (optional)
              <select
                value={targetModal.priceListId}
                onChange={(e) => setTargetModal((m) => (m ? { ...m, priceListId: e.target.value } : m))}
                className="mt-1 w-full h-11 px-3 border border-[#E9E3DD] rounded-[12px] bg-white font-normal"
              >
                <option value="">Just add the row — I will tick it myself</option>
                {displayLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTargetModal(null)} className="flex-1 h-11 rounded-[12px] border border-[#E9E3DD] font-semibold">Cancel</button>
              <button type="button" disabled={!targetModal.value.trim()} onClick={() => void saveTarget()} className="flex-1 h-11 rounded-[12px] bg-primary text-white font-semibold disabled:opacity-50">Add target</button>
            </div>
          </div>
        </div>
      )}

    </div>
    </div>
  );
}
