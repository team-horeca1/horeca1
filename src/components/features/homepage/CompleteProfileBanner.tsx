'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { X, Sparkles, MapPin, Briefcase } from 'lucide-react';
import { useAddress } from '@/context/AddressContext';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'horeca1:profile-nudge-dismissed-until';

type ProfileStatus = {
  isComplete: boolean;
  hasCorePersonalization: boolean;
  fields: {
    fullName: boolean;
    phone: boolean;
    pincode: boolean;
    businessName: boolean;
    gstNumber: boolean;
  };
};

export function CompleteProfileBanner() {
  const { data: session, status } = useSession();
  const { selectedAddress, savedAddresses } = useAddress();
  const [data, setData] = useState<ProfileStatus | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (status !== 'authenticated') return;
    // Admins don't need to complete a customer profile
    if ((session?.user as { role?: string })?.role === 'admin') return;

    const until = typeof window !== 'undefined' ? window.localStorage.getItem(DISMISS_KEY) : null;
    if (until && Number(until) > Date.now()) return;

    let cancelled = false;
    fetch('/api/v1/me/profile', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.success) return;
        setData(json.data);
        // Hide banner when user has core info (name + business + pincode), even if profileCompletedAt isn't explicitly set
        if (!json.data.isComplete && !json.data.hasCorePersonalization) {
          setHidden(false);
        } else {
          setHidden(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, selectedAddress, savedAddresses]);

  if (hidden || !data || data.isComplete || data.hasCorePersonalization) return null;

  const snooze = () => {
    if (typeof window === 'undefined') return;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() + sevenDays));
    setHidden(true);
  };

  return (
    <div className="mx-[clamp(1rem,3vw,3rem)] mt-[clamp(0.75rem,2vw,1.5rem)] flex justify-center">
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 p-[clamp(0.875rem,1.6vw,1.1rem)] shadow-md transition hover:shadow-lg">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-6 -right-6 h-24 w-24 rounded-full bg-orange-200/50 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-amber-300/40 blur-2xl" />

        <div className="relative flex items-center gap-3">
          {/* Icon stack */}
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-200">
            <Sparkles className="h-6 w-6 text-white drop-shadow" strokeWidth={2.5} />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400" />
            </span>
          </div>

          {/* Copy */}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-orange-900 leading-tight">
              Unlock your personalised feed!
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] font-bold">
              <span className={cn("inline-flex items-center gap-1 transition-colors duration-300", data.fields.pincode ? "text-success" : "text-orange-600 animate-pulse")}>
                {data.fields.pincode ? "✓" : "○"} Pincode
              </span>
              <span className="text-orange-300 font-normal">•</span>
              <span className={cn("inline-flex items-center gap-1 transition-colors duration-300", data.fields.businessName ? "text-success" : "text-orange-600 animate-pulse")}>
                {data.fields.businessName ? "✓" : "○"} Business
              </span>
              <span className="text-orange-300 font-normal">•</span>
              <span className={cn("inline-flex items-center gap-1 transition-colors duration-300", data.fields.fullName ? "text-success" : "text-orange-600 animate-pulse")}>
                {data.fields.fullName ? "✓" : "○"} Full Name
              </span>
            </div>
          </div>

          {/* CTA + dismiss */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/profile"
              className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-1.5 text-[12px] font-bold text-white shadow-md shadow-orange-200/60 transition hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
            >
              Complete
            </Link>
            <button
              type="button"
              onClick={snooze}
              aria-label="Remind me later"
              className="rounded-full p-1.5 text-orange-700/70 transition hover:bg-orange-100 hover:text-orange-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
