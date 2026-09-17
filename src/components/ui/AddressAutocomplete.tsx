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

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Search, Loader2, X } from 'lucide-react';
import { useGooglePlacesAutocomplete, type PlaceDetails } from '@/hooks/useGooglePlacesAutocomplete';
import { useGoogleMaps } from '@/components/providers/GoogleMapsProvider';
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
  const [hasPicked, setHasPicked] = useState(() => initialValue.trim().length > 0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { loadError } = useGoogleMaps();
  const { predictions, isSearching, getPlaceDetails, clearPredictions } =
    useGooglePlacesAutocomplete(query, { businessMode });

  // Sync with initialValue if it changes from the parent
  useEffect(() => {
    setQuery(initialValue);
    if (initialValue.trim().length > 0) {
      queueMicrotask(() => setHasPicked(true));
    }
  }, [initialValue]);

  const showDropdown = open && predictions.length > 0;

  // Smart dropdown positioning for mobile and desktop
  const updatePosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - r.bottom;
    const spaceAbove = r.top;
    const showAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

    // Constrain width to viewport if needed (prevent horizontal scroll on mobile)
    const width = Math.min(r.width, viewportWidth - 24);
    const left = Math.max(12, Math.min(r.left, viewportWidth - width - 12));
    const maxHeight = Math.min(280, Math.max(160, showAbove ? spaceAbove - 20 : spaceBelow - 20));

    setDropdownStyle({
      position: 'fixed',
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
      ...(showAbove
        ? { bottom: `${Math.max(8, viewportHeight - r.top + 4)}px`, top: 'auto' }
        : { top: `${Math.max(8, r.bottom + 4)}px`, bottom: 'auto' }),
    });
  }, []);

  useEffect(() => {
    if (!showDropdown) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showDropdown, predictions.length, updatePosition]);

  // Close on outside pointerdown (supports touchscreens, mouse, and pen)
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const handlePick = async (placeId: string, mainText: string) => {
    setPickingId(placeId);
    try {
      const details: PlaceDetails | null = await getPlaceDetails(placeId);
      if (!details) return;
      setQuery(details.shortAddress || details.fullAddress || mainText);
      setHasPicked(true);
      clearPredictions();
      setOpen(false);
      onPick({
        fullAddress: details.fullAddress || details.shortAddress || mainText,
        shortAddress: details.shortAddress || details.fullAddress || mainText,
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

  const handleClear = () => {
    setQuery('');
    setHasPicked(false);
    clearPredictions();
    setOpen(false);
    inputRef.current?.focus();
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
            onChange={(e) => {
              setQuery(e.target.value);
              setHasPicked(false);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              if (predictions.length > 0) updatePosition();
            }}
            placeholder={placeholder}
            disabled={!!loadError}
            className={inputClass(false, 'pl-10 pr-16')}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10">
            {isSearching && (
              <Loader2 size={14} className="text-[#AEAEAE] animate-spin" />
            )}
            {query.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear address search"
                className="p-1 rounded-full text-[#AEAEAE] hover:text-[#181725] hover:bg-gray-100 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </label>
      {loadError ? (
        <p className="mt-1 text-[11px] text-[#DC2626]">
          {loadError}. Address search is unavailable until Google Maps loads.
        </p>
      ) : isSearching ? (
        <p className="mt-1 text-[11px] text-[#667085] flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin text-primary shrink-0" />
          Searching matching places and addresses…
        </p>
      ) : query.trim().length >= 2 && !hasPicked ? (
        predictions.length > 0 ? (
          <p className="mt-1 text-[11px] text-primary font-medium">
            Tap a suggestion from the list to auto-fill address details.
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-[#667085]">
            No matching places found. You can enter your address manually below.
          </p>
        )
      ) : hint ? (
        <p className="mt-1 text-[11px] text-[#AEAEAE]">{hint}</p>
      ) : null}

      {showDropdown && dropdownStyle && typeof document !== 'undefined' && createPortal(
        <ul
          ref={listRef}
          style={dropdownStyle}
          className="z-[20000] overflow-y-auto bg-white border border-[#EEEEEE] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-top-1 duration-150 overscroll-contain"
        >
          {predictions.map((p) => {
            const isPicking = pickingId === p.placeId;
            return (
              <li key={p.placeId}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePick(p.placeId, p.mainText)}
                  disabled={isPicking}
                  className="w-full text-left px-4 py-3.5 hover:bg-success-light/50 active:bg-success-light/70 flex items-start gap-2.5 disabled:opacity-50 transition-colors border-b border-[#F9F9F9] last:border-b-0 touch-manipulation cursor-pointer"
                >
                  <MapPin size={14} className="text-primary mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#181725] truncate">{p.mainText}</span>
                    <span className="block text-[11px] text-[#AEAEAE] truncate">{p.secondaryText}</span>
                  </span>
                  {isPicking && <Loader2 size={12} className="animate-spin text-[#AEAEAE] mt-1 shrink-0" />}
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
