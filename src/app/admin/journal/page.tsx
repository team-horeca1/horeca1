'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface DiffRow {
  id: string;
  expected: string;
  actual: string;
  difference: string;
  likelyCause: string;
}

interface JournalLine {
  id: string;
  account: string;
  accountName: string;
  role: string;
  party: string | null;
  debit: string;
  credit: string;
  memo: string | null;
  source: string | null;
  funder: string | null;
}

interface JournalEntry {
  id: string;
  date: string;
  event: string;
  eventLabel: string;
  referenceType: string;
  referenceId: string;
  remarks: string | null;
  postedBy: string | null;
  summary: {
    buyer: string | null;
    supplier: string | null;
    paidHow: string | null;
    dueTo: string | null;
    platformExpense: string | null;
    totalDebit: string;
  };
  lines: JournalLine[];
}

type Tab = 'entries' | 'differences' | 'tools';

const EVENT_FILTERS = [
  { value: '', label: 'All events' },
  { value: 'reward_issue', label: 'Wallet grants' },
  { value: 'wallet_spend', label: 'Wallet spends' },
  { value: 'online_capture', label: 'Online payments' },
  { value: 'funded_deliver', label: 'Delivered (funded)' },
  { value: 'credit_deliver', label: 'Delivered (credit)' },
  { value: 'credit_repay', label: 'Credit repay' },
  { value: 'credit_release', label: 'Release to supplier' },
  { value: 'payout', label: 'Payouts' },
  { value: 'gateway_fee', label: 'Gateway fees' },
];

