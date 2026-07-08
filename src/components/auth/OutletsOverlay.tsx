'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, MapPin, Plus, AlertCircle, X, Trash2, Pencil } from 'lucide-react';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { useAddress } from '@/context/AddressContext';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { notifyAccountsRefresh } from '@/lib/addressUsability';
import { cn } from '@/lib/utils';
import { FormErrorBanner } from '@/components/ui/form';
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
  isActive: boolean;
  requiresAddressUpdate: boolean;
}

type OutletDraft = {
  id?: string;
  name: string;
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
  name: '', addressLine: '', flatInfo: '', landmark: '',
  city: '', state: '', pincode: '',
  latitude: null, longitude: null, placeId: null,
};

function outletToDraft(o: Outlet): OutletDraft {
  return {
    id: o.id,
    name: o.name,
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
}

export function OutletsOverlay({ isOpen, onClose, accountId }: OutletsOverlayProps) {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OutletDraft | null>(null); // null = closed, has .id = editing, no .id = creating
  const { refresh: refreshAccounts } = useBusinessAccountSwitcher();
  const { refreshAddresses } = useAddress();

  const afterMutation = () => {
    load();
    void refreshAccounts();
    void refreshAddresses();
    notifyAccountsRefresh();
  };

  const load = () => {
    if (!accountId) return;
    Promise.resolve().then(() => setLoading(true));
    fetch(`/api/v1/account/${accountId}/outlets`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setOutlets(json.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (outletId: string) => {
    if (!confirm('Deactivate this outlet?')) return;
    const res = await fetch(`/api/v1/account/${accountId}/outlets/${outletId}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((json as { error?: { message?: string } }).error?.message ?? 'Could not remove outlet');
      return;
    }
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#53B175] text-white text-[12px] font-bold rounded-lg hover:bg-[#48a068] transition-colors"
            >
              <Plus size={14} />
              Add Outlet
            </button>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-[#53B175]" /></div>
          ) : outlets.length === 0 ? (
            <p className="text-[13px] text-[#666] py-12 text-center bg-white rounded-xl border border-gray-100">No outlets yet.</p>
          ) : (
            <ul className="space-y-3">
              {outlets.map((o) => (
                <li key={o.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-start gap-3 relative">
                  <div className="w-[36px] h-[36px] rounded-full bg-[#E8F5E9] flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={16} className="text-[#53B175]" />
                  </div>
                  <div className="flex-1 min-w-0 pr-16">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-[700] text-[#181725]">{o.name}</p>
                      {o.code && <span className="text-[11px] text-[#AEAEAE] font-mono">{o.code}</span>}
                      {!o.isActive && <span className="text-[10px] uppercase font-bold text-[#AEAEAE]">inactive</span>}
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
                      onClick={() => handleDelete(o.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                      title="Deactivate"
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
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); afterMutation(); }}
        />
      )}
    </div>
  );
}

function OutletEditorModal({ accountId, draft, onClose, onSaved }: {
  accountId: string; draft: OutletDraft; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!draft.id;
  const { setSelectedAddress } = useAddress();
  const [name, setName] = useState(draft.name);
  const [addressLine, setAddressLine] = useState(draft.addressLine);
  const [flatInfo, setFlatInfo] = useState(draft.flatInfo);
  const [landmark, setLandmark] = useState(draft.landmark);
  const [city, setCity] = useState(draft.city);
  const [state, setState] = useState(draft.state);
  const [pincode, setPincode] = useState(draft.pincode);
  const [latitude, setLatitude] = useState<number | null>(draft.latitude);
  const [longitude, setLongitude] = useState<number | null>(draft.longitude);
  const [placeId, setPlaceId] = useState<string | null>(draft.placeId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill city & state when a valid 6-digit pincode is typed manually
  useEffect(() => {
    if (!/^\d{6}$/.test(pincode)) return;
    if (city.trim() && state.trim()) return; // already filled (e.g. via map picker)
    fetch(`https://api.postalpincode.in/pincode/${pincode}`)
      .then((r) => r.json())
      .then((data) => {
        const po = data?.[0]?.PostOffice?.[0];
        if (!po) return;
        if (!city.trim()) setCity(po.District || po.Division || '');
        if (!state.trim()) setState(po.State || '');
      })
      .catch(() => {});
  }, [pincode]); // eslint-disable-line react-hooks/exhaustive-deps

  const pincodeValid = /^\d{6}$/.test(pincode);
  const hasCoords = latitude !== null && longitude !== null;

  const handlePick = (place: import('@/components/ui/AddressAutocomplete').AddressPickPayload) => {
    setAddressLine(place.fullAddress);
    setCity(place.city);
    setState(place.state);
    setPincode(place.pincode);
    setLatitude(place.latitude);
    setLongitude(place.longitude);
    setPlaceId(place.placeId);
    if (!name.trim() && place.businessName) setName(place.businessName);
  };

  const submit = async () => {
    setSubmitting(true); setError(null);
    const url = isEdit
      ? `/api/v1/account/${accountId}/outlets/${draft.id}`
      : `/api/v1/account/${accountId}/outlets`;
    const method = isEdit ? 'PATCH' : 'POST';
    const body = {
      name: name.trim(),
      addressLine: addressLine.trim(),
      flatInfo: flatInfo.trim() || null,
      landmark: landmark.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      pincode: pincode.trim() || null,
      // Only include coords when present — API schema uses .optional(), not .nullable()
      ...(latitude !== null && longitude !== null && { latitude, longitude }),
      ...(placeId !== null && { placeId }),
    };
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!json.success) {
      const msg = json.error?.message ?? 'Could not save outlet';
      setError(msg);
      toast.error(msg);
      return;
    }

    if (hasCoords && pincodeValid) {
      setSelectedAddress({
        id: `outlet_${json.data.id}`,
        label: name.trim() || 'Outlet',
        businessName: name.trim(),
        fullAddress: addressLine.trim(),
        shortAddress: [city, state].filter(Boolean).join(', ') || addressLine.trim().split(',').slice(0, 2).join(','),
        latitude: latitude!,
        longitude: longitude!,
        flatInfo: flatInfo.trim() || undefined,
        landmark: landmark.trim() || undefined,
        pincode: pincode.trim(),
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        placeId: placeId ?? undefined,
        isDefault: false,
      });
    }
    onSaved();
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

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <AddressAutocomplete
            label="Pick from map"
            placeholder="Search address or business name…"
            businessMode
            hint="Picking a place fills the address, city, state and pincode for you."
            onPick={handlePick}
          />

          <Field
            label="Outlet name"
            value={name}
            onChange={setName}
            placeholder="e.g. Eve Powai"
            required
          />
          <Field
            label="Address line 1"
            value={addressLine}
            onChange={setAddressLine}
            placeholder="House / building / street"
            required
          />
          <Field
            label="Apartment, floor (optional)"
            value={flatInfo}
            onChange={setFlatInfo}
            placeholder="Flat 4B, 2nd floor"
          />
          <Field
            label="Landmark (optional)"
            value={landmark}
            onChange={setLandmark}
            placeholder="Near metro station"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={city} onChange={setCity} placeholder="e.g. Mumbai" />
            <Field label="State" value={state} onChange={setState} placeholder="e.g. Maharashtra" />
          </div>
          <div>
            <Field
              label="Pincode (6 digits)"
              value={pincode}
              onChange={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="e.g. 400076"
              inputMode="numeric"
              required
            />
            {!pincodeValid && pincode.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-700">Enter a 6-digit pincode.</p>
            )}
            {pincodeValid && (
              <p className="mt-1 text-[11px] text-emerald-700">
                ✓ Pincode set — &quot;Address needed&quot; flag will clear after save.
              </p>
            )}
          </div>

          {hasCoords && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5 flex items-center gap-2">
              <MapPin size={14} className="text-emerald-700 shrink-0" />
              <p className="text-[11.5px] text-emerald-900/80">
                Map location captured · {latitude!.toFixed(5)}, {longitude!.toFixed(5)}
              </p>
            </div>
          )}

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
            disabled={submitting || !name.trim() || !addressLine.trim()}
            className="px-4 py-2 bg-[#53B175] text-white text-[13px] font-bold rounded-xl hover:bg-[#48a068] disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create Outlet'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, inputMode }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-[#AEAEAE] uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full px-3.5 py-2.5 text-[13px] border border-[#EEEEEE] rounded-xl outline-none focus:border-[#53B175] focus:ring-2 focus:ring-[#53B175]/10 text-gray-700 placeholder:text-gray-400 bg-[#FAFAFA] focus:bg-white transition-all"
      />
    </label>
  );
}
