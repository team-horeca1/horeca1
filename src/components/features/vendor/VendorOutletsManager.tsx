'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Building2, Loader2, MapPin, Pencil, Plus, Settings } from 'lucide-react';
import { OutletsOverlay } from '@/components/auth/OutletsOverlay';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';

export interface VendorOutletSummary {
  id: string;
  name: string;
  code: string | null;
  addressLine: string;
  city: string | null;
  pincode: string | null;
  isPrimary?: boolean;
  serviceAreaCount?: number;
  totalQty?: number;
}

interface Props {
  /** When true, show compact list only (no page title). */
  embedded?: boolean;
}

/** In-portal outlet list with add/edit via account outlets overlay. */
export function VendorOutletsManager({ embedded = false }: Props) {
  const searchParams = useSearchParams();
  const { currentAccount } = useBusinessAccountSwitcher();
  const [outlets, setOutlets] = useState<VendorOutletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [editOutletId, setEditOutletId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setEditOutletId(null);
      setShowOverlay(true);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/outlets');
      const json = await res.json();
      if (json.success) setOutlets(json.data.outlets ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'max-w-[800px] pb-10 space-y-6'}>
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold text-[#181725]">Outlets &amp; warehouses</h1>
            <p className="text-[13px] text-[#7C7C7C] mt-1 max-w-lg">
              Set each warehouse address and delivery pincodes here. Inventory and the sidebar Warehouse page use the active warehouse from the bar above.
            </p>
          </div>
          {currentAccount && (
            <button
              type="button"
              onClick={() => {
                setEditOutletId(null);
                setShowOverlay(true);
              }}
              className="inline-flex items-center gap-2 h-[40px] px-4 rounded-[10px] bg-primary text-white text-[13px] font-bold"
            >
              <Plus size={16} />
              Add outlet
            </button>
          )}
        </div>
      )}

      {outlets.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-10 text-center">
          <Building2 className="mx-auto text-[#AEAEAE] mb-3" size={32} />
          <p className="text-[14px] font-bold text-[#181725]">No outlets yet</p>
          <p className="text-[12px] text-[#7C7C7C] mt-1">Add your first warehouse to enable multi-location operations.</p>
          {currentAccount && (
            <button
              type="button"
              onClick={() => setShowOverlay(true)}
              className="mt-4 inline-flex items-center gap-2 h-[40px] px-4 rounded-[10px] bg-primary text-white text-[13px] font-bold"
            >
              <Plus size={16} />
              Add warehouse
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {outlets.map((o) => (
            <li
              key={o.id}
              className="bg-white rounded-[14px] border border-[#EEEEEE] p-5 flex flex-wrap gap-4 items-start justify-between"
            >
              <div className="flex gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-success-light flex items-center justify-center shrink-0">
                  <MapPin size={18} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-[15px] font-bold text-[#181725]">{o.name}</h2>
                    {o.isPrimary && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-success-light text-success">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#7C7C7C] mt-1 line-clamp-2">{o.addressLine}</p>
                  <p className="text-[11px] text-[#AEAEAE] mt-0.5">
                    {[o.city, o.pincode].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-[11px] text-primary font-semibold mt-2">
                    {o.serviceAreaCount ?? 0} delivery pin{(o.serviceAreaCount ?? 0) === 1 ? '' : 's'} · {o.totalQty ?? 0} units in stock
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditOutletId(o.id);
                    setShowOverlay(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#181725] border border-[#EEEEEE] rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <Pencil size={14} />
                  Edit address
                </button>
                <Link
                  href={`/vendor/settings?tab=delivery&outletId=${o.id}`}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#181725] border border-[#EEEEEE] rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <Settings size={14} />
                  Delivery pins
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {currentAccount && (
        <OutletsOverlay
          isOpen={showOverlay}
          onClose={() => {
            setShowOverlay(false);
            setEditOutletId(null);
            void load();
          }}
          accountId={currentAccount.id}
          initialOutletId={editOutletId}
          startInCreate={editOutletId == null}
        />
      )}
    </div>
  );
}
