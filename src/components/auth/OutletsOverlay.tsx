'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Loader2, MapPin, Plus, AlertCircle, X, Trash2, Pencil } from 'lucide-react';
import { useAddress } from '@/context/AddressContext';
import { isRealStreetAddress } from '@/lib/constants/customerProfile';
import {
  deliveryFromOutletAddress,
  OutletAddressForm,
  toBusinessValue,
  type OutletAddressValue,
} from '@/components/features/customer/OutletAddressForm';
import { fromBillingAndPickup, toCustomerOutletPayload, type AddressLine } from '@/lib/businessAddress';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { notifyAccountsRefresh } from '@/lib/addressUsability';
import { accountFacingName } from '@/lib/displayIdentity';
import { FormErrorBanner } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';

interface Outlet {
  id: string;
  name: string;
  code: string | null;
  addressLine: string;
  flatInfo: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  billingName?: string | null;
  isActive: boolean;
  requiresAddressUpdate: boolean;
}

type OutletDraft = {
  id?: string;
  name: string;
  /** Per-outlet Bill-To override (empty = use the account name). */
  billingName: string;
  addressLine: string;
  flatInfo: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

const EMPTY_DRAFT: OutletDraft = {
  name: '', billingName: '', addressLine: '', flatInfo: '', landmark: '',
  city: '', state: '', pincode: '',
  latitude: null, longitude: null, placeId: null,
};

function outletToDraft(o: Outlet): OutletDraft {
  return {
    id: o.id,
    name: o.name,
    billingName: o.billingName ?? '',
    addressLine: o.addressLine === 'Address pending — complete in account settings' ? '' : o.addressLine,
    flatInfo: o.flatInfo ?? '',
    landmark: o.landmark ?? '',
    city: o.city ?? '',
    state: o.state ?? '',
    pincode: o.pincode ?? '',
    latitude: o.latitude,
    longitude: o.longitude,
    placeId: o.placeId,
  };
}

interface OutletsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  /** When set, open the editor for this outlet after load. */
  initialOutletId?: string | null;
  /** Open directly on the create form (Add warehouse). */
  startInCreate?: boolean;
}

