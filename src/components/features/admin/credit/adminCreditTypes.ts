export type WalletStatus =
  | 'ACTIVE'
  | 'BLOCKED'
  | 'SUSPENDED'
  | 'FROZEN'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'BLACKLISTED';

export type AdminCreditTabKey = 'lines' | 'reports' | 'statement' | 'config';

export type StatusFilterKey =
  | ''
  | WalletStatus
  | 'OVERDUE'
  | 'FULLY_UTILIZED'
  | 'HIGH_RISK';

export interface CreditWalletRow {
  id: string;
  userId: string;
  vendorId: string | null;
  status: WalletStatus;
  creditSource?: string;
  creditLimit: string | number;
  availableCredit: string | number;
  usedCredit: string | number;
  reservedAmount?: string | number;
  outstandingAmount: string | number;
  currentDueDate: string | null;
  overdueDays: number;
  createdAt: string;
  user: { id: string; fullName: string; phone: string | null; email: string | null };
  vendor: { businessName: string } | null;
}

export interface PickOption {
  id: string;
  label: string;
  sub?: string;
}

export interface OverdueRow {
  customer: string;
  phone: string | null;
  vendor: string;
  creditLimit: number;
  outstanding: number;
  dueDate: string | null;
  overdueDays: number;
  status: WalletStatus;
  highlightRed: boolean;
}

export interface UtilizationStats {
  totalCreditIssued: number;
  totalCreditUtilized: number;
  totalRepayments: number;
  outstandingAmount: number;
  activeCustomers: number;
  blacklistedCustomers: number;
}

export interface InterestRow {
  customer: string;
  interestApplied: number;
  date: string | null;
  outstandingBaseAmount: number;
}

export interface AuditRow {
  customer: string;
  action: string;
  performedBy: string;
  previousValue: string | null;
  newValue: string | null;
  remarks: string | null;
  timestamp: string;
}

export interface StatementRow {
  id: string;
  customer: string;
  phone: string | null;
  wallet: string;
  type: string;
  direction: 'debit' | 'credit' | 'info';
  amount: number;
  debit: number | null;
  credit: number | null;
  balanceAfter: number;
  note: string | null;
  referenceId: string | null;
  timestamp: string;
}

export interface ReportsData {
  overdue?: OverdueRow[];
  utilization?: UtilizationStats;
  interest?: InterestRow[];
  audit?: AuditRow[];
}

export interface GlobalConfig {
  id: string;
  repaymentMode: 'REPAY_BEFORE_NEXT_USE' | 'ALLOW_USAGE_TILL_DUE';
  billingModel: 'BILL_TO_BILL' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
  creditLimit: string | number;
  creditTenureDays: number;
  gracePeriodDays: number;
  blacklistDays: number;
  interestRatePct: string | number;
  interestFrequencyDays: number;
  penaltyAmount: string | number;
  penaltyFrequencyDays: number;
  eligiblePurchaseCount: number;
  unlockCreditAmount: string | number;
}

export const STATUS_STYLE: Record<WalletStatus, string> = {
  ACTIVE: 'bg-[#EEF8F1] text-[#299E60]',
  BLOCKED: 'bg-[#FFF4E5] text-[#976538]',
  SUSPENDED: 'bg-slate-100 text-slate-700',
  FROZEN: 'bg-cyan-50 text-cyan-800',
  EXPIRED: 'bg-stone-100 text-stone-600',
  CANCELLED: 'bg-zinc-100 text-zinc-600',
  BLACKLISTED: 'bg-[#FFF0F0] text-[#E74C3C]',
};

export const STATUS_FILTER_OPTIONS: { key: StatusFilterKey; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'FROZEN', label: 'Frozen' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'BLACKLISTED', label: 'Blacklisted' },
  { key: 'FULLY_UTILIZED', label: 'Fully utilized' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'HIGH_RISK', label: 'High risk' },
];

export const TXN_LABEL: Record<string, string> = {
  CREDIT_ASSIGN: 'Credit assigned',
  ORDER_DEBIT: 'Order — credit reserved',
  DELIVERY_CONVERT: 'Delivery — reserved → outstanding',
  REPAYMENT: 'Repayment received',
  PENALTY: 'Interest / late fee',
  REVERSAL: 'Reversal — order cancelled',
};

export const DIR_STYLE: Record<StatementRow['direction'], string> = {
  debit: 'bg-[#FFF0F0] text-[#E74C3C]',
  credit: 'bg-[#EEF8F1] text-[#299E60]',
  info: 'bg-[#F0F4FF] text-[#3B5BDB]',
};

export const INPUT_CLS =
  'w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40 transition-colors bg-white';

export const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(Number(v));

