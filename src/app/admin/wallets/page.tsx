'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { inr } from '@/components/features/finance/financeChrome';
import { JournalStatement, type StatementRow } from '@/components/features/ledger/JournalStatement';

interface WalletRow {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  balance: string;
  journalReward: string;
  journalCreditNote: string;
  journalTotal: string;
}

interface WalletSummary {
  spendable: string;
  wallets: number;
  rewardsGiven: string;
  spent: string;
  creditNotes: string;
}

interface Detail {
  user: { id: string; name: string; phone: string | null; email: string | null };
  balance: string;
  statement: { reward: string; creditNote: string; total: string; rows: StatementRow[] };
}

function WalletStory({ summary }: { summary: WalletSummary }) {
  const putIn = (Number(summary.rewardsGiven) + Number(summary.creditNotes)).toFixed(2);
  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_auto_1fr_auto_1.15fr] lg:items-stretch">
      <div className="rounded-2xl border border-[#E9E3DD] bg-white p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#667085]">1. Put into wallets</p>
        <p className="mt-2 text-[clamp(1.6rem,2vw,2rem)] font-bold tabular-nums">{inr(putIn)}</p>
        <p className="mt-3 text-[13px] text-[#667085]">Horeca1 gave <span className="font-semibold text-[#1C1C1C] tabular-nums">{inr(summary.rewardsGiven)}</span></p>
        <p className="text-[13px] text-[#667085]">Suppliers returned <span className="font-semibold text-[#1C1C1C] tabular-nums">{inr(summary.creditNotes)}</span></p>
      </div>
      <p className="hidden items-center justify-center text-[28px] font-semibold text-[#667085] lg:flex" aria-hidden>−</p>
      <div className="rounded-2xl border border-[#E9E3DD] bg-white p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#667085]">2. Used on orders</p>
        <p className="mt-2 text-[clamp(1.6rem,2vw,2rem)] font-bold tabular-nums">{inr(summary.spent)}</p>
        <p className="mt-3 text-[13px] text-[#667085]">Cancelled orders are put back, so they are not in this number.</p>
      </div>
      <p className="hidden items-center justify-center text-[28px] font-semibold text-[#667085] lg:flex" aria-hidden>=</p>
      <div className="rounded-2xl bg-[#6B1D2E] p-5 text-white">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-rose-100">3. Left to spend</p>
        <p className="mt-2 text-[clamp(1.6rem,2vw,2rem)] font-bold tabular-nums">{inr(summary.spendable)}</p>
        <p className="mt-3 text-[13px] text-rose-100">
          {summary.wallets === 1 ? '1 customer' : `${summary.wallets} customers`} can still use this.
        </p>
      </div>
    </section>
  );
}

export default function AdminWalletsPage() {
  const [search, setSearch] = useState('');
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((query?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query?.trim()) params.set('search', query.trim());
    fetch(`/api/v1/admin/wallets?${params}`)
      .then((response) => response.json())
      .then((json) => {
        if (!json.success) throw new Error(json?.error?.message ?? 'Could not load wallets');
        setWallets(json.data.wallets ?? []);
        setSummary(json.data.summary ?? null);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load wallets'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = (userId: string) => {
    fetch(`/api/v1/admin/wallets?userId=${encodeURIComponent(userId)}`)
      .then((response) => response.json())
      .then((json) => {
        if (!json.success) throw new Error(json?.error?.message ?? 'Could not load wallet');
        setDetail(json.data);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load wallet'));
  };

  return (
    <div className="space-y-6 pb-16 text-[#1C1C1C]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.4rem,2vw+0.8rem,2rem)] font-semibold">H1 Wallet</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[#667085]">
            Money put into customer wallets, what they used on orders, and what is left.
            Horeca1 still pays the supplier in full when a customer pays with this wallet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/promotions" className="min-h-12 rounded-xl bg-[#6B1D2E] px-4 text-[13px] font-semibold leading-[3rem] text-white">
            Grant Wallet money
          </Link>
          <Link href="/admin/journal" className="min-h-12 rounded-xl border border-[#E9E3DD] bg-white px-4 text-[13px] font-semibold leading-[3rem]">
            Open Journal
          </Link>
        </div>
      </header>

      {summary && <WalletStory summary={summary} />}

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          load(search);
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, phone, email, HCID"
          className="min-h-12 min-w-[240px] flex-1 rounded-xl border border-[#E9E3DD] bg-white px-3 text-[14px]"
        />
        <button type="submit" className="min-h-12 rounded-xl border border-[#E9E3DD] bg-white px-4 text-[13px] font-semibold">
          Search
        </button>
      </form>

      {error && <p className="text-[14px] font-semibold text-rose-700" role="alert">{error}</p>}
      {loading && <p className="text-[14px] text-[#667085]">Loading wallets…</p>}

      {!loading && wallets.length === 0 && (
        <p className="rounded-2xl border border-[#E9E3DD] bg-white p-6 text-[14px]">No wallets yet.</p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#E9E3DD] bg-white">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="text-[#667085]">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 text-right font-medium">Left to spend</th>
              <th className="px-3 py-2 text-right font-medium">From Horeca1</th>
              <th className="px-3 py-2 text-right font-medium">From returns</th>
              <th className="px-3 py-2 text-right font-medium">Journal</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {wallets.map((row) => (
              <tr key={row.userId} className="border-t border-[#E9E3DD]">
                <td className="px-3 py-3">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-[12px] text-[#667085]">{row.phone || row.email || row.userId.slice(0, 8)}</p>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">₹{row.balance}</td>
                <td className="px-3 py-3 text-right tabular-nums">₹{row.journalReward}</td>
                <td className="px-3 py-3 text-right tabular-nums">₹{row.journalCreditNote}</td>
                <td className="px-3 py-3 text-right tabular-nums">₹{row.journalTotal}</td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openDetail(row.userId)}
                    className="min-h-10 rounded-lg border border-[#E9E3DD] px-3 text-[12px] font-semibold"
                  >
                    Statement
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <section className="space-y-3 rounded-2xl border border-[#E9E3DD] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold">{detail.user.name}</h2>
              <p className="text-[13px] text-[#667085]">{detail.user.phone || detail.user.email}</p>
              <p className="mt-2 text-[13px]">
                Left to spend <span className="font-semibold tabular-nums">₹{detail.balance}</span>
                {' · '}From Horeca1 ₹{detail.statement.reward}
                {' · '}From returns ₹{detail.statement.creditNote}
              </p>
            </div>
            <button type="button" onClick={() => setDetail(null)} className="min-h-10 rounded-lg border border-[#E9E3DD] px-3 text-[12px] font-semibold">
              Close
            </button>
          </div>
          <JournalStatement
            title="Wallet journal"
            rows={detail.statement.rows}
            empty="No journal lines yet for this customer."
          />
        </section>
      )}
    </div>
  );
}
