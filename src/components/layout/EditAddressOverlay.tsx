'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAddress, Address } from '@/context/AddressContext';
import { isRealStreetAddress } from '@/lib/constants/customerProfile';
import {
  deliveryFromOutletAddress,
  OutletAddressForm,
  type OutletAddressValue,
} from '@/components/features/customer/OutletAddressForm';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EditAddressOverlayProps {
  address: Address | null;
  /** Account business name, shown in Billing name when this outlet has no override. */
  businessName?: string;
  onClose: () => void;
}

function fromAddress(address: Address, businessName: string): OutletAddressValue {
  const line = isRealStreetAddress(address.fullAddress) ? address.fullAddress : '';
  return {
    outletName: address.label || '',
    billingName: address.businessName || businessName,
    billingAddressLine: line,
    billingCity: address.city || '',
    billingState: address.state || '',
    billingPincode: address.pincode || '',
    sameAsBilling: true,
    addressLine: line,
    city: address.city || '',
    state: address.state || '',
    pincode: address.pincode || '',
  };
}

export function EditAddressOverlay({ address, businessName = '', onClose }: EditAddressOverlayProps) {
  const { updateAddress } = useAddress();
  const [value, setValue] = useState<OutletAddressValue | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!address) {
      setValue(null);
      return;
    }
    setValue(fromAddress(address, businessName));
  }, [address, businessName]);

  if (!address || !value) return null;

  const delivery = deliveryFromOutletAddress(value);
  const canSave = isRealStreetAddress(delivery.addressLine) && /^\d{6}$/.test(delivery.pincode);

  const handleSave = async () => {
    if (!canSave) {
      toast.error('Enter the address and a 6-digit pincode');
      return;
    }
    setIsSaving(true);
    try {
      const line = delivery.addressLine.trim();
      await updateAddress(address.id, {
        label: value.outletName.trim() || address.label,
        businessName: value.billingName.trim() || undefined,
        fullAddress: line,
        shortAddress: line.split(',').slice(0, 2).join(', '),
        pincode: delivery.pincode,
        city: delivery.city.trim() || undefined,
        state: delivery.state.trim() || undefined,
        flatInfo: address.flatInfo,
        landmark: address.landmark,
        // Keep an existing map pin. Typing a street does not wipe old coordinates.
        latitude: address.latitude,
        longitude: address.longitude,
        ...(address.placeId ? { placeId: address.placeId } : {}),
      });
      toast.success('Address updated');
      onClose();
    } catch {
      toast.error('Could not update address');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[15000] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[15001] flex items-end md:items-center justify-center p-0 md:p-4 pointer-events-none">
        <div
          className="w-full md:max-w-[520px] max-h-[90vh] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0] shrink-0">
            <h3 className="font-extrabold text-[16px] text-gray-900">Edit delivery address</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
              <X size={18} className="text-gray-600" />
            </button>
          </div>
          <div className="px-5 py-4 overflow-y-auto">
            <OutletAddressForm value={value} onChange={setValue} businessName={businessName} />
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button onClick={onClose} className="h-[44px] px-5 bg-white border border-gray-200 text-gray-700 rounded-xl text-[13px] font-bold">
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className={cn(
                'flex-1 h-[44px] rounded-xl text-[13px] font-bold text-white',
                canSave ? 'bg-primary' : 'bg-gray-200 text-gray-400',
              )}
            >
              {isSaving ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