export const fmtMoney = (v: string | number) =>
  `₹ ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function computeWalletStats(wallets: CreditWalletRow[]) {
  return {
    lines: wallets.length,
    exposure: wallets.reduce((s, w) => s + Number(w.creditLimit), 0),
    outstanding: wallets.reduce((s, w) => s + Number(w.outstandingAmount), 0),
    overdue: wallets.filter((w) => w.overdueDays > 0 && Number(w.outstandingAmount) > 0).length,
  };
}

export function filterWalletsByStatus(wallets: CreditWalletRow[], filter: StatusFilterKey): CreditWalletRow[] {
  if (!filter) return wallets;
  if (filter === 'OVERDUE') {
    return wallets.filter((w) => w.overdueDays > 0 && Number(w.outstandingAmount) > 0);
  }
  if (filter === 'FULLY_UTILIZED') {
    return wallets.filter((w) => w.status === 'ACTIVE' && Number(w.creditLimit) > 0 && Number(w.availableCredit) <= 0);
  }
  if (filter === 'HIGH_RISK') {
    return wallets.filter((w) => w.status === 'BLACKLISTED' || w.overdueDays > 60);
  }
  if (filter === 'FROZEN') {
    return wallets.filter((w) => w.status === 'FROZEN' || w.status === 'BLOCKED');
  }
  return wallets.filter((w) => w.status === filter);
}

export function buildPolicySummary(config: GlobalConfig): string {
  const repay =
    config.repaymentMode === 'REPAY_BEFORE_NEXT_USE'
      ? 'Customers must repay before next credit order'
      : `Customers can keep ordering until due (${config.billingModel.toLowerCase().replace(/_/g, ' ')})`;
  return `${repay} · ${config.gracePeriodDays}-day grace · ${config.interestRatePct}% interest every ${config.interestFrequencyDays}d · ₹${config.penaltyAmount} late fee every ${config.penaltyFrequencyDays}d · blacklist after ${config.blacklistDays}d overdue`;
}

const REPAYMENT_LABELS: Record<string, string> = {
  REPAY_BEFORE_NEXT_USE: 'Repay before next use',
  ALLOW_USAGE_TILL_DUE: 'Use until due date',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  BLOCKED: 'Blocked',
  SUSPENDED: 'Suspended',
  FROZEN: 'Frozen',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  BLACKLISTED: 'Blacklisted',
  SANCTIONED: 'Sanctioned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

function formatOverrides(overrides: Record<string, unknown>): string[] {
  const parts: string[] = [];
  if (overrides.repaymentMode) {
    parts.push(REPAYMENT_LABELS[String(overrides.repaymentMode)] ?? String(overrides.repaymentMode));
  }
  if (overrides.billingModel) {
    parts.push(String(overrides.billingModel).toLowerCase().replace(/_/g, ' '));
  }
  if (overrides.creditTenureDays != null) parts.push(`${overrides.creditTenureDays}-day tenure`);
  if (overrides.gracePeriodDays != null) parts.push(`${overrides.gracePeriodDays}-day grace`);
  if (overrides.interestRatePct != null) parts.push(`${overrides.interestRatePct}% interest`);
  if (overrides.penaltyAmount != null) parts.push(`₹${overrides.penaltyAmount} late fee`);
  return parts;
}

/** Turn raw audit DB values (often JSON) into admin-friendly text. */
export function formatAuditValue(raw: string | null): string {
  if (raw == null || raw.trim() === '') return '—';

  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return STATUS_LABELS[trimmed] ?? trimmed;
  }

  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const parts: string[] = [];

    if (obj.creditLimit != null) {
      parts.push(`Limit ${inr(Number(obj.creditLimit))}`);
    }

    const overrides = obj.overrides;
    if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
      parts.push(...formatOverrides(overrides as Record<string, unknown>));
    }

    if (parts.length > 0) return parts.join(' · ');

    // Fallback: single-field objects (e.g. notes)
    const entries = Object.entries(obj).filter(([, v]) => v != null && v !== '');
    if (entries.length === 1) return String(entries[0][1]);
    if (entries.length > 0) {
      return entries.map(([k, v]) => `${k}: ${String(v)}`).join(', ');
    }
  } catch {
    // not JSON — show as-is
  }

  return raw;
}

export function formatAuditChange(previous: string | null, next: string | null): string {
  const prev = formatAuditValue(previous);
  const nxt = formatAuditValue(next);
  if (prev === '—') return nxt;
  if (nxt === '—') return prev;
  if (prev === nxt) return prev;
  return `${prev} → ${nxt}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatAuditActor(performedBy: string): string {
  if (performedBy === 'SYSTEM') return 'System';
  if (UUID_RE.test(performedBy)) return 'Admin';
  return performedBy;
}