export function OutletsOverlay({
  isOpen,
  onClose,
  accountId,
  initialOutletId = null,
  startInCreate = false,
}: OutletsOverlayProps) {
  const confirm = useConfirm();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OutletDraft | null>(null); // null = closed, has .id = editing, no .id = creating
  const [accountBilling, setAccountBilling] = useState<AddressLine | null>(null);
  const { refresh: refreshAccounts, accounts } = useBusinessAccountSwitcher();
  const activeAccount = accounts.find((a) => a.id === accountId);
  const businessName = accountFacingName({
    displayName: activeAccount?.displayName,
    legalName: activeAccount?.legalName,
  });
  const { refreshAddresses } = useAddress();
  const openedInitialRef = useRef<string | null>(null);

  const afterMutation = () => {
    load();
    void refreshAccounts();
    void refreshAddresses();
    notifyAccountsRefresh();
  };

  const load = () => {
    if (!accountId) return;
    Promise.resolve().then(() => setLoading(true));
    // Account billing prefills the editor; failure just means an empty prefill.
    const billingLoaded = fetch(`/api/v1/account/${accountId}`)
      .then(async (r) => {
        const json = (await r.json()) as {
          success?: boolean;
          data?: {
            billingAddressLine?: string | null;
            billingCity?: string | null;
            billingState?: string | null;
            billingPincode?: string | null;
          };
        };
        if (!r.ok || !json.success || !json.data) return;
        setAccountBilling({
          addressLine: json.data.billingAddressLine ?? '',
          city: json.data.billingCity ?? '',
          state: json.data.billingState ?? '',
          pincode: json.data.billingPincode ?? '',
        });
      })
      .catch(() => undefined);
    fetch(`/api/v1/account/${accountId}/outlets`)
      .then(async (r) => {
        const json = await r.json();
        await billingLoaded;
        if (!r.ok || !json.success) {
          toast.error(json.error?.message ?? 'Could not load warehouses');
          return;
        }
        const list = json.data as Outlet[];
        setOutlets(list);
        if (
          initialOutletId &&
          openedInitialRef.current !== initialOutletId
        ) {
          const match = list.find((o) => o.id === initialOutletId);
          if (match) {
            openedInitialRef.current = initialOutletId;
            setEditing(outletToDraft(match));
            return;
          }
        }
        if (startInCreate && !initialOutletId && openedInitialRef.current !== '__create__') {
          openedInitialRef.current = '__create__';
          setEditing({ ...EMPTY_DRAFT });
        }
      })
      .catch(() => toast.error('Could not load warehouses'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      openedInitialRef.current = null;
      load();
    } else {
      setEditing(null);
      openedInitialRef.current = null;
    }
  }, [isOpen, accountId, initialOutletId, startInCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (outlet: Outlet) => {
    const ok = await confirm({
      title: 'Remove outlet?',
      message: `This will remove "${outlet.name}" from your delivery branches. You can add the same address again later if needed.`,
      confirmText: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    const res = await fetch(`/api/v1/account/${accountId}/outlets/${outlet.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((json as { error?: { message?: string } }).error?.message ?? 'Could not remove outlet');
      return;
    }
    setOutlets((prev) => prev.filter((o) => o.id !== outlet.id));
    toast.success('Outlet removed');
    afterMutation();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
      <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[600px] md:mt-[5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-[#F2F3F2] md:bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative bg-white border-b border-gray-100">
          <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10">
            <ChevronLeft size={20} className="text-[#181725]" />
          </button>
          <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">Outlets &amp; Delivery</h2>
          <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-5 pb-28 md:pb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold text-[#181725]">Active Branches ({outlets.length})</h3>
            <button
              onClick={() => setEditing({ ...EMPTY_DRAFT })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus size={14} />
              Add Outlet
            </button>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
          ) : outlets.length === 0 ? (
            <p className="text-[13px] text-[#666] py-12 text-center bg-white rounded-xl border border-gray-100">No outlets yet.</p>
          ) : (
            <ul className="space-y-3">
              {outlets.map((o) => (
                <li key={o.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-start gap-3 relative">
                  <div className="w-[36px] h-[36px] rounded-full bg-primary-light flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 pr-16">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-[700] text-[#181725]">{o.name}</p>
                      {o.code && <span className="text-[11px] text-[#AEAEAE] font-mono">{o.code}</span>}
                      {o.requiresAddressUpdate && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                          <AlertCircle size={10} />
                          Address needed
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-[#7C7C7C] leading-normal mt-1">{o.addressLine}</p>
                    <p className="text-[11.5px] text-[#AEAEAE] mt-0.5">
                      {[o.city, o.state, o.pincode].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="absolute right-4 top-4 flex items-center gap-1">
                    <button
                      onClick={() => setEditing(outletToDraft(o))}
                      className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                      title="Edit outlet"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(o)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                      title="Remove outlet"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && (
        <OutletEditorModal
          accountId={accountId}
          draft={editing}
          businessName={businessName}
          legalName={activeAccount?.legalName || businessName}
          accountBilling={accountBilling}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); afterMutation(); }}
        />
      )}
    </div>
  );
}

function initialEditorValue(
  draft: OutletDraft,
  businessName: string,
  accountBilling: AddressLine | null,
  legalName?: string,
): OutletAddressValue {
  const line = isRealStreetAddress(draft.addressLine) ? draft.addressLine : '';
  const delivery: AddressLine = {
    addressLine: line,
    city: draft.city,
    state: draft.state,
    pincode: draft.pincode,
  };
  const hasBilling = Boolean(accountBilling?.addressLine.trim());
  // Billing: saved account billing, else (editing) the outlet's own address.
  const billing: AddressLine = hasBilling && accountBilling
    ? accountBilling
    : delivery;
  const merged = fromBillingAndPickup(billing, delivery, {
    locationName: draft.name,
    // Outlet override first; invoice Bill-To defaults to legal name.
    billingName: draft.billingName || legalName || businessName,
  });
  // New outlet with saved billing: keep billing prefilled but let delivery differ.
  const sameAsBilling = draft.id || !hasBilling ? merged.sameAsBilling : false;
  return {
    outletName: merged.locationName,
    billingName: merged.billingName,
    billingAddressLine: merged.billingAddressLine,
    billingCity: merged.billingCity,
    billingState: merged.billingState,
    billingPincode: merged.billingPincode,
    sameAsBilling,
    addressLine: sameAsBilling ? merged.addressLine : delivery.addressLine,
    city: sameAsBilling ? merged.city : delivery.city,
    state: sameAsBilling ? merged.state : delivery.state,
    pincode: sameAsBilling ? merged.pincode : delivery.pincode,
  };
}

function OutletEditorModal({ accountId, draft, businessName, legalName, accountBilling, onClose, onSaved }: {
  accountId: string;
  draft: OutletDraft;
  businessName: string;
  legalName: string;
  accountBilling: AddressLine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!draft.id;
  const { setSelectedAddress } = useAddress();
  const [value, setValue] = useState<OutletAddressValue>(() =>
    initialEditorValue(draft, businessName, accountBilling, legalName),
  );
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const delivery = deliveryFromOutletAddress(value);
  const canSave = value.outletName.trim().length >= 2 && isRealStreetAddress(delivery.addressLine);

  const submit = async () => {
    if (submittingRef.current || !canSave) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const url = isEdit
        ? `/api/v1/account/${accountId}/outlets/${draft.id}`
        : `/api/v1/account/${accountId}/outlets`;
      const method = isEdit ? 'PATCH' : 'POST';
      const { companyProfile, outlet: outletPayload } = toCustomerOutletPayload(
        toBusinessValue(value),
        { accountLegalName: businessName },
      );
      const body = {
        name: value.outletName.trim(),
        addressLine: delivery.addressLine.trim(),
        flatInfo: draft.flatInfo.trim() || null,
        landmark: draft.landmark.trim() || null,
        city: delivery.city.trim() || null,
        state: delivery.state.trim() || null,
        pincode: delivery.pincode.trim() || null,
        // Outlet Bill-To override (null when blank / same as the account name).
        billingName: outletPayload.billingName,
        // Account billing address — persisted on BusinessAccount.billing*.
        billingAddressLine: companyProfile.billingAddressLine || null,
        billingCity: companyProfile.billingCity || null,
        billingState: companyProfile.billingState || null,
        billingPincode: companyProfile.billingPincode || null,
        ...(draft.latitude !== null && draft.longitude !== null && { latitude: draft.latitude, longitude: draft.longitude }),
        ...(draft.placeId !== null && { placeId: draft.placeId }),
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        const msg = json.error?.message ?? 'Could not save outlet';
        setError(msg);
        toast.error(msg);
        return;
      }

      if (/^\d{6}$/.test(delivery.pincode)) {
        setSelectedAddress({
          id: `outlet_${json.data.id}`,
          label: value.outletName.trim() || 'Outlet',
          businessName: value.billingName.trim() || businessName,
          fullAddress: delivery.addressLine.trim(),
          shortAddress: [delivery.city, delivery.state].filter(Boolean).join(', ') || delivery.addressLine.trim().split(',').slice(0, 2).join(','),
          latitude: draft.latitude ?? 0,
          longitude: draft.longitude ?? 0,
          flatInfo: draft.flatInfo.trim() || undefined,
          landmark: draft.landmark.trim() || undefined,
          pincode: delivery.pincode.trim(),
          city: delivery.city.trim() || undefined,
          state: delivery.state.trim() || undefined,
          placeId: draft.placeId ?? undefined,
          isDefault: false,
        });
      }
      onSaved();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[15000] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-[500px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#181725]">
            {isEdit ? `Edit Outlet — ${draft.name || 'untitled'}` : 'Add Outlet'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <FormErrorBanner message={error} className="mx-5" />

        <div className="p-5 overflow-y-auto flex-1">
          <OutletAddressForm value={value} onChange={setValue} businessName={businessName} />
        </div>

        <div className="p-4 border-t border-[#F0F0F0] flex items-center justify-end gap-2 shrink-0 bg-[#F9F9F9]">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-[13px] font-semibold text-[#666] hover:bg-gray-50 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !canSave}
            className="px-4 py-2 bg-primary text-white text-[13px] font-bold rounded-xl hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create Outlet'}
          </button>
        </div>
      </div>
    </div>
  );
}

