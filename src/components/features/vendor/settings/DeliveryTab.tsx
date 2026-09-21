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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-primary" />
                <h2 className="text-[16px] font-bold text-[#181725]">Service Areas</h2>
                <span className="text-[13px] text-[#AEAEAE]">({scopedServiceAreas.length})</span>
              </div>
            </div>
            {outletPicker}

            <div className="flex gap-2 mb-4">
              <input
                ref={addPincodeRef}
                type="text"
                value={newPincode}
                onChange={(e) => setNewPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Add pincode (e.g. 400001)"
                maxLength={6}
                className="flex-1 h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-primary/40"
                onKeyDown={(e) => { if (e.key === 'Enter') onAddArea(); }}
              />
              <button
                type="button"
                onClick={onAddArea}
                disabled={addingArea || newPincode.length !== 6}
                className="h-[44px] px-4 bg-primary text-white rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus size={16} /> {addingArea ? 'Adding...' : 'Add'}
              </button>
            </div>

            {scopedServiceAreas.length === 0 ? (
              <div className="p-8 text-center rounded-[12px] border border-dashed border-[#D1D5DB] bg-[#FAFAFA]">
                <MapPin size={28} className="text-[#AEAEAE] mx-auto mb-2" />
                <p className="text-[13px] font-bold text-[#374151]">No service areas yet</p>
                <p className="text-[12px] text-[#AEAEAE] mt-1">Add a pincode to start accepting orders</p>
              </div>
            ) : (
              <div className="space-y-2">
                {scopedServiceAreas.map((area) => (
                  <div
                    key={area.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-[10px] border',
                      area.isActive ? 'border-[#EEEEEE] bg-white' : 'border-[#F5F5F5] bg-[#FAFAFA] opacity-60',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center',
                        area.isActive ? 'bg-primary-light' : 'bg-[#F5F5F5]',
                      )}>
                        <MapPin size={14} className={area.isActive ? 'text-primary' : 'text-[#AEAEAE]'} />
                      </div>
                      <div>
                        <p className="text-[14px] font-bold text-[#181725]">{area.pincode}</p>
                        {(area.cityLabel || area.areaLabel) && (
                          <p className="text-[11px] text-[#AEAEAE]">
                            {[area.cityLabel, area.areaLabel].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleArea(area)}
                        className="relative inline-flex h-[20px] w-[36px] shrink-0 items-center rounded-full"
                        style={{ backgroundColor: area.isActive ? '#6B1D2E' : '#D1D5DB' }}
                        aria-label={area.isActive ? 'Deactivate area' : 'Activate area'}
                      >
                        <span
                          className="inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform"
                          style={{ transform: area.isActive ? 'translateX(19px)' : 'translateX(3px)' }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteArea(area)}
                        aria-label={`Remove pincode ${area.pincode}`}
                        className="p-0.5 rounded hover:bg-red-50"
                      >
                        <X size={12} className="text-[#E74C3C]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
