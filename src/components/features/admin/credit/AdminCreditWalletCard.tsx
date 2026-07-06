'use client';

import { Loader2, RefreshCw, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtDate, fmtMoney, STATUS_STYLE, type CreditWalletRow } from './adminCreditTypes';

interface AdminCreditWalletCardProps {
  wallet: CreditWalletRow;
  editing: boolean;
  editValue: string;
  busy: boolean;
  onStartEdit: () => void;
  onEditValueChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onReactivate: () => void;
}

function utilizationPct(wallet: CreditWalletRow): number {
  const limit = Number(wallet.creditLimit);
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((Number(wallet.usedCredit) / limit) * 100));
}

function barColor(pct: number): string {
  if (pct >= 80) return 'bg-[#E74C3C]';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-[#299E60]';
}

export function AdminCreditWalletCard({
  wallet: w,
  editing,
  editValue,
  busy,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
  onReactivate,
}: AdminCreditWalletCardProps) {
  const pct = utilizationPct(w);
  const outstanding = Number(w.outstandingAmount);
  const isH1 = !w.vendorId;

  return (
    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-4 flex flex-col gap-3 hover:border-[#299E60]/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-[#181725] truncate">{w.user.fullName}</p>
          <p className="text-[11px] text-[#AEAEAE] truncate">{w.user.phone || w.user.email || '—'}</p>
        </div>
        <span
          className={cn(
            'shrink-0 inline-flex rounded-full text-[11px] font-bold px-2.5 py-1 capitalize',
            STATUS_STYLE[w.status],
          )}
        >
          {w.status.toLowerCase()}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <span
          className={cn(
            'text-[11px] font-bold px-2.5 py-1 rounded-full',
            isH1 ? 'bg-[#EEF8F1] text-[#299E60]' : 'bg-[#F5F5F5] text-[#7C7C7C]',
          )}
        >
          {isH1 ? 'H1 Platform Wallet' : w.vendor?.businessName ?? 'Vendor'}
        </span>
        {w.overdueDays > 0 && outstanding > 0 && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600">
            {w.overdueDays}d overdue
          </span>
        )}
      </div>

      <div>
        <div className="flex justify-between text-[11px] text-[#AEAEAE] mb-1">
          <span>Utilization</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', barColor(pct))} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-[#AEAEAE] uppercase tracking-wide">Limit</p>
          {editing ? (
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <input
                type="number"
                min="0"
                autoFocus
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEdit();
                  if (e.key === 'Escape') onCancelEdit();
                }}
                className="h-[30px] w-[80px] border border-[#EEEEEE] rounded-[8px] px-1 text-[12px] text-center outline-none focus:border-[#299E60]/40"
              />
              <button
                type="button"
                onClick={onSaveEdit}
                disabled={busy}
                className="h-[28px] w-[28px] flex items-center justify-center rounded-[8px] bg-[#299E60] text-white disabled:opacity-50"
              >
                <Save size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStartEdit}
              className="text-[13px] font-bold text-[#181725] hover:text-[#299E60] hover:underline decoration-dotted mt-0.5"
            >
              {fmtMoney(w.creditLimit)}
            </button>
          )}
        </div>
        <div>
          <p className="text-[10px] text-[#AEAEAE] uppercase tracking-wide">Available</p>
          <p className="text-[13px] font-bold text-[#299E60] mt-0.5">{fmtMoney(w.availableCredit)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#AEAEAE] uppercase tracking-wide">Outstanding</p>
          <p className={cn('text-[13px] font-bold mt-0.5', outstanding > 0 ? 'text-[#E74C3C]' : 'text-[#181725]')}>
            {fmtMoney(w.outstandingAmount)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-[#F5F5F5]">
        <span className="text-[11px] text-[#AEAEAE]">Due {fmtDate(w.currentDueDate)}</span>
        {w.status === 'BLACKLISTED' ? (
          <button
            type="button"
            onClick={onReactivate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-[32px] px-3 rounded-[8px] bg-[#EEF8F1] text-[#299E60] text-[12px] font-bold hover:bg-[#299E60] hover:text-white disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />}
            Reactivate
          </button>
        ) : (
          <span className="text-[11px] text-[#AEAEAE]">—</span>
        )}
      </div>
    </div>
  );
}
