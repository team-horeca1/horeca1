'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { JournalBooksDashboard } from '@/components/features/ledger/JournalBooksDashboard';

interface JournalLine {
  id: string;
  account: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'income' | 'expense';
  role: string;
  party: string | null;
  debit: string;
  credit: string;
  memo: string | null;
  source: string | null;
  funder: string | null;
  funderType: string | null;
  funderId: string | null;
}

interface JournalEntry {
  id: string;
  date: string;
  event: string;
  eventLabel: string;
  referenceType: string;
  referenceId: string;
  remarks: string | null;
  edited: boolean;
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

interface DraftLine {
  key: string;
  code: string;
  name: string;
  type: JournalLine['accountType'];
  debit: string;
  credit: string;
  memo: string;
  sourceTag: string | null;
  funderType: string;
  funderId: string | null;
}

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

const ACCOUNT_TYPES: DraftLine['type'][] = ['expense', 'income', 'asset', 'liability'];

function paise(value: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function draftFrom(line: JournalLine): DraftLine {
  return {
    key: line.id,
    code: line.account,
    name: line.accountName,
    type: line.accountType,
    debit: Number(line.debit) > 0 ? line.debit : '',
    credit: Number(line.credit) > 0 ? line.credit : '',
    memo: line.memo ?? '',
    sourceTag: line.source,
    funderType: line.funderType ?? '',
    funderId: line.funderId,
  };
}

function blankLine(): DraftLine {
  return {
    key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    code: '',
    name: '',
    type: 'liability',
    debit: '',
    credit: '',
    memo: '',
    sourceTag: null,
    funderType: '',
    funderId: null,
  };
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<'journal' | 'dashboard'>('journal');
  const [view, setView] = useState<'detail' | 'table' | 'cards'>('detail');

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

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const startEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setDraft(entry.lines.map(draftFrom));
    setReason('');
    setError(null);
  };

  const debitPaise = draft.reduce((sum, line) => sum + paise(line.debit), 0);
  const creditPaise = draft.reduce((sum, line) => sum + paise(line.credit), 0);
  const balanced = debitPaise > 0 && debitPaise === creditPaise;

  const saveEdit = (entryId: string) => {
    if (!balanced) {
      setError('Debits and credits must match before you save.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Add a short note on why you changed this.');
      return;
    }
    setSaving(true);
    fetch('/api/v1/admin/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'correct',
        entryId,
        reason: reason.trim(),
        lines: draft.map((line) => ({
          code: line.code,
          name: line.name,
          type: line.type,
          debitRupees: line.debit || '0',
          creditRupees: line.credit || '0',
          memo: line.memo || null,
          sourceTag: line.sourceTag,
          funderType: line.funderType || null,
          funderId: line.funderId,
        })),
      }),
    })
      .then((response) => response.json())
      .then((json) => {
        if (!json.success) throw new Error(json?.error?.message ?? 'Could not save');
        setEditingId(null);
        setDraft([]);
        setReason('');
        loadEntries(search, eventType);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not save'))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-5 pb-16 text-[#1C1C1C]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.4rem,2vw+0.8rem,2rem)] font-semibold text-[#6B1D2E]">Journal</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[#667085]">
            Who bought, how they paid, what Horeca1 spent, and what is due to the supplier.
            Edit an entry when a line is wrong.
          </p>
        </div>
        <Link href="/admin/wallets" className="min-h-12 rounded-xl border border-[#E9E3DD] bg-white px-4 text-[13px] font-semibold leading-[3rem]">
          H1 Wallet
        </Link>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Journal sections">
        {([
          ['journal', 'Journal'],
          ['dashboard', 'Dashboard'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={`min-h-12 rounded-xl px-4 text-[13px] font-semibold ${
              section === id ? 'bg-[#6B1D2E] text-white' : 'border border-[#E9E3DD] bg-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'dashboard' && <JournalBooksDashboard />}

      {section === 'journal' && <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          loadEntries(search, eventType);
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order, customer reference, note"
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
        <div className="flex rounded-xl border border-[#E9E3DD] bg-white p-1" role="group" aria-label="Entry view">
          {([
            ['detail', 'Detail'],
            ['table', 'Table'],
            ['cards', 'Cards'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`min-h-10 rounded-lg px-3 text-[13px] font-semibold ${
                view === id ? 'bg-[#6B1D2E] text-white' : 'text-[#667085]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </form>}

      {section === 'journal' && <>
      {error && <p className="rounded-xl bg-[#F8E8EC] px-3 py-2 text-[14px] font-semibold text-[#6B1D2E]" role="alert">{error}</p>}
      {loading && <p className="text-[14px] text-[#667085]">Loading entries…</p>}
      {!loading && entries.length === 0 && (
        <p className="rounded-2xl border border-[#E9E3DD] bg-white p-6 text-[14px]">No journal entries yet.</p>
      )}

      {view === 'table' && entries.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[#E9E3DD] bg-white">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="text-[#667085]">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">What happened</th>
                <th className="px-3 py-2 font-medium">Buyer</th>
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-[#E9E3DD]">
                  <td className="px-3 py-3">{entry.date.slice(0, 10)}</td>
                  <td className="px-3 py-3">
                    <p className="font-semibold">{entry.eventLabel}</p>
                    <p className="text-[12px] text-[#667085]">{entry.referenceId.slice(0, 13)}{entry.edited ? ' · Edited' : ''}</p>
                  </td>
                  <td className="px-3 py-3">{entry.summary.buyer ?? '—'}</td>
                  <td className="px-3 py-3">{entry.summary.supplier ?? '—'}</td>
                  <td className="px-3 py-3">{entry.summary.paidHow ?? '—'}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">₹{entry.summary.totalDebit}</td>
                  <td className="px-3 py-3 text-right">
                    <button type="button" onClick={() => { setView('detail'); startEdit(entry); }} className="min-h-10 rounded-lg border border-[#6B1D2E] px-3 text-[12px] font-semibold text-[#6B1D2E]">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'cards' && entries.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col rounded-2xl border border-[#E9E3DD] bg-white p-4">
              <p className="text-[12px] font-medium uppercase tracking-wide text-[#667085]">{entry.date.slice(0, 10)}{entry.edited ? ' · Edited' : ''}</p>
              <h2 className="mt-1 text-[15px] font-semibold">{entry.eventLabel}</h2>
              <p className="mt-2 text-[20px] font-semibold tabular-nums">₹{entry.summary.totalDebit}</p>
              <div className="mt-3 space-y-1 text-[13px] text-[#667085]">
                <p>Buyer: <span className="font-semibold text-[#1C1C1C]">{entry.summary.buyer ?? '—'}</span></p>
                <p>Supplier: <span className="font-semibold text-[#1C1C1C]">{entry.summary.supplier ?? '—'}</span></p>
                <p>Paid: <span className="font-semibold text-[#1C1C1C]">{entry.summary.paidHow ?? '—'}</span></p>
                {entry.summary.dueTo && <p>Due: <span className="font-semibold text-[#1C1C1C]">{entry.summary.dueTo}</span></p>}
                {entry.summary.platformExpense && <p className="text-[#6B1D2E]">Horeca1 expense: <span className="font-semibold">{entry.summary.platformExpense}</span></p>}
              </div>
              <button
                type="button"
                onClick={() => { setView('detail'); startEdit(entry); }}
                className="mt-4 min-h-11 rounded-xl border border-[#6B1D2E] text-[13px] font-semibold text-[#6B1D2E]"
              >
                Open to edit
              </button>
            </li>
          ))}
        </ul>
      )}

      {view === 'detail' && (
      <ul className="space-y-4">
        {entries.map((entry) => {
          const editing = editingId === entry.id;
          return (
            <li key={entry.id} className="rounded-2xl border border-[#E9E3DD] bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-[12px] font-medium uppercase tracking-wide text-[#667085]">
                    {entry.date.slice(0, 10)}
                    {entry.edited ? ' · Edited' : ''}
                  </p>
                  <h2 className="text-[16px] font-semibold">{entry.eventLabel}</h2>
                  <p className="text-[13px] text-[#667085]">
                    {entry.referenceType} {entry.referenceId.slice(0, 13)}
                    {entry.remarks ? ` · ${entry.remarks}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[12px] text-[#667085]">Amount</p>
                    <p className="text-[18px] font-semibold tabular-nums">₹{entry.summary.totalDebit}</p>
                  </div>
                  {!editing && (
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      className="min-h-12 rounded-xl border border-[#6B1D2E] px-4 text-[13px] font-semibold text-[#6B1D2E]"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 px-4 pb-3 text-[12px]">
                {entry.summary.buyer && <Chip label="Buyer" value={entry.summary.buyer} />}
                {entry.summary.supplier && <Chip label="Supplier" value={entry.summary.supplier} />}
                {entry.summary.paidHow && <Chip label="Paid" value={entry.summary.paidHow} />}
                {entry.summary.dueTo && <Chip label="Due" value={entry.summary.dueTo} />}
                {entry.summary.platformExpense && <Chip label="Horeca1 expense" value={entry.summary.platformExpense} tone="brand" />}
              </div>

              {!editing && (
                <div className="overflow-x-auto border-t border-[#E9E3DD]">
                  <table className="w-full min-w-[680px] text-left text-[13px]">
                    <thead className="text-[#667085]">
                      <tr>
                        <th className="px-4 py-2 font-medium">What</th>
                        <th className="px-3 py-2 font-medium">Who</th>
                        <th className="px-3 py-2 font-medium">Funds</th>
                        <th className="px-3 py-2 text-right font-medium">Debit</th>
                        <th className="px-4 py-2 text-right font-medium">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line) => (
                        <tr key={line.id} className="border-t border-[#E9E3DD]">
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{line.role}</p>
                            <p className="text-[12px] text-[#667085]">{line.accountName}</p>
                            {line.memo && <p className="text-[12px] text-[#667085]">{line.memo}</p>}
                          </td>
                          <td className="px-3 py-2.5">{line.party ?? '—'}</td>
                          <td className="px-3 py-2.5">{line.funder ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{Number(line.debit) > 0 ? `₹${line.debit}` : '—'}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{Number(line.credit) > 0 ? `₹${line.credit}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {editing && (
                <div className="space-y-3 border-t border-[#E9E3DD] px-4 py-4">
                  <p className="text-[13px] text-[#667085]">
                    Change the account, who funded it, or the amounts. Debits must equal credits.
                  </p>
                  <div className="space-y-3">
                    {draft.map((line, index) => (
                      <div key={line.key} className="grid gap-2 rounded-xl bg-[#FAF7F2] p-3 md:grid-cols-12">
                        <label className="text-[12px] text-[#667085] md:col-span-4">Account
                          <input
                            value={line.code}
                            onChange={(event) => updateLine(setDraft, index, { code: event.target.value })}
                            className="mt-1 min-h-11 w-full rounded-lg border border-[#E9E3DD] bg-white px-2 text-[13px] text-[#1C1C1C]"
                          />
                        </label>
                        <label className="text-[12px] text-[#667085] md:col-span-3">Name
                          <input
                            value={line.name}
                            onChange={(event) => updateLine(setDraft, index, { name: event.target.value })}
                            className="mt-1 min-h-11 w-full rounded-lg border border-[#E9E3DD] bg-white px-2 text-[13px] text-[#1C1C1C]"
                          />
                        </label>
                        <label className="text-[12px] text-[#667085] md:col-span-2">Type
                          <select
                            value={line.type}
                            onChange={(event) => updateLine(setDraft, index, { type: event.target.value as DraftLine['type'] })}
                            className="mt-1 min-h-11 w-full rounded-lg border border-[#E9E3DD] bg-white px-2 text-[13px] text-[#1C1C1C]"
                          >
                            {ACCOUNT_TYPES.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-[12px] text-[#667085] md:col-span-3">Funds
                          <select
                            value={line.funderType}
                            onChange={(event) => updateLine(setDraft, index, { funderType: event.target.value })}
                            className="mt-1 min-h-11 w-full rounded-lg border border-[#E9E3DD] bg-white px-2 text-[13px] text-[#1C1C1C]"
                          >
                            <option value="">—</option>
                            <option value="platform">Horeca1</option>
                            <option value="supplier">Supplier</option>
                          </select>
                        </label>
                        <label className="text-[12px] text-[#667085] md:col-span-3">Debit ₹
                          <input
                            inputMode="decimal"
                            value={line.debit}
                            onChange={(event) => updateLine(setDraft, index, { debit: event.target.value })}
                            className="mt-1 min-h-11 w-full rounded-lg border border-[#E9E3DD] bg-white px-2 text-[13px] tabular-nums text-[#1C1C1C]"
                          />
                        </label>
                        <label className="text-[12px] text-[#667085] md:col-span-3">Credit ₹
                          <input
                            inputMode="decimal"
                            value={line.credit}
                            onChange={(event) => updateLine(setDraft, index, { credit: event.target.value })}
                            className="mt-1 min-h-11 w-full rounded-lg border border-[#E9E3DD] bg-white px-2 text-[13px] tabular-nums text-[#1C1C1C]"
                          />
                        </label>
                        <label className="text-[12px] text-[#667085] md:col-span-5">Note
                          <input
                            value={line.memo}
                            onChange={(event) => updateLine(setDraft, index, { memo: event.target.value })}
                            className="mt-1 min-h-11 w-full rounded-lg border border-[#E9E3DD] bg-white px-2 text-[13px] text-[#1C1C1C]"
                          />
                        </label>
                        <div className="flex items-end md:col-span-1">
                          <button
                            type="button"
                            onClick={() => setDraft((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                            className="min-h-11 w-full rounded-lg text-[12px] font-semibold text-[#DC2626]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft((rows) => [...rows, blankLine()])}
                    className="min-h-11 rounded-xl border border-[#E9E3DD] px-3 text-[13px] font-semibold"
                  >
                    Add line
                  </button>
                  <p className={`text-[13px] font-semibold tabular-nums ${balanced ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    Debit ₹{(debitPaise / 100).toFixed(2)} · Credit ₹{(creditPaise / 100).toFixed(2)}
                    {balanced ? ' · Balanced' : ' · Must match'}
                  </p>
                  <label className="block text-[12px] text-[#667085]">Why this change
                    <input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="What was wrong"
                      className="mt-1 min-h-12 w-full rounded-xl border border-[#E9E3DD] px-3 text-[14px] text-[#1C1C1C]"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving || !balanced}
                      onClick={() => saveEdit(entry.id)}
                      className="min-h-12 rounded-xl bg-[#6B1D2E] px-5 text-[14px] font-semibold text-white disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setError(null); }}
                      className="min-h-12 rounded-xl border border-[#E9E3DD] px-4 text-[14px] font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      )}
      </>}
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: 'brand' }) {
  return (
    <span className={`rounded-full px-3 py-1 ${tone === 'brand' ? 'bg-[#F8E8EC] text-[#6B1D2E]' : 'bg-[#FAF7F2] text-[#1C1C1C]'}`}>
      <span className="text-[#667085]">{label}: </span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function updateLine(
  setDraft: Dispatch<SetStateAction<DraftLine[]>>,
  index: number,
  patch: Partial<DraftLine>,
) {
  setDraft((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}
