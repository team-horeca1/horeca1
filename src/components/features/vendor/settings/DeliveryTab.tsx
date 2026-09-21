'use client';
import { useRef } from 'react';

import { MapPin, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServiceArea } from './types';
import { VendorSettingsSaveBar } from './VendorSettingsSaveBar';
import { DeliveryPlanSection } from './DeliveryPlanSection';
import type { DeliveryPlanDays } from '@/lib/deliveryPlanMessage';

export interface DeliveryTabProps {
  multiWarehouseEnabled: boolean;
  configOutlets: Array<{ id: string; name: string }>;
  configOutletId: string | null;
  setConfigOutletId: (id: string) => void;
  scopedServiceAreas: ServiceArea[];
  newPincode: string;
  setNewPincode: (v: string) => void;
  addingArea: boolean;
  onAddArea: () => void;
  onToggleArea: (area: ServiceArea) => void;
  onDeleteArea: (area: ServiceArea) => void;
  defaultMOQ: string;
  setDefaultMOQ: (v: string) => void;
  deliveryFeeVal: string;
  setDeliveryFeeVal: (v: string) => void;
  freeDeliveryAbove: string;
  setFreeDeliveryAbove: (v: string) => void;
  selfPickupOffered: boolean;
  setSelfPickupOffered: (v: boolean) => void;
  deliverThroughPublicHolidays: boolean;
  setDeliverThroughPublicHolidays: (v: boolean) => void;
  onPatchDeliveryPlanArea: (id: string, patch: Partial<ServiceArea>) => Promise<void>;
  onBulkApplyDeliveryDays: (ids: string[], days: DeliveryPlanDays) => Promise<void>;
  savingPlan: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}

export function DeliveryTab(props: DeliveryTabProps) {
  const {
    multiWarehouseEnabled, configOutlets, configOutletId, setConfigOutletId,
    scopedServiceAreas,
    newPincode, setNewPincode, addingArea, onAddArea, onToggleArea, onDeleteArea,
    defaultMOQ, setDefaultMOQ,
    deliveryFeeVal, setDeliveryFeeVal, freeDeliveryAbove, setFreeDeliveryAbove,
    selfPickupOffered, setSelfPickupOffered,
    deliverThroughPublicHolidays, setDeliverThroughPublicHolidays,
    onPatchDeliveryPlanArea, onBulkApplyDeliveryDays, savingPlan,
    saving, saved, onSave,
  } = props;

  const addPincodeRef = useRef<HTMLInputElement>(null);
  const focusAddPincode = () => {
    addPincodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    addPincodeRef.current?.focus();
  };

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
    <div className="space-y-6">
      <DeliveryPlanSection
        areas={scopedServiceAreas}
        selfPickupOffered={selfPickupOffered}
        setSelfPickupOffered={setSelfPickupOffered}
        deliverThroughPublicHolidays={deliverThroughPublicHolidays}
        setDeliverThroughPublicHolidays={setDeliverThroughPublicHolidays}
        onPatchArea={onPatchDeliveryPlanArea}
        onBulkApplyDays={onBulkApplyDeliveryDays}
        savingPlan={savingPlan}
        onRequestAddPincode={focusAddPincode}
        serviceAreasSlot={
          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin size={16} className="text-primary shrink-0" />
                <h2 className="text-[15px] font-bold text-[#181725]">Service Areas</h2>
                <span className="text-[12px] text-[#AEAEAE] tabular-nums">({scopedServiceAreas.length})</span>
              </div>
            </div>
            {outletPicker}

            <div className="flex gap-2 mb-3">
              <input
                ref={addPincodeRef}
                type="text"
                inputMode="numeric"
                value={newPincode}
                onChange={(e) => setNewPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Add pincode"
                maxLength={6}
                aria-label="Add service area pincode"
                className="w-[9.5rem] sm:w-[11rem] h-10 border border-[#E9E3DD] rounded-lg px-3 text-[13px] font-medium tabular-nums outline-none focus:border-primary/40 bg-white"
                onKeyDown={(e) => { if (e.key === 'Enter') onAddArea(); }}
              />
              <button
                type="button"
                onClick={onAddArea}
                disabled={addingArea || newPincode.length !== 6}
                className="h-10 px-3.5 bg-primary text-white rounded-lg text-[12px] font-bold flex items-center gap-1 disabled:opacity-50 shrink-0"
              >
                <Plus size={14} /> {addingArea ? '…' : 'Add'}
              </button>
            </div>

            {scopedServiceAreas.length === 0 ? (
              <div className="py-6 px-4 text-center rounded-xl border border-dashed border-[#E9E3DD] bg-[#FAF7F2]/60">
                <p className="text-[13px] font-semibold text-[#374151]">No pincodes yet</p>
                <p className="text-[12px] text-[#AEAEAE] mt-0.5">Add a pincode to start accepting orders</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {scopedServiceAreas.map((area) => {
                  const place = [area.cityLabel, area.areaLabel].filter(Boolean).join(' · ');
                  return (
                    <div
                      key={area.id}
                      className={cn(
                        'group inline-flex items-center gap-1 max-w-full h-8 pl-2.5 pr-1 rounded-full border text-[12px] transition-colors',
                        area.isActive
                          ? 'border-[#6B1D2E]/25 bg-[#F8E8EC] text-[#1C1C1C]'
                          : 'border-[#E9E3DD] bg-[#FAFAFA] text-[#9CA3AF]',
                      )}
                      title={place || area.pincode}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleArea(area)}
                        className="inline-flex items-center gap-1.5 min-w-0 text-left"
                        aria-pressed={area.isActive}
                        aria-label={
                          area.isActive
                            ? `Deactivate ${area.pincode}`
                            : `Activate ${area.pincode}`
                        }
                      >
                        <span
                          className={cn(
                            'w-1.5 h-1.5 rounded-full shrink-0',
                            area.isActive ? 'bg-primary' : 'bg-[#D1D5DB]',
                          )}
                        />
                        <span className="font-bold tabular-nums tracking-wide">{area.pincode}</span>
                        {place ? (
                          <span className="truncate max-w-[7rem] text-[11px] text-[#667085] font-medium hidden sm:inline">
                            {place}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteArea(area)}
                        aria-label={`Remove pincode ${area.pincode}`}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[#9CA3AF] hover:text-[#DC2626] hover:bg-white/80 shrink-0"
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {scopedServiceAreas.length > 0 && (
              <p className="mt-2 text-[11px] text-[#AEAEAE]">
                Tap a pincode to pause or resume · × removes it
              </p>
            )}
          </section>
        }
      />

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
