'use client';
import { CDL } from '@/lib/cdl';

import { Clock, MapPin, Plus, Save, Trash2, Pencil, X, ArrowRight, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeliverySlot, ServiceArea } from './types';
import { DAY_NAMES, formatTime, SLOT_TIME_PRESETS } from './types';
import { VendorSettingsSaveBar } from './VendorSettingsSaveBar';

const timeInputCls =
  'w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px] bg-white outline-none focus:border-[#8B5CF6]/50';

function sortSlots(slots: DeliverySlot[]) {
  return [...slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.slotStart.localeCompare(b.slotStart));
}

export interface DeliveryTabProps {
  multiWarehouseEnabled: boolean;
  configOutlets: Array<{ id: string; name: string }>;
  configOutletId: string | null;
  setConfigOutletId: (id: string) => void;
  scopedServiceAreas: ServiceArea[];
  scopedDeliverySlots: DeliverySlot[];
  newPincode: string;
  setNewPincode: (v: string) => void;
  addingArea: boolean;
  onAddArea: () => void;
  onToggleArea: (area: ServiceArea) => void;
  onDeleteArea: (area: ServiceArea) => void;
  showSlotForm: boolean;
  editingSlotId: string | null;
  slotDay: number;
  setSlotDay: (v: number) => void;
  slotStart: string;
  setSlotStart: (v: string) => void;
  slotEnd: string;
  setSlotEnd: (v: string) => void;
  slotCutoff: string;
  setSlotCutoff: (v: string) => void;
  savingSlot: boolean;
  onOpenAddSlot: () => void;
  onOpenEditSlot: (slot: DeliverySlot) => void;
  onSaveSlot: () => void;
  onResetSlotForm: () => void;
  onToggleSlot: (slot: DeliverySlot) => void;
  onDeleteSlot: (slot: DeliverySlot) => void;
  defaultMOQ: string;
  setDefaultMOQ: (v: string) => void;
  deliveryFeeVal: string;
  setDeliveryFeeVal: (v: string) => void;
  freeDeliveryAbove: string;
  setFreeDeliveryAbove: (v: string) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}

