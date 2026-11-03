'use client';

import React, { useState } from 'react';
import { Loader2, MapPin, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { isRealStreetAddress } from '@/lib/constants/customerProfile';
import {
  deliveryFromOutletAddress,
  OutletAddressForm,
  type OutletAddressValue,
} from '@/components/features/customer/OutletAddressForm';

export interface CustomerOutletRow {
  id: string;
  name: string;
  billingName?: string | null;
  addressLine: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

interface Billing {
  line: string;
  city: string;
  state: string;
  pincode: string;
}

function formForOutlet(outlet: CustomerOutletRow | null, businessName: string, billing: Billing): OutletAddressValue {
  const line = outlet && isRealStreetAddress(outlet.addressLine) ? outlet.addressLine : '';
  const same = !outlet || !line || line === billing.line;
  return {
    outletName: outlet?.name && outlet.name !== 'Address pending — complete in account settings' ? outlet.name : '',
    billingName: outlet?.billingName || businessName,
    billingAddressLine: billing.line && isRealStreetAddress(billing.line) ? billing.line : (same ? line : billing.line),
    billingCity: billing.city || outlet?.city || '',
    billingState: billing.state || outlet?.state || '',
    billingPincode: billing.pincode || outlet?.pincode || '',
    sameAsBilling: same,
    addressLine: line,
    city: outlet?.city || '',
    state: outlet?.state || '',
    pincode: outlet?.pincode || '',
  };
}

export function CustomerDeliveryAddresses({
  userId,
  businessName,
  billing,
  outlets,
  onSaved,
}: {
  userId: string;
  businessName: string;
  billing: Billing;
  outlets: CustomerOutletRow[];
  onSaved: () => void;
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [value, setValue] = useState<OutletAddressValue | null>(null);
  const [saving, setSaving] = useState(false);

  const open = (outlet: CustomerOutletRow | null) => {
    setEditingId(outlet ? outlet.id : 'new');
    setValue(formForOutlet(outlet, businessName, billing));
  };

  const save = async () => {
    if (!value || saving) return;
    const delivery = deliveryFromOutletAddress(value);
    if (value.outletName.trim().length < 2 || !isRealStreetAddress(delivery.addressLine) || !/^\d{6}$/.test(delivery.pincode)) {
      toast.error('Enter an outlet name, address, and 6-digit pincode');
      return;
    }
    setSaving(true);
    try {
      const billingName = value.billingName.trim() && value.billingName.trim() !== businessName.trim()
        ? value.billingName.trim()
        : null;
      const outlet: Record<string, unknown> = {
        name: value.outletName.trim(),
        billingName,
        addressLine: delivery.addressLine.trim(),
        city: delivery.city.trim() || null,
        state: delivery.state.trim() || null,
        pincode: delivery.pincode.trim(),
      };
      if (editingId && editingId !== 'new') outlet.id = editingId;
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyProfile: {
            billingAddressLine: value.billingAddressLine.trim(),
            billingCity: value.billingCity.trim(),
            billingState: value.billingState.trim(),
            billingPincode: value.billingPincode.trim(),
          },
          outlets: [outlet],
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Could not save outlet');
      toast.success(editingId === 'new' ? 'Outlet added' : 'Outlet updated');
      setEditingId(null);
      setValue(null);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save outlet');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[15px] text-[#181725] flex items-center gap-2">
          <MapPin size={16} className="text-[#6B1D2E]" />
          Delivery addresses
        </h3>
        <button
          type="button"
          onClick={() => open(null)}
          className="h-[36px] px-3 rounded-[8px] bg-[#6B1D2E] text-white text-[12px] font-bold flex items-center gap-1.5"
        >
          <Plus size={14} /> Add outlet
        </button>
      </div>

      {outlets.length === 0 && !value && (
        <p className="text-[13px] text-gray-500">No outlet yet. Add one before this customer can place an order.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {outlets.map((o) => {
          const street = isRealStreetAddress(o.addressLine) ? o.addressLine : 'Address not filled';
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => open(o)}
              className="text-left p-4 rounded-xl border border-[#E9E3DD] bg-white hover:border-[#6B1D2E]"
            >
              <p className="text-[14px] font-bold text-[#181725]">{o.billingName || o.name || businessName}</p>
              <p className="text-[12px] text-gray-500 mt-1">{o.name}</p>
              <p className="text-[12px] text-gray-600 mt-1">{street}</p>
              <p className="text-[11px] text-gray-400 mt-1">{[o.city, o.state, o.pincode].filter(Boolean).join(' · ')}</p>
            </button>
          );
        })}
      </div>

      {value && (
        <div className="bg-white rounded-[16px] border border-[#D1D5DB] p-5 space-y-4">
          <p className="text-[13px] font-bold text-[#181725]">{editingId === 'new' ? 'New outlet' : 'Edit outlet'}</p>
          <OutletAddressForm value={value} onChange={setValue} businessName={businessName} />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setEditingId(null); setValue(null); }} className="px-4 py-2 text-[12px] font-bold border border-gray-200 rounded-lg">
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={saving} className="px-4 py-2 text-[12px] font-bold bg-[#6B1D2E] text-white rounded-lg flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />}
              Save outlet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
