'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, Loader2, XCircle } from 'lucide-react';

type InviteState =
  | { status: 'loading' }
  | { status: 'ok'; referrerName: string }
  | { status: 'error'; message: string };

export default function InviteLandingClient({ token }: { token: string }) {
  const [state, setState] = useState<InviteState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/promotions/invite/${encodeURIComponent(token)}`, {
          credentials: 'include',
        });
        const payload: unknown = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          const message =
            payload && typeof payload === 'object' && 'error' in payload
              ? String((payload as { error?: { message?: string } }).error?.message ?? 'This invite is not valid.')
              : 'This invite is not valid.';
          setState({ status: 'error', message });
          return;
        }
        const data = (payload as { data?: { referrerName?: string } }).data;
        setState({ status: 'ok', referrerName: data?.referrerName?.trim() || 'A friend' });
      } catch {
        if (!cancelled) setState({ status: 'error', message: 'Could not load this invite. Please try again.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="mx-auto max-w-lg px-[clamp(1rem,3vw,2rem)] py-[clamp(2rem,6vw,5rem)]">
      <div className="rounded-2xl bg-white p-[clamp(1.25rem,4vw,2.5rem)] shadow-sm ring-1 ring-gray-100">
        {state.status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-10 text-[#7C7C7C]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p>Opening your invite…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <XCircle className="h-10 w-10 text-red-500" />
            <h1 className="text-[clamp(1.25rem,3vw,1.75rem)] font-semibold text-[#181725]">Invite not found</h1>
            <p className="text-[#7C7C7C]">{state.message}</p>
            <Link
              href="/"
              className="mt-2 inline-flex rounded-2xl bg-primary px-6 py-3 font-medium text-white"
            >
              Go to HoReCa Hub
            </Link>
          </div>
        )}

        {state.status === 'ok' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Gift className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-[clamp(1.35rem,3.5vw,1.9rem)] font-semibold text-[#181725]">
              {state.referrerName} invited you
            </h1>
            <p className="text-[#7C7C7C]">
              Create your HoReCa Hub account to claim referral rewards and start ordering from verified vendors.
            </p>
            <Link
              href="/register"
              className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-6 py-3 font-medium text-white"
            >
              Create account
            </Link>
            <Link href="/login" className="text-sm font-medium text-primary">
              Already have an account? Sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
