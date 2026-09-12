'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, MapPin, Plus, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { OutletsOverlay } from '@/components/auth/OutletsOverlay';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { kindFromFlags, type BusinessKind } from '@/lib/businessCapability';
import { cn } from '@/lib/utils';

type OutletRow = {
  id: string;
  name: string;
  addressLine: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  isActive: boolean;
  requiresAddressUpdate?: boolean;
};

type HubAccount = {
  id: string;
  legalName: string;
  displayName: string | null;
  gstin: string | null;
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
  capability?: BusinessKind;
};

export default function BuyerBusinessOutletsPage() {
  const params = useParams();
  const router = useRouter();
  const businessId = typeof params?.id === 'string' ? params.id : '';
  const { switchAccount, switching } = useBusinessAccountSwitcher();

  const [account, setAccount] = useState<HubAccount | null>(null);
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [startInCreate, setStartInCreate] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const [accRes, outRes] = await Promise.all([
        fetch('/api/v1/account'),
        fetch(`/api/v1/account/${businessId}/outlets`),
      ]);
      const accJson = await accRes.json();
      const outJson = await outRes.json();
      if (!accJson.success) {
        toast.error(accJson.error?.message ?? 'Failed to load business');
        return;
      }
      const rows = accJson.data as HubAccount[];
      const found = rows.find((a) => a.id === businessId) ?? null;
      setAccount(found);
      if (!found) {
        toast.error('Business not found');
        return;
      }
      const kind = found.capability ?? kindFromFlags(found);
      if (kind === 'vendor') {
        router.replace(`/vendor/businesses/${businessId}`);
        return;
      }
      if (kind === 'brand') {
        await switchAccount(businessId, undefined, { redirect: false });
        window.location.assign('/brand/portal');
        return;
      }
      if (outJson.success && Array.isArray(outJson.data)) {
        setOutlets(outJson.data as OutletRow[]);
      }
    } catch {
      toast.error('Failed to load outlets');
    } finally {
      setLoading(false);
    }
  }, [businessId, router, switchAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  const startOrdering = async (outletId: string) => {
    setStartingId(outletId);
    try {
      await switchAccount(businessId, outletId, { redirect: false });
      window.location.assign('/');
    } catch {
      toast.error('Could not start ordering');
      setStartingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="max-w-[720px] mx-auto text-center py-12">
        <p className="text-[13px] text-[#7C7C7C] mb-3">Business not found.</p>
        <Link href="/businesses" className="text-[13px] font-bold text-primary">
          ← My Businesses
        </Link>
      </div>
    );
  }

  const title = account.displayName || account.legalName;

  return (
    <div className="fluid-container py-[clamp(1.25rem,3vw,2.5rem)] space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link
            href="/businesses"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-dark min-h-11"
          >
            <ArrowLeft size={14} />
            My Businesses
          </Link>
          <h1 className="text-[clamp(1.35rem,2vw+0.6rem,1.85rem)] font-bold text-primary leading-tight mt-0.5 text-balance">
            {title}
          </h1>
          <p className="text-[13px] text-text-secondary mt-1">
            {outlets.filter((o) => o.isActive).length} of {outlets.length} outlets receive deliveries
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setStartInCreate(true);
            setOverlayOpen(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 min-h-12 px-4 bg-primary hover:bg-primary-dark text-white text-[13px] font-bold rounded-[12px] w-full sm:w-auto active:scale-[0.97] transition-transform"
        >
          <Plus size={16} />
          Add outlet
        </button>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-[clamp(1.05rem,1.4vw+0.7rem,1.25rem)] font-bold text-primary">Outlets</h2>
          <p className="text-[13px] text-text-secondary mt-0.5">
            Start ordering from the marketplace with one outlet active.
          </p>
        </div>

        {outlets.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-divider bg-white px-5 py-10 text-center">
            <MapPin size={22} className="mx-auto text-primary mb-2" />
            <p className="text-[15px] font-bold text-text">No outlets yet</p>
            <p className="text-[13px] text-text-muted mt-1 text-pretty">Add a branch so deliveries have somewhere to go.</p>
            <button
              type="button"
              onClick={() => {
                setStartInCreate(true);
                setOverlayOpen(true);
              }}
              className="inline-flex items-center gap-1 mt-4 min-h-12 px-4 text-[13px] font-bold text-primary hover:bg-primary-light rounded-[12px]"
            >
              <Plus size={14} />
              Add outlet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {outlets.map((o) => (
              <div
                key={o.id}
                className="bg-white border border-primary/[0.12] rounded-[16px] p-5 flex flex-col"
              >
                <div className="size-10 rounded-[10px] bg-primary-light flex items-center justify-center mb-3">
                  <MapPin size={18} className="text-primary" />
                </div>
                <p className="font-semibold text-[16px] text-text truncate">{o.name}</p>
                <p className="text-[13px] text-text-secondary mt-1 line-clamp-2 text-pretty">
                  {o.addressLine || 'Address not added yet'}
                </p>
                <p className="text-[12px] text-text-muted tabular-nums mt-1">{o.pincode || '—'}</p>
                <button
                  type="button"
                  disabled={switching || startingId === o.id}
                  onClick={() => void startOrdering(o.id)}
                  className={cn(
                    'mt-4 inline-flex items-center justify-center gap-2 min-h-12 px-4 text-[13px] font-bold text-white bg-primary hover:bg-primary-dark rounded-[12px] disabled:opacity-50 active:scale-[0.97] transition-transform',
                  )}
                >
                  {startingId === o.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ShoppingBag size={14} />
                  )}
                  Start ordering
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {overlayOpen && (
        <OutletsOverlay
          isOpen={overlayOpen}
          accountId={businessId}
          startInCreate={startInCreate}
          onClose={() => {
            setOverlayOpen(false);
            setStartInCreate(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
