'use client';

import React, { useState } from 'react';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Address } from '@/context/AddressContext';
import { isRealStreetAddress } from '@/lib/constants/customerProfile';
import {
  deliveryFromOutletAddress,
  OutletAddressForm,
  type OutletAddressValue,
} from '@/components/features/customer/OutletAddressForm';

interface AddNewAddressOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (address: Omit<Address, 'id'>) => void | Promise<void>;
  initialLat?: number;
  initialLng?: number;
  /** When false the overlay cannot be dismissed — used by mandatory first-address gate. */
  dismissible?: boolean;
  /** Show a close / "Skip for now" escape hatch without enabling full dismissible mode. */
  allowSkip?: boolean;
  businessName?: string;
}

const EMPTY: OutletAddressValue = {
  outletName: '',
  billingName: '',
  billingAddressLine: '',
  billingCity: '',
  billingState: '',
  billingPincode: '',
  sameAsBilling: true,
  addressLine: '',
  city: '',
  state: '',
  pincode: '',
};

export function AddNewAddressOverlay({
  isOpen,
  onClose,
  onSave,
  dismissible = true,
  allowSkip = false,
  businessName = '',
}: AddNewAddressOverlayProps) {
  const [value, setValue] = useState<OutletAddressValue>({ ...EMPTY, billingName: businessName });
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  if (!isOpen) return null;

  const delivery = deliveryFromOutletAddress(value);
  const canSave = value.outletName.trim().length >= 2
    && isRealStreetAddress(delivery.addressLine)
    && /^\d{6}$/.test(delivery.pincode);

  const save = async () => {
    if (!canSave) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      const line = delivery.addressLine.trim();
      await onSave({
        label: value.outletName.trim(),
        businessName: value.billingName.trim() || businessName || undefined,
        fullAddress: line,
        shortAddress: line.split(',').slice(0, 2).join(', '),
        latitude: 0,
        longitude: 0,
        pincode: delivery.pincode,
        city: delivery.city.trim() || undefined,
        state: delivery.state.trim() || undefined,
        isDefault: false,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[16000] bg-black/60 backdrop-blur-sm"
        onClick={dismissible ? onClose : undefined}
      />
      <div className="fixed inset-0 z-[16001] flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="w-full md:max-w-[520px] max-h-[92vh] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
            {dismissible && (
              <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
                <ArrowLeft size={20} className="text-gray-700" />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] font-bold text-gray-800">
                {dismissible ? 'Add delivery address' : 'Set your delivery address'}
              </h2>
              {!dismissible && (
                <p className="text-[11px] text-gray-400 font-medium mt-0.5">Type the outlet address to place orders</p>
              )}
            </div>
            {(allowSkip || dismissible) && (
              <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full" aria-label="Close">
                <X size={18} className="text-gray-500" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <OutletAddressForm
              value={value}
              onChange={setValue}
              businessName={businessName}
              errors={showErrors && !canSave ? { addressLine: 'Enter the address, city, state, and pincode.' } : {}}
            />
          </div>
          <div className="px-4 py-3 border-t border-gray-100 shrink-0">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className={cn(
                'w-full text-white font-bold py-3.5 rounded-xl text-[15px]',
                canSave ? 'bg-primary hover:bg-primary-dark' : 'bg-gray-200 text-gray-400',
              )}
            >
              {saving ? <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Saving...</span> : 'Save address'}
            </button>
            {allowSkip && !dismissible && (
              <button type="button" onClick={onClose} className="w-full mt-2 py-2.5 text-[13px] font-semibold text-gray-500">
                Skip for now
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
