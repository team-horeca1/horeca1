'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, RotateCcw, ShoppingBag, Wallet } from 'lucide-react';
import { FinanceKpiCard, inr } from '@/components/features/finance/financeChrome';
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
            H1 Wallet is the customer&apos;s spendable money. Rewards and cashback are a Horeca1 platform expense.
            When a customer pays with Wallet, Horeca1 still owes the supplier the full order minus commission.
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

      {summary && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FinanceKpiCard
            title="Can spend"
            value={inr(summary.spendable)}
            subtext={summary.wallets === 1 ? '1 customer wallet' : `${summary.wallets} customer wallets`}
            icon={<Wallet className="h-4 w-4" />}
            variant="hero"
          />
          <FinanceKpiCard
            title="Rewards given"
            value={inr(summary.rewardsGiven)}
            subtext="Grants and cashback put into wallets."
            icon={<Gift className="h-4 w-4" />}
            iconTone="burgundy"
          />
          <FinanceKpiCard
            title="Spent"
            value={inr(summary.spent)}
            subtext="Used on orders. Cancelled spends are put back."
            icon={<ShoppingBag className="h-4 w-4" />}
            iconTone="blue"
          />
          <FinanceKpiCard
            title="Credit notes"
            value={inr(summary.creditNotes)}
            subtext="Return money suppliers put into wallets."
            icon={<RotateCcw className="h-4 w-4" />}
            iconTone="amber"
          />
        </section>
      )}

      {summary && (
        <p className="rounded-xl border border-[#E9E3DD] bg-white px-4 py-3 text-[13px] text-[#1C1C1C]">
          <span className="font-semibold tabular-nums">{inr(summary.rewardsGiven)}</span>
          {' rewards + '}
          <span className="font-semibold tabular-nums">{inr(summary.creditNotes)}</span>
          {' credit notes − '}
          <span className="font-semibold tabular-nums">{inr(summary.spent)}</span>
          {' spent = '}
          <span className="font-semibold tabular-nums">{inr(summary.spendable)}</span>
          {' still to spend.'}
        </p>
      )}

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
              <th className="px-3 py-2 text-right font-medium">Can spend</th>
              <th className="px-3 py-2 text-right font-medium">Rewards left</th>
              <th className="px-3 py-2 text-right font-medium">Notes left</th>
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
                Can spend <span className="font-semibold tabular-nums">₹{detail.balance}</span>
                {' · '}Rewards ₹{detail.statement.reward}
                {' · '}Return credit notes ₹{detail.statement.creditNote}
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
