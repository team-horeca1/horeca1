'use client';

export interface StatementRow {
  id: string;
  date: string;
  event: string;
  reference: string;
  debit: string;
  credit: string;
  balanceAfter: string;
  status: string;
}

export function JournalStatement({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: StatementRow[];
  empty: string;
}) {
  return (
    <section className="rounded-2xl border border-[#E9E3DD] bg-white">
      <h2 className="px-4 pt-4 text-[15px] font-semibold text-[#1C1C1C]">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-[#667085]">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-[#667085]">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 text-right font-medium">Debit</th>
                <th className="px-3 py-2 text-right font-medium">Credit</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#E9E3DD]">
                  <td className="px-3 py-2">{row.date.slice(0, 10)}</td>
                  <td className="px-3 py-2">{row.event}</td>
                  <td className="px-3 py-2 font-medium">{row.reference.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.debit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.credit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
