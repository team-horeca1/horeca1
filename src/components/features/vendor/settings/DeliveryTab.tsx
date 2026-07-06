'use client';

import { Clock, MapPin, Plus, Save, Trash2, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeliverySlot, ServiceArea } from './types';
import { DAY_NAMES, formatTime } from './types';
import { VendorSettingsSaveBar } from './VendorSettingsSaveBar';

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
  defaultTaxPercent: string;
  setDefaultTaxPercent: (v: string) => void;
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
    defaultMOQ, setDefaultMOQ, defaultTaxPercent, setDefaultTaxPercent,
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
            configOutletId === o.id ? 'bg-[#299E60] text-white border-[#299E60]' : 'bg-white text-[#7C7C7C] border-[#EEEEEE]',
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
            className="h-[40px] w-[140px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40"
          />
          <button type="button" onClick={onAddArea} disabled={addingArea || !newPincode.trim()} className="h-[40px] px-4 bg-[#299E60] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-50">
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
                <button type="button" onClick={() => onToggleArea(area)} className="relative ml-1 inline-flex h-[16px] w-[28px] shrink-0 cursor-pointer items-center rounded-full" style={{ backgroundColor: area.isActive ? '#299E60' : '#D1D5DB' }}>
                  <span className="inline-block h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform" style={{ transform: area.isActive ? 'translateX(14px)' : 'translateX(2px)' }} />
                </button>
                <button type="button" onClick={() => onDeleteArea(area)} className="p-0.5 rounded hover:bg-red-50"><X size={12} className="text-[#E74C3C]" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-[#F5F5F5] pt-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-[#8B5CF6]" />
            <h2 className="text-[16px] font-bold text-[#181725]">Delivery slots</h2>
            <span className="text-[13px] text-[#AEAEAE]">({scopedDeliverySlots.length})</span>
          </div>
          <button type="button" onClick={onOpenAddSlot} className="h-[34px] px-3 bg-[#8B5CF6] text-white rounded-[10px] text-[12px] font-bold flex items-center gap-1">
            <Plus size={13} /> Add slot
          </button>
        </div>
        {outletPicker}
        {showSlotForm && (
          <div className="mb-4 p-4 rounded-[10px] bg-[#FAFAFA] border border-[#EEEEEE]">
            <p className="text-[13px] font-bold text-[#181725] mb-3">{editingSlotId ? 'Edit slot' : 'New slot'}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <select value={slotDay} onChange={(e) => setSlotDay(Number(e.target.value))} className="h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px] bg-white">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
              </select>
              <input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} className="h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px]" />
              <input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} className="h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px]" />
              <input type="time" value={slotCutoff} onChange={(e) => setSlotCutoff(e.target.value)} className="h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px]" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onSaveSlot} disabled={savingSlot} className="h-[36px] px-4 bg-[#8B5CF6] text-white rounded-[10px] text-[12px] font-bold flex items-center gap-1 disabled:opacity-50">
                <Save size={13} /> {savingSlot ? 'Saving...' : editingSlotId ? 'Update' : 'Add'}
              </button>
              <button type="button" onClick={onResetSlotForm} className="h-[36px] px-4 bg-gray-100 text-[#7C7C7C] rounded-[10px] text-[12px] font-bold">Cancel</button>
            </div>
          </div>
        )}
        {scopedDeliverySlots.length === 0 && !showSlotForm ? (
          <p className="text-[13px] text-[#AEAEAE]">No delivery slots configured.</p>
        ) : (
          <div className="divide-y divide-[#F5F5F5] border border-[#EEEEEE] rounded-[10px] overflow-hidden">
            {scopedDeliverySlots.map((slot) => (
              <div key={slot.id} className={cn('px-4 py-3 flex items-center justify-between gap-3', !slot.isActive && 'opacity-60')}>
                <div>
                  <p className="text-[13px] font-bold text-[#181725]">{DAY_NAMES[slot.dayOfWeek]}</p>
                  <p className="text-[11px] text-[#7C7C7C]">{formatTime(slot.slotStart)} – {formatTime(slot.slotEnd)} · Cutoff {formatTime(slot.cutoffTime)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => onToggleSlot(slot)} className="relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full" style={{ backgroundColor: slot.isActive ? '#299E60' : '#D1D5DB' }}>
                    <span className="inline-block h-[13px] w-[13px] rounded-full bg-white shadow-sm transition-transform" style={{ transform: slot.isActive ? 'translateX(16px)' : 'translateX(3px)' }} />
                  </button>
                  <button type="button" onClick={() => onOpenEditSlot(slot)} className="p-1 rounded hover:bg-blue-50"><Pencil size={13} className="text-[#3B82F6]" /></button>
                  <button type="button" onClick={() => onDeleteSlot(slot)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-[#E74C3C]" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-[#F5F5F5] pt-6">
        <h2 className="text-[16px] font-bold text-[#181725] mb-4">Ordering defaults</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Default MOQ</label>
            <input type="number" min={1} value={defaultMOQ} onChange={(e) => setDefaultMOQ(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Default tax %</label>
            <select value={defaultTaxPercent} onChange={(e) => setDefaultTaxPercent(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] bg-white">
              <option value="">Not set</option>
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Delivery fee (₹)</label>
            <input type="number" min={0} step={0.01} value={deliveryFeeVal} onChange={(e) => setDeliveryFeeVal(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Free delivery above (₹)</label>
            <input type="number" min={0} step={0.01} value={freeDeliveryAbove} onChange={(e) => setFreeDeliveryAbove(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40" />
          </div>
        </div>
      </section>

      <VendorSettingsSaveBar saving={saving} saved={saved} onSave={onSave} />
    </div>
  );
}
