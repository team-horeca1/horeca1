'use client';

import { useEffect, useState } from 'react';

interface Row {
  id: string;
  expected: string;
  actual: string;
  difference: string;
  likelyCause: string;
}

export default function JournalPage() {
  const [orders, setOrders] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/admin/journal/differences')
      .then((response) => response.json())
      .then((json) => {
        if (!json.success) throw new Error('Could not load differences');
        setOrders(json.data.orders ?? []);
        setCustomers(json.data.customers ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load differences'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 pb-16 text-[#1C1C1C]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.4rem,2vw+0.8rem,2rem)] font-semibold">Journal</h1>
          <p className="text-[13px] text-[#667085]">Shadow totals next to the books that still move money. LEDGER_LIVE is off.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.assign('/api/v1/admin/journal/differences?format=csv');
          }}
          className="min-h-12 rounded-xl border border-[#E9E3DD] bg-white px-4 text-[13px] font-semibold leading-[3rem]"
        >
          Download CSV
        </button>
      </header>
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
        <div>
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
      {loading && <p className="text-[14px] text-[#667085]">Loading differences…</p>}
      {error && <p className="text-[14px] font-semibold text-rose-700" role="alert">{error}</p>}
      {!loading && !error && orders.length === 0 && customers.length === 0 && (
        <p className="rounded-2xl border border-[#E9E3DD] bg-white p-6 text-[14px]">No delivered orders to compare.</p>
      )}
      <section>
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
      </section>
      <section>
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
      </section>
    </div>
  );
}
