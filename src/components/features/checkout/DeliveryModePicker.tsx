'use client';

import { useEffect, useState } from 'react';
import { Loader2, Truck, Bike, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DeliveryModeValue = 'supplier_delivery' | 'third_party' | 'self_pickup';

export type DeliveryModeSelection = {
  mode: DeliveryModeValue;
  deliveryDate: string | null;
};

type ModeCard = {
  mode: DeliveryModeValue;
  title: string;
  description: string;
  deliveryDate: string | null;
};

interface DeliveryModePickerProps {
  vendorId: string;
  pincode: string | null;
  selected: DeliveryModeSelection | null;
  onChange: (sel: DeliveryModeSelection | null) => void;
}

const ICONS: Record<DeliveryModeValue, typeof Truck> = {
  supplier_delivery: Truck,
  third_party: Bike,
  self_pickup: Package,
};

export function DeliveryModePicker({
  vendorId,
  pincode,
  selected,
  onChange,
}: DeliveryModePickerProps) {
  const [modes, setModes] = useState<ModeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!pincode) {
      queueMicrotask(() => {
        setModes([]);
        setLoading(false);
        setError('Set a delivery pincode to see delivery options.');
        onChange(null);
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    fetch(`/api/v1/vendors/${vendorId}/delivery-plan?pincode=${encodeURIComponent(pincode)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list: ModeCard[] = Array.isArray(json?.data?.modes) ? json.data.modes : [];
        setModes(list);
        if (list.length === 0) {
          setError('No delivery options available for this pincode.');
          onChange(null);
          return;
        }
        // Keep selection if still valid; otherwise pick first mode and stamp its date.
        const stillValid = selected && list.some((m) => m.mode === selected.mode);
        if (stillValid && selected) {
          const match = list.find((m) => m.mode === selected.mode)!;
          if (selected.deliveryDate !== match.deliveryDate) {
            onChange({ mode: match.mode, deliveryDate: match.deliveryDate });
          }
        } else {
          onChange({ mode: list[0].mode, deliveryDate: list[0].deliveryDate });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModes([]);
          setError('Could not load delivery options.');
          onChange(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Intentionally omit selected/onChange to avoid refetch loops — pincode+vendor drive load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, pincode]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-[12px] text-gray-400">
        <Loader2 size={14} className="animate-spin" />
        Loading delivery options…
      </div>
    );
  }

  if (error || modes.length === 0) {
    return (
      <div className="px-3 py-2.5 text-[12px] text-[#DC2626] bg-[#FEF2F2] rounded-xl">
        {error || 'No delivery options available for this pincode.'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
        Delivery mode
      </p>
      <div className="space-y-2">
        {modes.map((m) => {
          const Icon = ICONS[m.mode];
          const active = selected?.mode === m.mode;
          return (
            <button
              key={m.mode}
              type="button"
              onClick={() => onChange({ mode: m.mode, deliveryDate: m.deliveryDate })}
              className={cn(
                'w-full text-left rounded-[12px] border px-3 py-2.5 transition-colors',
                active
                  ? 'border-[#6B1D2E] bg-[#F8E8EC]'
                  : 'border-[#EEEEEE] bg-white hover:border-[#6B1D2E]/30',
              )}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    active ? 'bg-[#6B1D2E] text-white' : 'bg-[#FAF7F2] text-[#6B1D2E]',
                  )}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[#181725]">{m.title}</p>
                  <p className="text-[11px] text-[#667085] leading-snug mt-0.5">{m.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
