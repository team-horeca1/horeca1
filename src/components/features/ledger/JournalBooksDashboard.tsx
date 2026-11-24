'use client';

import { useEffect, useState } from 'react';
import { FinanceKpiCard, inr } from '@/components/features/finance/financeChrome';
import { Landmark, Scale, ShoppingBag, Wallet } from 'lucide-react';

interface BookAccount {
  code: string;
  name: string;
  role: string;
  party: string | null;
  balance: string;
}

interface Book {
  id: 'asset' | 'liability' | 'income' | 'expense';
  title: string;
  meaning: string;
  total: string;
  accounts: BookAccount[];
}

interface Books {
  assets: string;
  liabilities: string;
  income: string;
  expenses: string;
  balanced: boolean;
  books: Book[];
}

const ICONS = {
  asset: Landmark,
  liability: Wallet,
  income: Scale,
  expense: ShoppingBag,
} as const;

export function JournalBooksDashboard() {
  const [books, setBooks] = useState<Books | null>(null);
  const [bookId, setBookId] = useState<Book['id']>('liability');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/admin/journal/books')
      .then((response) => response.json())
      .then((json) => {
        if (!json.success) throw new Error(json?.error?.message ?? 'Could not load the books');
        setBooks(json.data);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the books'));
  }, []);

  if (error) return <p className="rounded-xl bg-[#F8E8EC] px-3 py-2 text-[14px] font-semibold text-[#6B1D2E]" role="alert">{error}</p>;
  if (!books) return <p className="text-[14px] text-[#667085]">Loading the four books…</p>;

  const open = books.books.find((book) => book.id === bookId) ?? books.books[0];
  const totals: Record<Book['id'], string> = {
    asset: books.assets,
    liability: books.liabilities,
    income: books.income,
    expense: books.expenses,
  };

  return (
    <div className="space-y-4">
      <p className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${books.balanced ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#F8E8EC] text-[#6B1D2E]'}`}>
        {books.balanced
          ? 'The four books balance. Assets + expenses equal liabilities + income.'
          : 'The four books do not balance. Assets + expenses should equal liabilities + income.'}
      </p>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {books.books.map((book) => {
          const Icon = ICONS[book.id];
          const selected = book.id === open.id;
          return (
            <button key={book.id} type="button" onClick={() => setBookId(book.id)} className="block w-full border-0 bg-transparent p-0 text-left">
              <FinanceKpiCard
                title={book.title}
                value={inr(totals[book.id])}
                subtext={book.meaning}
                icon={<Icon className="h-4 w-4" />}
                variant={selected ? 'hero' : 'default'}
                iconTone="burgundy"
              />
            </button>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E9E3DD] bg-white">
        <div className="flex flex-wrap items-end justify-between gap-2 px-4 py-4">
          <div>
            <h2 className="text-[16px] font-semibold">{open.title}</h2>
            <p className="mt-1 text-[13px] text-[#667085]">{open.meaning}</p>
          </div>
          <p className="text-[18px] font-semibold tabular-nums">₹{open.total}</p>
        </div>
        {open.accounts.length === 0 ? (
          <p className="border-t border-[#E9E3DD] px-4 py-6 text-[14px] text-[#667085]">Nothing in this book yet.</p>
        ) : (
          <div className="overflow-x-auto border-t border-[#E9E3DD]">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-[#667085]">
                <tr>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Who</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {open.accounts.map((account) => (
                  <tr key={account.code} className="border-t border-[#E9E3DD]">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{account.role}</p>
                      <p className="text-[12px] text-[#667085]">{account.name}</p>
                    </td>
                    <td className="px-3 py-2.5">{account.party ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">₹{account.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
