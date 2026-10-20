'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AssignmentType, CustomerTarget, PriceListCol } from '../types';
import { ConflictDialog, type PreviewConflict } from './ConflictDialog';
import { CustomerPricePanel } from './CustomerPricePanel';

type PriceListAssignment = {
  type: AssignmentType;
  userId?: string | null;
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
  };
};

interface Props {
  priceLists: PriceListCol[];
  onReloadLists?: () => void;
  onOpenExplain?: (customerId: string) => void;
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

export function AssignmentMatrix({ priceLists, onReloadLists, onOpenExplain }: Props) {
  const [lists, setLists] = useState<PriceListWithAssignments[]>([]);
  const [targets, setTargets] = useState<PricingTargets | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [effective, setEffective] = useState<EffectiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);

  const [conflict, setConflict] = useState<{
    priceListId: string;
    listName: string;
    target: TargetRow;
    preview: {
      affectedCount: number;
      conflicts: PreviewConflict[];
      alreadyBound: { priceListId: string; priceListName: string } | null;
    };
    pendingAssignments: PriceListAssignment[];
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
      });
    });
    targets.pincodes.forEach((p) => {
      rows.push({
        id: `pincode:${p}`,
        name: `Pincode ${p}`,
        type: 'pincode',
        value: p,
        displayType: 'Pincode',
      });
    });
    targets.cities.forEach((city) => {
      rows.push({
        id: `area:${city}`,
        name: `Area ${city}`,
        type: 'area',
        value: city,
        displayType: 'Area',
      });
    });
    targets.segments.forEach((seg) => {
      rows.push({
        id: `segment:${seg}`,
        name: `Segment ${seg}`,
        type: 'segment',
        value: seg,
        displayType: 'Segment',
      });
    });
    targets.creditStatuses.forEach((cs) => {
      rows.push({
        id: `credit:${cs}`,
        name: `Credit ${cs}`,
        type: 'credit_status',
        value: cs,
        displayType: 'Credit status',
      });
    });
    groups.forEach((g) => {
      rows.push({
        id: `group:${g.id}`,
        name: g.name,
        type: 'group',
        value: g.id,
        displayType: 'Group',
      });
    });

    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch = !q || r.name.toLowerCase().includes(q);
      if (filterType === 'all') return matchesSearch;
      return matchesSearch && r.type === filterType;
    });
  }, [targets, groups, search, filterType]);

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
    const res = await fetch(`/api/v1/vendor/price-lists/${priceListId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments, resolutions }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Update failed');
  };

  const toggle = async (target: TargetRow, list: PriceListWithAssignments) => {
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

      const previewRes = await fetch('/api/v1/vendor/price-lists/assignments/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceListId: list.id,
          target: buildTarget(target),
        }),
      });
      const previewJson = await previewRes.json();
      if (!previewJson.success) throw new Error(previewJson.error?.message || 'Preview failed');
      const preview = previewJson.data as {
        affectedCount: number;
        conflicts: PreviewConflict[];
        alreadyBound: { priceListId: string; priceListName: string } | null;
      };

      const nextAssignments = [...current, buildTarget(target) as PriceListAssignment];

      if (preview.conflicts.length > 0 || preview.alreadyBound) {
        setConflict({
          priceListId: list.id,
          listName: list.name,
          target,
          preview,
          pendingAssignments: nextAssignments,
        });
        return;
      }

      await patchAssignments(list.id, nextAssignments);
      toast.success('Assignment saved');
      await load();
      onReloadLists?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setBusyCell(null);
    }
  };

  const applyConflict = async (mode: 'skip' | 'replace') => {
    if (!conflict) return;
    setBusyCell(`${conflict.target.id}:${conflict.priceListId}`);
    try {
      const resolutions = conflict.preview.conflicts.map((c) => ({
        userId: c.userId,
        action: mode,
      }));
      await patchAssignments(conflict.priceListId, conflict.pendingAssignments, resolutions);
      toast.success(mode === 'replace' ? 'Assignments replaced' : 'Assigned (conflicts skipped)');
      setConflict(null);
      await load();
      onReloadLists?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setBusyCell(null);
    }
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
        <p className="text-[#7C7C7C] mt-1.5">Top beats bottom. Tick a box to give that price list to a customer or group of customers — we will warn you if someone would move lists.</p>
      </div>
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 min-h-[480px]">
      <div className="rounded-[12px] border border-[#E9E3DD] bg-white overflow-hidden flex flex-col">
        <div className="p-3 border-b border-[#E9E3DD] space-y-2.5">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C7C7C]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers, pincodes, areas…"
              aria-label="Search targets"
              className="w-full h-10 pl-9 pr-3 rounded-[12px] border border-[#E9E3DD] text-[13px] outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter target type">
            {filterPills.map((p) => (
              <button key={p.id} type="button" onClick={() => setFilterType(p.id)} className={cn('h-8 px-3 rounded-full text-[12px] font-semibold border', filterType === p.id ? 'bg-primary text-white border-primary' : 'bg-white border-[#E9E3DD] text-[#181725] hover:bg-[#FAF7F2]')}>
                {p.label}{filterType === p.id && typeCounts(p.id) > 0 ? ` (${typeCounts(p.id)})` : ''}
              </button>
            ))}
          </div>
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
                      {row.type === 'customer' && effectiveByUser.get(row.value) && (
                        <span className="text-[10px] px-1.5 py-px rounded-full bg-[#F8E8EC] text-primary font-bold" title={effectiveByUser.get(row.value)!.effective.via}>
                          Gets: {effectiveByUser.get(row.value)!.effective.priceListName}
                        </span>
                      )}
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
                          disabled={busyCell === cellKey}
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
        open={!!conflict}
        listName={conflict?.listName ?? ''}
        affectedCount={conflict?.preview.affectedCount ?? 0}
        conflicts={conflict?.preview.conflicts ?? []}
        alreadyBound={conflict?.preview.alreadyBound ?? null}
        onClose={() => setConflict(null)}
        onSkip={() => void applyConflict('skip')}
        onReplace={() => void applyConflict('replace')}
      />
    </div>
    </div>
  );
}
