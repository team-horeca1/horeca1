'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Info,
  List,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';

type Holiday = {
  id: string;
  holidayDate: string;
  label: string;
  scope: string;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

/** Monday-first month grid for a calmer B2B calendar. */
function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // JS getDay(): Sun=0 … Sat=6 → Monday-first pad
  const startPad = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatHolidayDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminHolidaysPage() {
  const confirm = useConfirm();
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [dialogDate, setDialogDate] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const months = useMemo(() => {
    const m0 = { year: anchor.getFullYear(), month: anchor.getMonth() };
    const next = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    const m1 = { year: next.getFullYear(), month: next.getMonth() };
    return [m0, m1];
  }, [anchor]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const h of holidays) map.set(h.holidayDate, h);
    return map;
  }, [holidays]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = toYmd(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
      const toDate = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 0);
      const to = toYmd(toDate);
      const res = await fetch(`/api/v1/admin/holidays?from=${from}&to=${to}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error("Couldn't load holidays");
      const json = await res.json();
      setHolidays(Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load holidays");
    } finally {
      setLoading(false);
    }
  }, [anchor]);

  useEffect(() => {
    void load();
  }, [load]);

  const upcoming = useMemo(() => {
    const todayYmd = toYmd(today);
    return [...holidays]
      .filter((h) => h.holidayDate >= todayYmd)
      .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
  }, [holidays, today]);

  /** Same source as calendar marks — every holiday in the loaded window (not only upcoming). */
  const holidaysInPeriod = useMemo(
    () => [...holidays].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate)),
    [holidays],
  );

  const openAdd = (ymd: string) => {
    if (holidayByDate.has(ymd)) return;
    setDialogDate(ymd);
    setLabel('');
  };

  const handleCreate = async () => {
    if (!dialogDate || !label.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/holidays', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holidayDate: dialogDate, label: label.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message || 'Could not add holiday');
      setDialogDate(null);
      setLabel('');
      toast.success('Holiday added');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add holiday');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h: Holiday) => {
    const ok = await confirm({
      title: 'Remove holiday?',
      message: `Remove “${h.label}” on ${formatHolidayDate(h.holidayDate)}? Supplier delivery dates that skipped this day will recalculate on their next order.`,
      confirmText: 'Remove',
      cancelText: 'Keep',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/holidays/${h.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Could not delete holiday');
      toast.success('Holiday removed');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete holiday');
    } finally {
      setSaving(false);
    }
  };

  const listRows = view === 'list' ? holidaysInPeriod : upcoming;
  const pastInPeriod = holidaysInPeriod.filter((h) => h.holidayDate < toYmd(today));

  return (
    <div className="max-w-[1100px] space-y-6 pb-12">
      <nav className="flex flex-wrap items-center gap-1.5 text-[12px] text-[#667085]" aria-label="Breadcrumb">
        <a href="/admin/settings" className="hover:text-[#6B1D2E] font-medium">
          Settings
        </a>
        <span aria-hidden>/</span>
        <a href="/admin/settings?tab=delivery" className="hover:text-[#6B1D2E] font-medium">
          Delivery
        </a>
        <span aria-hidden>/</span>
        <span className="text-[#181725] font-semibold">Delivery Holidays</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.25rem,4vw,1.625rem)] font-semibold text-[#181725]">
            Delivery Holidays
          </h1>
          <p className="text-[#667085] text-[13px] font-medium mt-1 max-w-[36rem] leading-relaxed">
            Manage public holidays that affect supplier delivery dates.
          </p>
        </div>
        <div
          className="inline-flex p-1 rounded-[12px] bg-[#F5F5F5] border border-[#EEEEEE] gap-1"
          role="tablist"
          aria-label="Holiday views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'calendar'}
            onClick={() => setView('calendar')}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[12px] font-bold transition-colors',
              view === 'calendar'
                ? 'bg-white text-[#6B1D2E] shadow-sm border border-[#E9E3DD]'
                : 'text-[#667085]',
            )}
          >
            <CalendarDays size={15} />
            Calendar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            onClick={() => setView('list')}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[12px] font-bold transition-colors',
              view === 'list'
                ? 'bg-white text-[#6B1D2E] shadow-sm border border-[#E9E3DD]'
                : 'text-[#667085]',
            )}
          >
            <List size={15} />
            List
          </button>
        </div>
      </div>

      <div className="flex gap-3 rounded-[12px] border border-[#E9E3DD] bg-[#FAF7F2] px-4 py-3">
        <Info size={16} className="text-[#6B1D2E] shrink-0 mt-0.5" />
        <p className="text-[12px] text-[#667085] leading-relaxed">
          Platform holidays are automatically skipped unless a supplier has enabled holiday delivery.
          Defaults you set in Settings seed new supplier pincodes; holidays then shape the next valid
          delivery date customers see at checkout.
        </p>
      </div>

      {error && (
        <div className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[#DC2626]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="h-9 px-3 rounded-[8px] border border-[#FECACA] text-[12px] font-bold text-[#DC2626] hover:bg-white"
          >
            Try Again
          </button>
        </div>
      )}

      {view === 'calendar' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
              className="h-10 w-10 rounded-[10px] border border-[#E9E3DD] flex items-center justify-center text-[#1C1C1C] hover:bg-white"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <p className="text-[14px] font-semibold text-[#1C1C1C] text-center">
              {monthLabel(months[0].year, months[0].month)}
              <span className="text-[#AEAEAE] mx-2">·</span>
              {monthLabel(months[1].year, months[1].month)}
            </p>
            <button
              type="button"
              onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
              className="h-10 w-10 rounded-[10px] border border-[#E9E3DD] flex items-center justify-center text-[#1C1C1C] hover:bg-white"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-[14px] border border-[#EEEEEE] h-[360px] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {months.map((m) => {
                const cells = buildMonthGrid(m.year, m.month);
                return (
                  <div
                    key={`${m.year}-${m.month}`}
                    className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-[#EEEEEE] bg-[#FAF7F2]">
                      <h2 className="text-[15px] font-bold text-[#181725]">
                        {monthLabel(m.year, m.month)}
                      </h2>
                    </div>
                    <div className="p-3">
                      <div className="grid grid-cols-7 gap-1 mb-1">
                        {WEEKDAYS.map((d) => (
                          <div
                            key={d}
                            className="text-center text-[11px] font-bold text-[#667085] py-1"
                          >
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {cells.map((cell, idx) => {
                          if (!cell) {
                            return <div key={`empty-${idx}`} className="min-h-[56px] sm:min-h-[64px]" />;
                          }
                          const ymd = toYmd(cell);
                          const holiday = holidayByDate.get(ymd);
                          const isToday = ymd === toYmd(today);
                          return (
                            <button
                              key={ymd}
                              type="button"
                              disabled={!!holiday || saving}
                              onClick={() => openAdd(ymd)}
                              aria-label={
                                holiday
                                  ? `${formatHolidayDate(ymd)} — ${holiday.label}`
                                  : `Add holiday on ${formatHolidayDate(ymd)}`
                              }
                              className={cn(
                                'min-h-[56px] sm:min-h-[64px] rounded-[10px] border p-1.5 text-left transition-colors',
                                holiday
                                  ? 'bg-[#F8E8EC] border-[#E8B4BE] cursor-default'
                                  : 'bg-[#FAFAFA] border-transparent hover:border-[#6B1D2E]/30 hover:bg-white',
                                isToday && !holiday && 'ring-1 ring-[#6B1D2E]/40',
                              )}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span
                                  className={cn(
                                    'text-[12px] font-bold',
                                    isToday ? 'text-[#6B1D2E]' : 'text-[#1C1C1C]',
                                  )}
                                >
                                  {cell.getDate()}
                                </span>
                                {!holiday && (
                                  <Plus size={12} className="text-[#AEAEAE] shrink-0" aria-hidden />
                                )}
                              </div>
                              {holiday && (
                                <p className="mt-1 text-[10px] font-semibold text-[#6B1D2E] leading-tight line-clamp-2">
                                  {holiday.label}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        <div className="px-4 lg:px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-[#181725]">
              {view === 'list' ? 'Holidays in view' : 'Upcoming Holidays'}
            </h2>
            {view === 'calendar' && pastInPeriod.length > 0 && (
              <p className="text-[11px] text-[#667085] mt-0.5">
                {pastInPeriod.length} past holiday{pastInPeriod.length === 1 ? '' : 's'} also on
                this calendar — see below to delete.
              </p>
            )}
          </div>
          {loading && <Loader2 size={16} className="animate-spin text-[#AEAEAE]" />}
        </div>
        {loading ? (
          <div className="px-4 lg:px-6 py-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-[10px] bg-[#F5F5F5] animate-pulse" />
            ))}
          </div>
        ) : (view === 'calendar' ? holidaysInPeriod : listRows).length === 0 ? (
          <div className="px-4 lg:px-6 py-10 text-center">
            <CalendarDays size={28} className="text-[#AEAEAE] mx-auto mb-2" />
            <p className="text-[14px] font-bold text-[#181725]">No holidays yet</p>
            <p className="text-[12px] text-[#667085] mt-1">
              Click a date on the calendar to add an All-India holiday.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F5F5F5]">
            {(view === 'calendar' ? holidaysInPeriod : listRows).map((h) => {
              const isPast = h.holidayDate < toYmd(today);
              return (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 px-4 lg:px-6 py-3.5 hover:bg-[#FAFAFA]/80"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#181725] truncate">{h.label}</p>
                  <p className="text-[12px] text-[#667085] mt-0.5">
                    {formatHolidayDate(h.holidayDate)}
                    <span className="text-[#AEAEAE]"> · </span>
                    All India
                    {isPast && view === 'calendar' && (
                      <span className="text-[#AEAEAE]"> · Past</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleDelete(h)}
                  aria-label={`Delete holiday ${h.label}`}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] border border-[#FECACA] text-[12px] font-semibold text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-50 shrink-0"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {dialogDate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-holiday-title"
          onClick={() => setDialogDate(null)}
        >
          <div
            className="w-full max-w-md rounded-t-[20px] sm:rounded-[14px] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center pt-3">
              <span className="w-9 h-1 rounded-full bg-[#D1D5DB]" />
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
              <h3 id="add-holiday-title" className="text-[16px] font-bold text-[#181725]">
                Add Holiday
              </h3>
              <button
                type="button"
                onClick={() => setDialogDate(null)}
                className="p-1 rounded-md text-[#667085] hover:bg-[#F5F5F5]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-[#4B4B4B] mb-1">Date</label>
                <p className="text-[14px] font-semibold text-[#181725]">
                  {new Date(`${dialogDate}T00:00:00`).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <label
                  htmlFor="holiday-name"
                  className="block text-[12px] font-bold text-[#4B4B4B] mb-1.5"
                >
                  Holiday name
                </label>
                <input
                  id="holiday-name"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Ganesh Chaturthi"
                  className="w-full h-11 rounded-[10px] border border-[#EEEEEE] bg-[#F8F9FB] px-3 text-[14px] outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
                  autoFocus
                />
              </div>
              <div className="rounded-[10px] bg-[#FAF7F2] border border-[#E9E3DD] px-3 py-2.5">
                <p className="text-[11px] font-bold text-[#181725]">Scope</p>
                <p className="text-[12px] text-[#667085] mt-0.5">All India</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#EEEEEE] bg-[#FAF7F2]">
              <button
                type="button"
                onClick={() => setDialogDate(null)}
                className="min-h-12 px-4 rounded-[12px] border border-[#EEEEEE] bg-white text-[13px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !label.trim()}
                onClick={() => void handleCreate()}
                className="min-h-12 px-5 rounded-[12px] bg-[#6B1D2E] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Add Holiday
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
