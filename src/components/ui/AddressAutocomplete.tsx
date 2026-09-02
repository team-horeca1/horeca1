'use client';

/**
 * AddressAutocomplete — drop-in Google Places autocomplete with a dropdown.
 *
 * Use anywhere you want the user to pick an address from the map and get back
 * fully-resolved details (lat/lng, pincode, city, state, formatted address).
 *
 * Picking a prediction calls `onPick` with a PlaceDetails-like payload. Parent
 * decides how to plug the values into its own form fields.
 *
 * Reuses the existing `useGooglePlacesAutocomplete` hook so it inherits the
 * same debouncing, session-token cost optimization, and India-restricted
 * filtering used elsewhere in the app.
 *
 * The results list is rendered through a PORTAL pinned to the viewport. Inside
 * a modal the scrollable body has `overflow:auto`, which used to clip an
 * absolutely-positioned dropdown — so admins typed an address and saw nothing.
 * Portalling to <body> with fixed positioning (and a z-index above every modal)
 * makes the suggestions reliable in every form.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { useGooglePlacesAutocomplete, type PlaceDetails } from '@/hooks/useGooglePlacesAutocomplete';
import { LABEL_CLASS, inputClass } from '@/components/ui/form';
import { cn } from '@/lib/utils';

export interface AddressPickPayload {
  fullAddress: string;
  shortAddress: string;
  latitude: number;
  longitude: number;
  pincode: string;
  city: string;
  state: string;
  placeId: string;
  businessName?: string;
}

interface Props {
  label?: string;
  placeholder?: string;
  initialValue?: string;
  onPick: (place: AddressPickPayload) => void;
  /** When true: prefer hospitality businesses in the dropdown (restaurants/hotels). */
  businessMode?: boolean;
  /** Optional className for the outer wrapper. */
  className?: string;
  /** Tell the user what this picker is for (small helper text under the input). */
  hint?: string;
}

export function AddressAutocomplete({
  label = 'Search address',
  placeholder = 'Type your address or business name…',
  initialValue = '',
  onPick,
  businessMode = false,
  className = '',
  hint,
}: Props) {
  const [query, setQuery] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { predictions, isSearching, getPlaceDetails, clearPredictions } =
    useGooglePlacesAutocomplete(query, { businessMode });

  // Sync with initialValue if it changes from the parent
  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  const showDropdown = open && predictions.length > 0;

  // Position the portalled list directly under the input. Recompute on scroll
  // (capture:true catches scrolling inside a modal body) and on resize so the
  // list tracks the input even while the user scrolls the form.
  useEffect(() => {
    if (!showDropdown) return;
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showDropdown, predictions.length]);

  // Close on outside click — the portalled list lives outside wrapRef, so it
  // must be treated as "inside" or clicking a suggestion would close the list
  // before the pick fires.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handlePick = async (placeId: string, mainText: string) => {
    setPickingId(placeId);
    try {
      const details: PlaceDetails | null = await getPlaceDetails(placeId);
      if (!details) return;
      setQuery(details.shortAddress || mainText);
      clearPredictions();
      setOpen(false);
      onPick({
        fullAddress: details.fullAddress,
        shortAddress: details.shortAddress,
        latitude: details.latitude,
        longitude: details.longitude,
        pincode: details.pincode || '',
        city: details.city || '',
        state: details.state || '',
        placeId: details.placeId,
        businessName: details.businessName,
      });
    } finally {
      setPickingId(null);
    }
  };

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <label className="block">
        {label && <span className={LABEL_CLASS}>{label}</span>}
        <div className="relative group">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AEAEAE] group-focus-within:text-primary transition-colors z-10" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={inputClass(false, 'pl-10 pr-10')}
          />
          {isSearching && (
            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AEAEAE] animate-spin" />
          )}
        </div>
      </label>
      {hint && <p className="mt-1 text-[11px] text-[#AEAEAE]">{hint}</p>}

      {showDropdown && rect && typeof document !== 'undefined' && createPortal(
        <ul
          ref={listRef}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-[20000] max-h-[260px] overflow-y-auto bg-white border border-[#EEEEEE] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {predictions.map((p) => {
            const isPicking = pickingId === p.placeId;
            return (
              <li key={p.placeId}>
                <button
                  type="button"
                  onClick={() => handlePick(p.placeId, p.mainText)}
                  disabled={isPicking}
                  className="w-full text-left px-4 py-3 hover:bg-success-light/50 flex items-start gap-2.5 disabled:opacity-50 transition-colors border-b border-[#F9F9F9] last:border-b-0"
                >
                  <MapPin size={14} className="text-primary mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#181725] truncate">{p.mainText}</span>
                    <span className="block text-[11px] text-[#AEAEAE] truncate">{p.secondaryText}</span>
                  </span>
                  {isPicking && <Loader2 size={12} className="animate-spin text-[#AEAEAE] mt-1" />}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}