export function DeliveryTab(props: DeliveryTabProps) {
  const {
    multiWarehouseEnabled, configOutlets, configOutletId, setConfigOutletId,
    scopedServiceAreas, scopedDeliverySlots,
    newPincode, setNewPincode, addingArea, onAddArea, onToggleArea, onDeleteArea,
    showSlotForm, editingSlotId, slotDay, setSlotDay, slotStart, setSlotStart,
    slotEnd, setSlotEnd, slotCutoff, setSlotCutoff, savingSlot,
    onOpenAddSlot, onOpenEditSlot, onSaveSlot, onResetSlotForm, onToggleSlot, onDeleteSlot,
    defaultMOQ, setDefaultMOQ,
    deliveryFeeVal, setDeliveryFeeVal, freeDeliveryAbove, setFreeDeliveryAbove,
    saving, saved, onSave,
  } = props;

  const outletPicker = multiWarehouseEnabled && configOutlets.length > 0 && (
    <div className="flex flex-wrap gap-2 mb-4">
      {configOutlets.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setConfigOutletId(o.id)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-[12px] font-bold border',
            configOutletId === o.id ? 'bg-primary text-white border-primary' : 'bg-white text-[#7C7C7C] border-[#EEEEEE]',
          )}
        >
          {o.name}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={18} className="text-[#F59E0B]" />
          <h2 className="text-[16px] font-bold text-[#181725]">Service areas</h2>
          <span className="text-[13px] text-[#AEAEAE]">({scopedServiceAreas.length})</span>
        </div>
        {outletPicker}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <input
            type="text"
            value={newPincode}
            onChange={(e) => setNewPincode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddArea()}
            placeholder="Pincode"
            className="h-[40px] w-[140px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-primary/40"
          />
          <button type="button" onClick={onAddArea} disabled={addingArea || !newPincode.trim()} className="h-[40px] px-4 bg-primary text-white rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-50">
            <Plus size={14} /> {addingArea ? 'Adding...' : 'Add'}
          </button>
        </div>
        {scopedServiceAreas.length === 0 ? (
          <p className="text-[13px] text-[#AEAEAE]">No pincodes yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {scopedServiceAreas.map((area) => (
              <div key={area.id} className={cn('flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-[10px] border text-[12px] font-bold', area.isActive ? 'bg-[#FFF8E1] border-[#F59E0B]/20 text-[#976538]' : 'bg-[#F5F5F5] border-[#EEEEEE] text-[#AEAEAE]')}>
                <MapPin size={12} />
                {area.pincode}
                <button type="button" onClick={() => onToggleArea(area)} className="relative ml-1 inline-flex h-[16px] w-[28px] shrink-0 cursor-pointer items-center rounded-full" style={{ backgroundColor: area.isActive ? CDL.primary : '#D1D5DB' }}>
                  <span className="inline-block h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform" style={{ transform: area.isActive ? 'translateX(14px)' : 'translateX(2px)' }} />
                </button>
                <button type="button" onClick={() => onDeleteArea(area)} className="p-0.5 rounded hover:bg-red-50"><X size={12} className="text-[#E74C3C]" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-[#F5F5F5] pt-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-[#8B5CF6]" />
            <h2 className="text-[16px] font-bold text-[#181725]">Delivery slots</h2>
            <span className="text-[13px] text-[#AEAEAE]">({scopedDeliverySlots.length})</span>
          </div>
          {!showSlotForm && (
            <button type="button" onClick={onOpenAddSlot} className="h-[36px] px-3.5 bg-[#8B5CF6] text-white rounded-[10px] text-[12px] font-bold flex items-center gap-1.5 shrink-0">
              <Plus size={14} /> Add slot
            </button>
          )}
        </div>
        <p className="text-[12px] text-[#7C7C7C] mb-4 leading-relaxed max-w-[52rem]">
          Set when you deliver on each day. Customers pick a slot at checkout and must order before the cutoff time.
        </p>
        {outletPicker}

        {showSlotForm && (
          <div className="mb-5 p-4 sm:p-5 rounded-[12px] bg-[#FAFAFA] border border-[#8B5CF6]/20 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[14px] font-bold text-[#181725]">{editingSlotId ? 'Edit delivery slot' : 'Add delivery slot'}</p>
                <p className="text-[11px] text-[#7C7C7C] mt-0.5">Choose the day, delivery window, and last order time.</p>
              </div>
              <button type="button" onClick={onResetSlotForm} className="p-1 rounded-lg hover:bg-white text-[#AEAEAE]" aria-label="Close form">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-[#181725] mb-1.5">Day</label>
                <select value={slotDay} onChange={(e) => setSlotDay(Number(e.target.value))} className={cn(timeInputCls, 'font-medium')}>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
                </select>
              </div>

              <div className="rounded-[10px] border border-[#EEEEEE] bg-white p-3.5">
                <p className="text-[12px] font-bold text-[#181725] mb-0.5">Quick presets</p>
                <p className="text-[11px] text-[#AEAEAE] mb-2.5">Tap to fill delivery window and cutoff</p>
                <div className="flex flex-wrap gap-2">
                  {SLOT_TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setSlotStart(preset.start);
                        setSlotEnd(preset.end);
                        setSlotCutoff(preset.cutoff);
                      }}
                      className="h-[32px] px-3 rounded-full border border-[#EEEEEE] bg-[#FAFAFA] text-[11px] font-bold text-[#5C5C5C] hover:border-[#8B5CF6]/40 hover:text-[#8B5CF6] transition-colors"
                    >
                      {preset.label} · {formatTime(preset.start)}–{formatTime(preset.end)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[10px] border border-[#EEEEEE] bg-white p-3.5 space-y-3">
                <div>
                  <p className="text-[12px] font-bold text-[#181725]">Delivery window</p>
                  <p className="text-[11px] text-[#AEAEAE]">When the order reaches the customer</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#7C7C7C] mb-1">From</label>
                    <input type="time" step={900} value={slotStart} onChange={(e) => setSlotStart(e.target.value)} className={timeInputCls} />
                  </div>
                  <div className="hidden sm:flex items-center justify-center pb-3 text-[#AEAEAE]">
                    <ArrowRight size={16} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#7C7C7C] mb-1">To</label>
                    <input type="time" step={900} value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} className={timeInputCls} />
                  </div>
                </div>
              </div>

              <div className="rounded-[10px] border border-[#EEEEEE] bg-white p-3.5">
                <label className="block text-[12px] font-bold text-[#181725] mb-0.5">Order cutoff</label>
                <p className="text-[11px] text-[#AEAEAE] mb-2">Last time customers can place an order for this slot</p>
                <input type="time" step={900} value={slotCutoff} onChange={(e) => setSlotCutoff(e.target.value)} className={timeInputCls} />
              </div>

              {slotStart && slotEnd && slotCutoff && (
                <div className="rounded-[10px] border border-dashed border-[#8B5CF6]/30 bg-[#F5F3FF] px-3.5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8B5CF6] mb-1">Preview</p>
                  <p className="text-[13px] font-bold text-[#181725]">{DAY_NAMES[slotDay]}</p>
                  <p className="text-[12px] text-[#5C5C5C] mt-0.5">
                    Deliver between <span className="font-semibold text-[#181725]">{formatTime(slotStart)}</span>
                    {' '}and <span className="font-semibold text-[#181725]">{formatTime(slotEnd)}</span>
                  </p>
                  <p className="text-[12px] text-[#5C5C5C] mt-0.5">
                    Order by <span className="font-semibold text-[#181725]">{formatTime(slotCutoff)}</span> on that day
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-[#EEEEEE]">
              <button
                type="button"
                onClick={onSaveSlot}
                disabled={savingSlot || !slotStart || !slotEnd || !slotCutoff}
                className="h-[40px] px-5 bg-[#8B5CF6] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save size={14} /> {savingSlot ? 'Saving...' : editingSlotId ? 'Save changes' : 'Add slot'}
              </button>
              <button type="button" onClick={onResetSlotForm} className="h-[40px] px-5 bg-white border border-[#EEEEEE] text-[#7C7C7C] rounded-[10px] text-[13px] font-bold">
                Cancel
              </button>
            </div>
          </div>
        )}

        {scopedDeliverySlots.length === 0 && !showSlotForm ? (
          <button
            type="button"
            onClick={onOpenAddSlot}
            className="w-full p-8 text-center rounded-[12px] border border-dashed border-[#D1D5DB] bg-[#FAFAFA] hover:border-[#8B5CF6]/40 hover:bg-[#F5F3FF]/40 transition-colors"
          >
            <CalendarClock size={28} className="text-[#AEAEAE] mx-auto mb-2" />
            <p className="text-[13px] font-bold text-[#374151]">No delivery slots yet</p>
            <p className="text-[12px] text-[#AEAEAE] mt-1">Add your first slot so customers can pick a delivery time at checkout</p>
            <span className="inline-flex items-center gap-1 mt-3 h-[34px] px-4 bg-[#8B5CF6] text-white rounded-[10px] text-[12px] font-bold">
              <Plus size={13} /> Add slot
            </span>
          </button>
        ) : scopedDeliverySlots.length > 0 ? (
          <div className="space-y-2.5">
            {sortSlots(scopedDeliverySlots).map((slot) => (
              <div
                key={slot.id}
                className={cn(
                  'rounded-[12px] border border-[#EEEEEE] bg-white px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4',
                  !slot.isActive && 'opacity-60 bg-[#FAFAFA]',
                )}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-[10px] bg-[#F5F3FF] border border-[#8B5CF6]/15 flex items-center justify-center shrink-0">
                    <Clock size={16} className="text-[#8B5CF6]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-bold text-[#181725]">{DAY_NAMES[slot.dayOfWeek]}</p>
                      <span className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
                        slot.isActive ? 'bg-primary-light text-primary' : 'bg-[#FDF2F2] text-[#E74C3C]',
                      )}>
                        {slot.isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3">
                      <div className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#FAFAFA] border border-[#EEEEEE] px-2.5 py-1.5">
                        <span className="text-[10px] font-bold uppercase text-[#AEAEAE]">Deliver</span>
                        <span className="text-[12px] font-bold text-[#181725]">{formatTime(slot.slotStart)} – {formatTime(slot.slotEnd)}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#FFF8E1] border border-[#F59E0B]/20 px-2.5 py-1.5">
                        <span className="text-[10px] font-bold uppercase text-[#976538]/80">Order by</span>
                        <span className="text-[12px] font-bold text-[#976538]">{formatTime(slot.cutoffTime)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0 pl-[52px] sm:pl-0">
                  <button
                    type="button"
                    onClick={() => onToggleSlot(slot)}
                    className="relative inline-flex h-[20px] w-[36px] shrink-0 items-center rounded-full"
                    style={{ backgroundColor: slot.isActive ? CDL.primary : '#D1D5DB' }}
                    aria-label={slot.isActive ? 'Pause slot' : 'Activate slot'}
                  >
                    <span
                      className="inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform"
                      style={{ transform: slot.isActive ? 'translateX(19px)' : 'translateX(3px)' }}
                    />
                  </button>
                  <button type="button" onClick={() => onOpenEditSlot(slot)} className="h-[34px] w-[34px] rounded-[8px] border border-[#EEEEEE] flex items-center justify-center hover:bg-blue-50" aria-label="Edit slot">
                    <Pencil size={14} className="text-[#3B82F6]" />
                  </button>
                  <button type="button" onClick={() => onDeleteSlot(slot)} className="h-[34px] w-[34px] rounded-[8px] border border-[#EEEEEE] flex items-center justify-center hover:bg-red-50" aria-label="Delete slot">
                    <Trash2 size={14} className="text-[#E74C3C]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="border-t border-[#F5F5F5] pt-6">
        <h2 className="text-[16px] font-bold text-[#181725] mb-4">Ordering defaults</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Default MOQ</label>
            <input type="number" min={1} value={defaultMOQ} onChange={(e) => setDefaultMOQ(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Delivery fee (₹)</label>
            <input type="number" min={0} step={0.01} value={deliveryFeeVal} onChange={(e) => setDeliveryFeeVal(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Free delivery above (₹)</label>
            <input type="number" min={0} step={0.01} value={freeDeliveryAbove} onChange={(e) => setFreeDeliveryAbove(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-primary/40" />
          </div>
        </div>
      </section>

      <VendorSettingsSaveBar saving={saving} saved={saved} onSave={onSave} />
    </div>
  );
}
