'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Bike,
  CalendarDays,
  Check,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Settings2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import type { ServiceArea } from './types';
import { formatTime } from './types';
import {
  buildDeliveryPreview,
  daysMatchDefaults,
  DELIVERY_DAY_FULL,
  DELIVERY_DAY_KEYS,
  DELIVERY_DAY_SHORT,
  formatDaysCompact,
  formatCutoffDisplay,
  PLATFORM_DEFAULT_CUTOFF,
  PLATFORM_DEFAULT_DAYS,
  type DeliveryDayKey,
  type DeliveryPlanDays,
} from '@/lib/deliveryPlanMessage';

function daysFromArea(area: Pick<ServiceArea, DeliveryDayKey>): DeliveryPlanDays {
  return {
    deliversMon: area.deliversMon ?? false,
    deliversTue: area.deliversTue ?? false,
    deliversWed: area.deliversWed ?? false,
    deliversThu: area.deliversThu ?? false,
    deliversFri: area.deliversFri ?? false,
    deliversSat: area.deliversSat ?? false,
    deliversSun: area.deliversSun ?? false,
  };
}

function emptyDays(): DeliveryPlanDays {
  return {
    deliversMon: false,
    deliversTue: false,
    deliversWed: false,
    deliversThu: false,
    deliversFri: false,
    deliversSat: false,
    deliversSun: false,
  };
}

type PlanSubTab = 'plan' | 'preferences';

export interface DeliveryPlanSectionProps {
  areas: ServiceArea[];
  selfPickupOffered: boolean;
  setSelfPickupOffered: (v: boolean) => void;
  deliverThroughPublicHolidays: boolean;
  setDeliverThroughPublicHolidays: (v: boolean) => void;
  onPatchArea: (id: string, patch: Partial<ServiceArea>) => Promise<void>;
  onBulkApplyDays: (ids: string[], days: DeliveryPlanDays) => Promise<void>;
  savingPlan: boolean;
  /** Scroll / focus the existing add-pincode control in the parent. */
  onRequestAddPincode?: () => void;
  /** Service Areas chips + add — rendered after weekly viz, before the pincode table. */
  serviceAreasSlot?: ReactNode;
}