export default function JournalPage() {
  const [tab, setTab] = useState<Tab>('entries');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [orders, setOrders] = useState<DiffRow[]>([]);
  const [customers, setCustomers] = useState<DiffRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback((query?: string, event?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query?.trim()) params.set('search', query.trim());
    if (event) params.set('eventType', event);
    fetch(`/api/v1/admin/journal/entries?${params}`)
      .then((response) => response.json())
      .then((json) => {
        if (!json.success) throw new Error(json?.error?.message ?? 'Could not load journal');
        setEntries(json.data.entries ?? []);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load journal'))
      .finally(() => setLoading(false));
  }, []);

  const loadDiffs = useCallback(() => {
    setLoading(true);
    fetch('/api/v1/admin/journal/differences')
      .then((response) => response.json())
      .then((json) => {
        if (!json.success) throw new Error('Could not load differences');
        setOrders(json.data.orders ?? []);
        setCustomers(json.data.customers ?? []);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load differences'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'entries') loadEntries(search, eventType);
    else if (tab === 'differences') loadDiffs();
    else setLoading(false);
    // Intentionally only re-fetch when the tab changes; search/event apply on Filter submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search/eventType applied via form submit
  }, [tab, loadEntries, loadDiffs]);

  return (
    <div className="space-y-6 pb-16 text-[#1C1C1C]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.4rem,2vw+0.8rem,2rem)] font-semibold">Journal</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[#667085]">
            Every money move in plain language: who bought, how they paid, what Horeca1 spent on rewards,
            and what is still due to the supplier. Wallet cashback is a Horeca1 expense — suppliers still get
            the full funded amount minus commission.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/wallets" className="min-h-12 rounded-xl border border-[#E9E3DD] bg-white px-4 text-[13px] font-semibold leading-[3rem]">
            Wallets
          </Link>
          <button
            type="button"
            onClick={() => window.location.assign('/api/v1/admin/journal/differences?format=csv')}
            className="min-h-12 rounded-xl border border-[#E9E3DD] bg-white px-4 text-[13px] font-semibold leading-[3rem]"
          >
            Download CSV
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Journal sections">
        {(
          [
            ['entries', 'Entries'],
            ['differences', 'Shadow vs books'],
            ['tools', 'Reverse / adjust'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-xl px-4 text-[13px] font-semibold ${
              tab === id ? 'bg-[#6B1D2E] text-white' : 'border border-[#E9E3DD] bg-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-[14px] font-semibold text-rose-700" role="alert">{error}</p>}

      {tab === 'entries' && (
        <section className="space-y-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              loadEntries(search, eventType);
            }}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order id, reference, remarks"
              className="min-h-12 min-w-[220px] flex-1 rounded-xl border border-[#E9E3DD] bg-white px-3 text-[14px]"
            />
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              className="min-h-12 rounded-xl border border-[#E9E3DD] bg-white px-3 text-[14px]"
            >
              {EVENT_FILTERS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button type="submit" className="min-h-12 rounded-xl border border-[#E9E3DD] bg-white px-4 text-[13px] font-semibold">
              Filter
            </button>
          </form>

          {loading && <p className="text-[14px] text-[#667085]">Loading entries…</p>}
          {!loading && entries.length === 0 && (
            <p className="rounded-2xl border border-[#E9E3DD] bg-white p-6 text-[14px]">No journal entries yet.</p>
          )}

          <ul className="space-y-3">
            {entries.map((entry) => {
              const open = openId === entry.id;
              return (
                <li key={entry.id} className="rounded-2xl border border-[#E9E3DD] bg-white">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : entry.id)}
                    className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-4 text-left"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[12px] uppercase tracking-wide text-[#667085]">
                        {entry.date.slice(0, 10)} · {entry.event}
                      </p>
                      <p className="text-[15px] font-semibold">{entry.eventLabel}</p>
                      <p className="text-[13px] text-[#667085]">
                        {entry.referenceType}{' '}
                        <span className="font-medium text-[#1C1C1C]">{entry.referenceId.slice(0, 12)}</span>
                        {entry.remarks ? ` · ${entry.remarks}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                        {entry.summary.buyer && <span>Buyer: <strong className="font-semibold">{entry.summary.buyer}</strong></span>}
                        {entry.summary.supplier && <span>Supplier: <strong className="font-semibold">{entry.summary.supplier}</strong></span>}
                        {entry.summary.paidHow && <span>Paid: <strong className="font-semibold">{entry.summary.paidHow}</strong></span>}
                        {entry.summary.dueTo && <span>Due: <strong className="font-semibold">{entry.summary.dueTo}</strong></span>}
                        {entry.summary.platformExpense && (
                          <span className="text-[#6B1D2E]">
                            Horeca1 expense: <strong className="font-semibold">{entry.summary.platformExpense}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] text-[#667085]">Total</p>
                      <p className="text-[16px] font-semibold tabular-nums">₹{entry.summary.totalDebit}</p>
                      <p className="mt-1 text-[12px] text-[#667085]">{open ? 'Hide lines' : 'Show lines'}</p>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-[#E9E3DD] px-2 pb-3">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-[13px]">
                          <thead className="text-[#667085]">
                            <tr>
                              <th className="px-3 py-2 font-medium">What</th>
                              <th className="px-3 py-2 font-medium">Who</th>
                              <th className="px-3 py-2 font-medium">Pays / funds</th>
                              <th className="px-3 py-2 text-right font-medium">Debit</th>
                              <th className="px-3 py-2 text-right font-medium">Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.lines.map((line) => (
                              <tr key={line.id} className="border-t border-[#E9E3DD]">
                                <td className="px-3 py-2">
                                  <p className="font-medium">{line.role}</p>
                                  <p className="text-[12px] text-[#667085]">{line.accountName} · {line.account}</p>
                                  {line.memo && <p className="text-[12px] text-[#667085]">{line.memo}</p>}
                                </td>
                                <td className="px-3 py-2">{line.party ?? '—'}</td>
                                <td className="px-3 py-2">
                                  {line.funder ?? (line.source ? `Source: ${line.source}` : '—')}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{Number(line.debit) > 0 ? `₹${line.debit}` : '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{Number(line.credit) > 0 ? `₹${line.credit}` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 px-3 text-[11px] text-[#667085]">Entry id: {entry.id}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'differences' && (
        <section className="space-y-6">
          {loading && <p className="text-[14px] text-[#667085]">Loading differences…</p>}
          {!loading && orders.length === 0 && customers.length === 0 && (
            <p className="rounded-2xl border border-[#E9E3DD] bg-white p-6 text-[14px]">No delivered orders to compare.</p>
          )}
          <div>
            <h2 className="mb-2 text-[15px] font-semibold">Orders</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#E9E3DD] bg-white">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-[#667085]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 text-right font-medium">Journal</th>
                    <th className="px-3 py-2 text-right font-medium">Payout book</th>
                    <th className="px-3 py-2 text-right font-medium">Difference</th>
                    <th className="px-3 py-2 font-medium">Cause</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((row) => (
                    <tr key={row.id} className="border-t border-[#E9E3DD]">
                      <td className="px-3 py-2 font-medium">{row.id}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.expected}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.actual}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.difference}{row.difference !== '0.00' ? ' · differs' : ''}</td>
                      <td className="px-3 py-2 text-[#667085]">{row.likelyCause}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-[15px] font-semibold">Customers</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#E9E3DD] bg-white">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-[#667085]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 text-right font-medium">Journal wallet</th>
                    <th className="px-3 py-2 text-right font-medium">Wallet balance</th>
                    <th className="px-3 py-2 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((row) => (
                    <tr key={row.id} className="border-t border-[#E9E3DD]">
                      <td className="px-3 py-2 font-medium">{row.id.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.expected}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.actual}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'tools' && (
        <form
          className="grid gap-3 rounded-2xl border border-[#E9E3DD] bg-white p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const action = String(form.get('action') ?? 'reverse');
            const reason = String(form.get('reason') ?? '');
            const approvedBy = String(form.get('approvedBy') ?? '');
            const paise = Number(form.get('paise') ?? 0);
            const payload = action === 'loss_bearer'
              ? { action, lossBearer: String(form.get('lossBearer') ?? 'pending') }
              : action === 'adjust'
                ? {
                  action,
                  approvedBy,
                  reason,
                  idempotencyKey: `ui:adjust:${Date.now()}`,
                  lines: [
                    { code: String(form.get('debitCode') ?? ''), name: 'Manual debit', type: 'asset', side: 'debit', paise },
                    { code: String(form.get('creditCode') ?? ''), name: 'Manual credit', type: 'liability', side: 'credit', paise },
                  ],
                }
                : {
                  action,
                  entryId: String(form.get('entryId') ?? ''),
                  approvedBy,
                  reason,
                  idempotencyKey: `ui:reverse:${String(form.get('entryId') ?? '')}:${Date.now()}`,
                };
            fetch('/api/v1/admin/journal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
              .then((response) => response.json())
              .then((json) => setError(json.success ? null : (json?.error?.message ?? 'Could not post')))
              .catch(() => setError('Could not post'));
          }}
        >
          <div className="sm:col-span-2">
            <h2 className="text-[15px] font-semibold">Reverse or set the loss bearer</h2>
            <p className="mt-1 text-[12px] text-[#667085]">A reversal needs a different admin. While the loss bearer is pending, a write-off stays in Write-off Pending Allocation.</p>
          </div>
          <label className="text-[12px] text-[#667085]">Action
            <select name="action" className="mt-1 min-h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px] text-[#1C1C1C]">
              <option value="reverse">Reverse an entry</option>
              <option value="adjust">Manual adjustment</option>
              <option value="loss_bearer">Loss bearer</option>
            </select>
          </label>
          <label className="text-[12px] text-[#667085]">Entry id
            <input name="entryId" className="mt-1 min-h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px]" />
          </label>
          <label className="text-[12px] text-[#667085]">Debit account
            <input name="debitCode" className="mt-1 min-h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px]" />
          </label>
          <label className="text-[12px] text-[#667085]">Credit account
            <input name="creditCode" className="mt-1 min-h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px]" />
          </label>
          <label className="text-[12px] text-[#667085]">Paise
            <input name="paise" inputMode="numeric" className="mt-1 min-h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px] tabular-nums" />
          </label>
          <label className="text-[12px] text-[#667085]">Approver user id
            <input name="approvedBy" className="mt-1 min-h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px]" />
          </label>
          <label className="text-[12px] text-[#667085]">Reason
            <input name="reason" className="mt-1 min-h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px]" />
          </label>
          <label className="text-[12px] text-[#667085]">Loss bearer
            <select name="lossBearer" className="mt-1 min-h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px] text-[#1C1C1C]">
              <option value="pending">Pending</option>
              <option value="horeca1">Horeca1</option>
              <option value="supplier">Supplier</option>
              <option value="per_line">Per line</option>
            </select>
          </label>
          <button type="submit" className="min-h-12 rounded-xl bg-[#6B1D2E] px-4 text-[14px] font-semibold text-white">Save</button>
        </form>
      )}
    </div>
  );
}