function ToggleSwitch({
  on,
  onToggle,
  label,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'relative w-[52px] h-[28px] rounded-full transition-colors shrink-0 disabled:opacity-50',
        on ? 'bg-[#6B1D2E]' : 'bg-[#D1D5DB]',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-transform',
          on ? 'translate-x-[27px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}

function DayChip({
  label,
  fullLabel,
  selected,
  onToggle,
  size = 'md',
}: {
  label: string;
  fullLabel: string;
  selected: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${fullLabel} delivery`}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center justify-center rounded-[10px] border font-bold transition-colors',
        size === 'sm' ? 'h-8 min-w-[36px] px-2 text-[11px]' : 'h-10 min-w-[44px] px-3 text-[13px]',
        selected
          ? 'bg-[#6B1D2E] text-white border-[#6B1D2E]'
          : 'bg-white text-[#667085] border-[#E9E3DD] hover:border-[#6B1D2E]/35',
      )}
    >
      {selected ? <Check size={size === 'sm' ? 12 : 14} className="mr-0.5 shrink-0" aria-hidden /> : null}
      {label}
    </button>
  );
}

function PreviewCard({
  thirdParty,
  days,
  cutoff,
}: {
  thirdParty: boolean;
  days: DeliveryPlanDays;
  cutoff: string;
}) {
  const preview = buildDeliveryPreview({
    thirdPartyDeliveryAvailable: thirdParty,
    days,
    cutoffTime: cutoff,
  });
  return (
    <div
      className={cn(
        'rounded-[10px] px-3 py-2.5 border',
        preview.kind === 'third_party' && 'bg-[#EFF6FF] border-[#BFDBFE]',
        preview.kind === 'none' && 'bg-[#FEF2F2] border-[#FECACA]',
        preview.kind === 'schedule' && 'bg-[#FAF7F2] border-[#E9E3DD]',
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085] mb-0.5">
        Delivery preview
      </p>
      <p
        className={cn(
          'text-[12px] font-bold leading-snug',
          preview.kind === 'none' ? 'text-[#DC2626]' : 'text-[#181725]',
        )}
      >
        {preview.title}
      </p>
      {preview.subtitle && (
        <p className="text-[11px] text-[#667085] mt-0.5 leading-snug">{preview.subtitle}</p>
      )}
    </div>
  );
}

export function DeliveryPlanSection({
  areas,
  selfPickupOffered,
  setSelfPickupOffered,
  deliverThroughPublicHolidays,
  setDeliverThroughPublicHolidays,
  onPatchArea,
  onBulkApplyDays,
  savingPlan,
  onRequestAddPincode,
  serviceAreasSlot,
}: DeliveryPlanSectionProps) {
  const confirm = useConfirm();
  const [subTab, setSubTab] = useState<PlanSubTab>('plan');
  const [cityFilter, setCityFilter] = useState<string>('__all__');
  const [bulkDays, setBulkDays] = useState<DeliveryPlanDays>({ ...PLATFORM_DEFAULT_DAYS });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ServiceArea> | null>(null);
  const [rowSaving, setRowSaving] = useState(false);
  const [previewAreaId, setPreviewAreaId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of areas) {
      const c = (a.cityLabel ?? '').trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [areas]);

  const visible = useMemo(() => {
    if (cityFilter === '__all__') return areas;
    return areas.filter((a) => (a.cityLabel ?? '').trim() === cityFilter);
  }, [areas, cityFilter]);

  const showCityFilter = cityOptions.length > 1;
  const singleCity = cityOptions.length === 1 ? cityOptions[0] : null;

  const weeklyStats = useMemo(() => {
    return DELIVERY_DAY_KEYS.map((key, i) => {
      const count = visible.filter((a) => !!a[key]).length;
      const cutoffs = visible
        .filter((a) => !!a[key])
        .map((a) => a.cutoffTime || PLATFORM_DEFAULT_CUTOFF);
      const commonCutoff =
        cutoffs.length > 0
          ? cutoffs.sort(
              (a, b) =>
                cutoffs.filter((c) => c === a).length - cutoffs.filter((c) => c === b).length,
            ).pop()!
          : PLATFORM_DEFAULT_CUTOFF;
      return {
        key,
        label: DELIVERY_DAY_SHORT[i],
        full: DELIVERY_DAY_FULL[i],
        count,
        active: count > 0,
        cutoff: commonCutoff,
      };
    });
  }, [visible]);

  const previewArea = useMemo(() => {
    if (visible.length === 0) return null;
    const found = previewAreaId ? visible.find((a) => a.id === previewAreaId) : null;
    return found ?? visible[0];
  }, [visible, previewAreaId]);

  const monthCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startPad = (first.getDay() + 6) % 7; // Monday-first
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  const isDeliveryWeekday = (d: Date, area: ServiceArea) => {
    const day = d.getDay(); // 0 Sun
    const map: DeliveryDayKey[] = [
      'deliversSun',
      'deliversMon',
      'deliversTue',
      'deliversWed',
      'deliversThu',
      'deliversFri',
      'deliversSat',
    ];
    return !!area[map[day]];
  };

  const summary = useMemo(() => {
    const cities = cityOptions.length;
    const thirdParty = areas.filter((a) => a.thirdPartyDeliveryAvailable).length;
    const defaultDays = formatDaysCompact(PLATFORM_DEFAULT_DAYS);
    return {
      areas: areas.length,
      cities,
      thirdParty,
      defaultDays,
      defaultCutoff: formatCutoffDisplay(PLATFORM_DEFAULT_CUTOFF),
    };
  }, [areas, cityOptions.length]);

  const editingArea = editingId ? areas.find((a) => a.id === editingId) ?? null : null;

  const openEdit = (area: ServiceArea) => {
    setEditingId(area.id);
    setEditDraft({
      cityLabel: area.cityLabel ?? '',
      areaLabel: area.areaLabel ?? '',
      cutoffTime: area.cutoffTime || PLATFORM_DEFAULT_CUTOFF,
      thirdPartyDeliveryAvailable: !!area.thirdPartyDeliveryAvailable,
      ...daysFromArea(area),
    });
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft) return;
    setRowSaving(true);
    try {
      await onPatchArea(editingId, editDraft);
      toast.success('Delivery plan updated');
      closeEdit();
    } catch {
      toast.error("Couldn't save this delivery plan. Your existing settings are still unchanged.");
    } finally {
      setRowSaving(false);
    }
  };

  const handleBulkApply = async () => {
    const ids = visible.map((a) => a.id);
    if (ids.length === 0) return;
    const dayList = formatDaysCompact(bulkDays);
    const ok = await confirm({
      title: 'Apply delivery days?',
      message: `Apply ${dayList} to ${ids.length} visible pincode${ids.length === 1 ? '' : 's'}?\n\nThis changes delivery days only. City, area, cut-off and 3rd-party settings will not change.`,
      confirmText: 'Apply days',
      cancelText: 'Cancel',
      tone: 'primary',
    });
    if (!ok) return;
    try {
      await onBulkApplyDays(ids, bulkDays);
    } catch {
      /* parent toasts */
    }
  };

  return (
    <section className="space-y-5">
      {/* Sub-tabs under page Delivery header */}
      <div className="space-y-3">
        <p className="text-[12px] text-[#667085] bg-[#FAF7F2] border border-[#E9E3DD] rounded-[12px] px-3.5 py-2.5 leading-relaxed">
          Delivery schedules affect the delivery options and dates customers see at checkout.
        </p>

        <div
          className="inline-flex p-1 rounded-[12px] bg-[#F5F5F5] border border-[#EEEEEE] gap-1"
          role="tablist"
          aria-label="Delivery sections"
        >
          {(
            [
              { id: 'plan' as const, label: 'Delivery Plan', icon: CalendarDays },
              { id: 'preferences' as const, label: 'Delivery Preferences', icon: Settings2 },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subTab === tab.id}
              onClick={() => setSubTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[12px] font-bold transition-colors',
                subTab === tab.id
                  ? 'bg-white text-[#6B1D2E] shadow-sm border border-[#E9E3DD]'
                  : 'text-[#667085] hover:text-[#181725]',
              )}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'preferences' ? (
        <div className="space-y-3">
          <p className="text-[12px] text-[#667085]">
            These settings apply to your whole supplier account — not individual pincodes.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4 sm:p-5 flex items-start justify-between gap-4 shadow-sm">
              <div className="flex gap-3 min-w-0">
                <div className="w-10 h-10 rounded-[10px] bg-[#F8E8EC] text-[#6B1D2E] flex items-center justify-center shrink-0">
                  <Package size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-[#181725]">Self Pickup</p>
                  <p className="text-[12px] text-[#667085] mt-0.5 leading-relaxed">
                    Allow customers to collect orders from your dispatch point.
                  </p>
                  <p className="text-[11px] font-semibold mt-2 text-[#667085]">
                    Status:{' '}
                    <span className={selfPickupOffered ? 'text-[#16A34A]' : 'text-[#667085]'}>
                      {selfPickupOffered ? 'On' : 'Off'}
                    </span>
                  </p>
                </div>
              </div>
              <ToggleSwitch
                on={selfPickupOffered}
                onToggle={() => setSelfPickupOffered(!selfPickupOffered)}
                label="Self Pickup"
              />
            </div>

            <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4 sm:p-5 flex items-start justify-between gap-4 shadow-sm">
              <div className="flex gap-3 min-w-0">
                <div className="w-10 h-10 rounded-[10px] bg-[#FFF8E1] text-[#976538] flex items-center justify-center shrink-0">
                  <CalendarDays size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-[#181725]">Holiday Delivery</p>
                  <p className="text-[12px] text-[#667085] mt-0.5 leading-relaxed">
                    Continue deliveries on platform holidays. When off, holidays roll to the next delivery day.
                  </p>
                  <p className="text-[11px] font-semibold mt-2 text-[#667085]">
                    Status:{' '}
                    <span className={deliverThroughPublicHolidays ? 'text-[#16A34A]' : 'text-[#667085]'}>
                      {deliverThroughPublicHolidays ? 'On' : 'Off'}
                    </span>
                  </p>
                </div>
              </div>
              <ToggleSwitch
                on={deliverThroughPublicHolidays}
                onToggle={() => setDeliverThroughPublicHolidays(!deliverThroughPublicHolidays)}
                label="Holiday Delivery"
              />
            </div>
          </div>
          <p className="text-[11px] text-[#AEAEAE]">
            Preference changes save with the main Delivery settings Save bar at the bottom of this page.
          </p>
        </div>
      ) : (
        <>
          {/* Weekly schedule visualization — read-only summary of visible rows */}
          {areas.length > 0 && (
            <div className="rounded-[14px] border border-[#EEEEEE] bg-white shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-[#F5F5F5]">
                <p className="text-[13px] font-bold text-[#181725]">Weekly Delivery Schedule</p>
                <p className="text-[11px] text-[#667085] mt-0.5">
                  Visual summary of {visible.length} visible pincode
                  {visible.length === 1 ? '' : 's'}
                  {cityFilter !== '__all__' ? ` in ${cityFilter}` : ''}. Edit days in the table
                  below.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-center">
                  <thead>
                    <tr className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                      <th className="px-3 py-2.5 text-left font-bold text-[#AEAEAE]"> </th>
                      {weeklyStats.map((d) => (
                        <th key={d.key} className="px-2 py-2.5">
                          {d.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[#F5F5F5]">
                      <td className="px-3 py-3 text-left text-[12px] font-bold text-[#181725]">
                        Deliver
                      </td>
                      {weeklyStats.map((d) => (
                        <td key={d.key} className="px-2 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold',
                              d.active
                                ? 'bg-[#6B1D2E] text-white'
                                : 'bg-[#F5F5F5] text-[#AEAEAE]',
                            )}
                            title={`${d.full}: ${d.count} of ${visible.length} pincodes`}
                            aria-label={`${d.full}: ${d.count} of ${visible.length} pincodes deliver`}
                          >
                            {d.active ? '●' : '—'}
                          </span>
                          {visible.length > 1 && d.active && (
                            <p className="text-[10px] text-[#AEAEAE] mt-1 tabular-nums">
                              {d.count}/{visible.length}
                            </p>
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t border-[#F5F5F5]">
                      <td className="px-3 py-3 text-left text-[12px] font-bold text-[#181725]">
                        Cut-off
                      </td>
                      {weeklyStats.map((d) => (
                        <td key={d.key} className="px-2 py-3 text-[11px] font-semibold text-[#667085]">
                          {d.active ? formatCutoffDisplay(d.cutoff) : '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {previewArea && (
                <div className="border-t border-[#F5F5F5] px-4 sm:px-5 py-4 space-y-3 bg-[#FAF7F2]/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-bold text-[#181725]">Schedule Calendar</p>
                      <p className="text-[11px] text-[#667085]">
                        Preview for{' '}
                        <span className="font-semibold text-[#181725] tabular-nums">
                          {previewArea.pincode}
                        </span>
                        {previewArea.areaLabel ? ` · ${previewArea.areaLabel}` : ''}
                      </p>
                    </div>
                    {visible.length > 1 && (
                      <select
                        value={previewArea.id}
                        onChange={(e) => setPreviewAreaId(e.target.value)}
                        className="h-9 rounded-[10px] border border-[#E9E3DD] bg-white px-2 text-[12px] font-semibold"
                        aria-label="Pincode for schedule calendar"
                      >
                        {visible.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.pincode}
                            {a.cityLabel ? ` · ${a.cityLabel}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                        )
                      }
                      className="h-8 px-2 rounded-lg border border-[#E9E3DD] text-[12px] font-semibold"
                      aria-label="Previous month"
                    >
                      ‹
                    </button>
                    <p className="text-[13px] font-bold text-[#181725]">
                      {calendarMonth.toLocaleDateString('en-IN', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                        )
                      }
                      className="h-8 px-2 rounded-lg border border-[#E9E3DD] text-[12px] font-semibold"
                      aria-label="Next month"
                    >
                      ›
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 max-w-md">
                    {DELIVERY_DAY_SHORT.map((d) => (
                      <div
                        key={d}
                        className="text-center text-[10px] font-bold text-[#667085] py-1"
                      >
                        {d}
                      </div>
                    ))}
                    {monthCells.map((cell, idx) => {
                      if (!cell) return <div key={`e-${idx}`} className="min-h-[36px]" />;
                      const delivers = isDeliveryWeekday(cell, previewArea);
                      return (
                        <div
                          key={cell.toISOString()}
                          className={cn(
                            'min-h-[36px] rounded-[8px] flex flex-col items-center justify-center text-[11px] font-semibold',
                            delivers ? 'bg-[#F8E8EC] text-[#6B1D2E]' : 'bg-white text-[#AEAEAE]',
                          )}
                          aria-label={`${cell.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}${delivers ? ' — delivery day' : ''}`}
                        >
                          {cell.getDate()}
                          {delivers && (
                            <span className="text-[8px] leading-none mt-0.5" aria-hidden>
                              ●
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[#667085]">
                    Next pattern:{' '}
                    <strong className="text-[#181725]">
                      {formatDaysCompact(daysFromArea(previewArea))}
                    </strong>
                    {' · '}
                    Orders by {formatTime(previewArea.cutoffTime || PLATFORM_DEFAULT_CUTOFF)}
                  </p>
                </div>
              )}
            </div>
          )}

          {serviceAreasSlot}

          {/* Summary hero */}
          <div className="rounded-[14px] border border-[#EEEEEE] bg-white shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#F5F5F5]">
              <div>
                <p className="text-[13px] font-bold text-[#181725]">Your coverage</p>
                <p className="text-[11px] text-[#667085] mt-0.5">
                  {singleCity ? `Serving ${singleCity}` : 'Pincodes you already serve'}
                </p>
              </div>
              {onRequestAddPincode && (
                <button
                  type="button"
                  onClick={onRequestAddPincode}
                  className="h-10 px-4 rounded-[10px] bg-[#6B1D2E] text-white text-[12px] font-bold hover:bg-[#5A1926] transition-colors"
                >
                  Add Pincode
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[#F5F5F5]">
              {[
                { label: 'Service areas', value: String(summary.areas) },
                { label: 'Active cities', value: String(summary.cities) },
                { label: 'Default days', value: summary.defaultDays },
                { label: 'Default cut-off', value: summary.defaultCutoff },
              ].map((stat) => (
                <div key={stat.label} className="px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#AEAEAE]">
                    {stat.label}
                  </p>
                  <p className="text-[14px] font-bold text-[#181725] mt-0.5 tabular-nums">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="px-4 sm:px-5 py-2.5 bg-[#FAF7F2] border-t border-[#F5F5F5] flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#667085]">
              <span>
                3rd-party enabled:{' '}
                <strong className="text-[#181725]">{summary.thirdParty}</strong>
              </span>
              <span>
                Self-pickup:{' '}
                <strong className="text-[#181725]">{selfPickupOffered ? 'On' : 'Off'}</strong>
              </span>
              <span>
                Holiday delivery:{' '}
                <strong className="text-[#181725]">
                  {deliverThroughPublicHolidays ? 'On' : 'Off'}
                </strong>
              </span>
            </div>
          </div>

          {areas.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#D1D5DB] bg-[#FAFAFA] px-5 py-10 text-center">
              <MapPin size={28} className="text-[#AEAEAE] mx-auto mb-2" />
              <p className="text-[14px] font-bold text-[#181725]">No delivery pincodes yet</p>
              <p className="text-[12px] text-[#667085] mt-1 max-w-sm mx-auto leading-relaxed">
                Add your first delivery pincode to start configuring your delivery schedule.
              </p>
              {onRequestAddPincode && (
                <button
                  type="button"
                  onClick={onRequestAddPincode}
                  className="mt-4 h-11 px-5 rounded-[10px] bg-[#6B1D2E] text-white text-[13px] font-bold"
                >
                  Add Pincode
                </button>
              )}
            </div>
          ) : (
            <>
              {/* City filter */}
              {showCityFilter && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                    Filter by city
                  </p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="City filter">
                    <button
                      type="button"
                      onClick={() => setCityFilter('__all__')}
                      className={cn(
                        'h-9 px-3.5 rounded-full text-[12px] font-bold border transition-colors',
                        cityFilter === '__all__'
                          ? 'bg-[#6B1D2E] text-white border-[#6B1D2E]'
                          : 'bg-white text-[#667085] border-[#E9E3DD] hover:border-[#6B1D2E]/30',
                      )}
                    >
                      All Cities
                    </button>
                    {cityOptions.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCityFilter(c)}
                        className={cn(
                          'h-9 px-3.5 rounded-full text-[12px] font-bold border transition-colors',
                          cityFilter === c
                            ? 'bg-[#6B1D2E] text-white border-[#6B1D2E]'
                            : 'bg-white text-[#667085] border-[#E9E3DD] hover:border-[#6B1D2E]/30',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bulk apply */}
              <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4 shadow-sm space-y-3">
                <div>
                  <p className="text-[13px] font-bold text-[#181725]">Apply delivery days</p>
                  <p className="text-[11px] text-[#667085] mt-0.5">
                    Applies to{' '}
                    <strong className="text-[#181725]">
                      {visible.length} visible pincode{visible.length === 1 ? '' : 's'}
                    </strong>
                    {cityFilter !== '__all__' ? ` in ${cityFilter}` : ''}. Cut-off, city, area and
                    3rd-party stay unchanged.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DELIVERY_DAY_KEYS.map((key, i) => (
                    <DayChip
                      key={key}
                      size="sm"
                      label={DELIVERY_DAY_SHORT[i]}
                      fullLabel={DELIVERY_DAY_FULL[i]}
                      selected={bulkDays[key]}
                      onToggle={() => setBulkDays((prev) => ({ ...prev, [key]: !prev[key] }))}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={savingPlan || visible.length === 0}
                  onClick={() => void handleBulkApply()}
                  className="h-10 px-4 rounded-[10px] bg-[#6B1D2E] text-white text-[12px] font-bold disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {savingPlan ? <Loader2 size={14} className="animate-spin" /> : null}
                  Apply to visible pincodes
                </button>
              </div>

              {visible.length === 0 ? (
                <p className="text-[13px] text-[#AEAEAE] py-4">No pincodes match this city filter.</p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="space-y-3 lg:hidden">
                    {visible.map((area) => {
                      const days = daysFromArea(area);
                      const isDefault = daysMatchDefaults(days);
                      return (
                        <article
                          key={area.id}
                          className="rounded-[14px] border border-[#EEEEEE] bg-white p-4 shadow-sm space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[16px] font-bold text-[#181725] tabular-nums">
                                {area.pincode}
                              </p>
                              <p className="text-[12px] text-[#667085] mt-0.5">
                                {[area.cityLabel, area.areaLabel].filter(Boolean).join(' · ') ||
                                  'City / area not set'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openEdit(area)}
                              className="h-10 px-3 rounded-[10px] border border-[#E9E3DD] text-[12px] font-bold text-[#6B1D2E] inline-flex items-center gap-1.5"
                              aria-label={`Edit delivery schedule for pincode ${area.pincode}`}
                            >
                              <Pencil size={14} />
                              Edit
                            </button>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#AEAEAE]">
                              Delivery
                            </p>
                            <p className="text-[13px] font-bold text-[#181725] mt-0.5">
                              {formatDaysCompact(days)}
                              {isDefault && (
                                <span className="ml-2 text-[10px] font-semibold text-[#667085] bg-[#F5F5F5] px-1.5 py-0.5 rounded">
                                  Default
                                </span>
                              )}
                              {!isDefault && (
                                <span className="ml-2 text-[10px] font-semibold text-[#6B1D2E] bg-[#F8E8EC] px-1.5 py-0.5 rounded">
                                  Custom
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3 text-[12px]">
                            <span className="text-[#667085]">
                              Cut-off{' '}
                              <strong className="text-[#181725]">
                                {formatTime(area.cutoffTime || PLATFORM_DEFAULT_CUTOFF)}
                              </strong>
                            </span>
                            <span className="text-[#667085]">
                              3rd-party{' '}
                              <strong className="text-[#181725]">
                                {area.thirdPartyDeliveryAvailable ? 'On' : 'Off'}
                              </strong>
                            </span>
                          </div>
                          <PreviewCard
                            thirdParty={!!area.thirdPartyDeliveryAvailable}
                            days={days}
                            cutoff={area.cutoffTime || PLATFORM_DEFAULT_CUTOFF}
                          />
                        </article>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-hidden rounded-[14px] border border-[#EEEEEE] bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[880px] text-left">
                        <thead>
                          <tr className="bg-[#FAF7F2] text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                            <th className="px-4 py-3">Pincode</th>
                            <th className="px-3 py-3">City</th>
                            <th className="px-3 py-3">Area</th>
                            <th className="px-3 py-3">Delivery days</th>
                            <th className="px-3 py-3">Cut-off</th>
                            <th className="px-3 py-3">3rd-party</th>
                            <th className="px-3 py-3 min-w-[200px]">Preview</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((area) => {
                            const days = daysFromArea(area);
                            const isDefault = daysMatchDefaults(days);
                            return (
                              <tr
                                key={area.id}
                                className="border-t border-[#F5F5F5] hover:bg-[#FAFAFA]/80 transition-colors align-middle"
                              >
                                <td className="px-4 py-3.5 text-[14px] font-bold text-[#181725] tabular-nums">
                                  {area.pincode}
                                </td>
                                <td className="px-3 py-3.5 text-[13px] text-[#181725]">
                                  {area.cityLabel?.trim() || (
                                    <span className="text-[#AEAEAE]">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-3.5 text-[13px] text-[#181725]">
                                  {area.areaLabel?.trim() || (
                                    <span className="text-[#AEAEAE]">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-3.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[13px] font-semibold text-[#181725]">
                                      {formatDaysCompact(days)}
                                    </span>
                                    {isDefault ? (
                                      <span className="text-[10px] font-semibold text-[#667085] bg-[#F5F5F5] px-1.5 py-0.5 rounded">
                                        Default
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-[#6B1D2E] bg-[#F8E8EC] px-1.5 py-0.5 rounded">
                                        Custom
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-3.5 text-[13px] font-semibold text-[#181725] tabular-nums">
                                  {formatTime(area.cutoffTime || PLATFORM_DEFAULT_CUTOFF)}
                                </td>
                                <td className="px-3 py-3.5">
                                  {area.thirdPartyDeliveryAvailable ? (
                                    <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#2563EB]">
                                      <Bike size={13} /> On
                                    </span>
                                  ) : (
                                    <span className="text-[12px] font-semibold text-[#AEAEAE]">
                                      Off
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <PreviewCard
                                    thirdParty={!!area.thirdPartyDeliveryAvailable}
                                    days={days}
                                    cutoff={area.cutoffTime || PLATFORM_DEFAULT_CUTOFF}
                                  />
                                </td>
                                <td className="px-4 py-3.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(area)}
                                    className="h-9 px-3 rounded-[10px] border border-[#E9E3DD] text-[12px] font-bold text-[#6B1D2E] inline-flex items-center gap-1.5 hover:bg-[#F8E8EC] transition-colors"
                                    aria-label={`Edit delivery schedule for pincode ${area.pincode}`}
                                  >
                                    <Pencil size={13} />
                                    Edit
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Edit drawer / modal */}
      {editingArea && editDraft && (
        <div
          className="fixed inset-0 z-[40000] flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delivery-schedule-title"
          onClick={closeEdit}
        >
          <div
            className="bg-white w-full sm:max-w-[440px] max-h-[92vh] overflow-y-auto rounded-t-[20px] sm:rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <span className="w-9 h-1 rounded-full bg-[#D1D5DB]" />
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
              <div>
                <h3 id="delivery-schedule-title" className="text-[16px] font-bold text-[#181725]">
                  Delivery Schedule
                </h3>
                <p className="text-[12px] text-[#667085] mt-0.5 tabular-nums">
                  Pincode {editingArea.pincode}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="size-10 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] text-[#667085]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5">
              <div>
                <p className="text-[12px] font-bold text-[#181725] mb-2">Delivery days</p>
                <div className="flex flex-wrap gap-1.5">
                  {DELIVERY_DAY_KEYS.map((key, i) => (
                    <DayChip
                      key={key}
                      label={DELIVERY_DAY_SHORT[i]}
                      fullLabel={DELIVERY_DAY_FULL[i]}
                      selected={!!editDraft[key]}
                      onToggle={() =>
                        setEditDraft((prev) =>
                          prev ? { ...prev, [key]: !prev[key] } : prev,
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-cutoff"
                  className="block text-[12px] font-bold text-[#181725] mb-1.5"
                >
                  Cut-off
                </label>
                <input
                  id="edit-cutoff"
                  type="time"
                  value={editDraft.cutoffTime || PLATFORM_DEFAULT_CUTOFF}
                  onChange={(e) =>
                    setEditDraft((prev) =>
                      prev ? { ...prev, cutoffTime: e.target.value || PLATFORM_DEFAULT_CUTOFF } : prev,
                    )
                  }
                  className="w-full h-11 rounded-[10px] border border-[#EEEEEE] bg-[#F8F9FB] px-3 text-[14px] outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
                />
                <p className="text-[11px] text-[#AEAEAE] mt-1">
                  Orders after {formatTime(editDraft.cutoffTime || PLATFORM_DEFAULT_CUTOFF)} roll to
                  the next delivery day.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[#EEEEEE] px-3.5 py-3">
                <div>
                  <p className="text-[13px] font-bold text-[#181725]">3rd-Party Delivery</p>
                  <p className="text-[11px] text-[#667085]">Partner dispatch for this pincode</p>
                </div>
                <ToggleSwitch
                  on={!!editDraft.thirdPartyDeliveryAvailable}
                  onToggle={() =>
                    setEditDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            thirdPartyDeliveryAvailable: !prev.thirdPartyDeliveryAvailable,
                          }
                        : prev,
                    )
                  }
                  label={`3rd-party delivery for pincode ${editingArea.pincode}`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-city"
                    className="block text-[12px] font-bold text-[#181725] mb-1.5"
                  >
                    City
                  </label>
                  <input
                    id="edit-city"
                    type="text"
                    value={editDraft.cityLabel ?? ''}
                    onChange={(e) =>
                      setEditDraft((prev) =>
                        prev ? { ...prev, cityLabel: e.target.value } : prev,
                      )
                    }
                    placeholder="e.g. Navi Mumbai"
                    className="w-full h-11 rounded-[10px] border border-[#EEEEEE] bg-[#F8F9FB] px-3 text-[14px] outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-area"
                    className="block text-[12px] font-bold text-[#181725] mb-1.5"
                  >
                    Area
                  </label>
                  <input
                    id="edit-area"
                    type="text"
                    value={editDraft.areaLabel ?? ''}
                    onChange={(e) =>
                      setEditDraft((prev) =>
                        prev ? { ...prev, areaLabel: e.target.value } : prev,
                      )
                    }
                    placeholder="e.g. Rabale"
                    className="w-full h-11 rounded-[10px] border border-[#EEEEEE] bg-[#F8F9FB] px-3 text-[14px] outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
                  />
                </div>
              </div>

              <PreviewCard
                thirdParty={!!editDraft.thirdPartyDeliveryAvailable}
                days={daysFromArea({
                  ...emptyDays(),
                  ...editDraft,
                } as ServiceArea)}
                cutoff={editDraft.cutoffTime || PLATFORM_DEFAULT_CUTOFF}
              />
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EEEEEE] bg-[#FAF7F2]">
              <button
                type="button"
                onClick={closeEdit}
                disabled={rowSaving}
                className="min-h-12 px-5 rounded-[12px] border border-[#E9E3DD] bg-white text-[13px] font-semibold text-[#1C1C1C]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={rowSaving || savingPlan}
                className="min-h-12 px-5 rounded-[12px] bg-[#6B1D2E] text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50"
              >
                {rowSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
