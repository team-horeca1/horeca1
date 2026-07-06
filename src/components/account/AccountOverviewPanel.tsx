'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, MapPin, Users, ShieldCheck, ChevronRight, Building2, AlertTriangle, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface AccountDetail {
  id: string;
  legalName: string;
  displayName: string | null;
  gstin: string | null;
  pan: string | null;
  businessType: string | null;
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
  primaryOutletId: string | null;
  outlets: Array<{ id: string; name: string; pincode: string | null; requiresAddressUpdate: boolean }>;
  _count: { members: number; roles: number };
}

interface AccountOverviewPanelProps {
  accountId: string;
  fromPortal?: string | null;
  /** In vendor portal: switch tabs in-place instead of navigating away */
  onSelectTab?: (tab: 'outlets' | 'users' | 'roles') => void;
}

export function AccountOverviewPanel({ accountId, fromPortal, onSelectTab }: AccountOverviewPanelProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const activeAccountId = (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId;
  const isActive = accountId === activeAccountId;

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const qs = fromPortal ? `?from=${fromPortal}` : '';
  const base = `/account/${accountId}`;

  useEffect(() => {
    if (!accountId) return;
    Promise.resolve().then(() => setLoading(true));
    fetch(`/api/v1/account/${accountId}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setAccount(j.data); })
      .catch((err) => console.error('Error fetching account overview:', err))
      .finally(() => setLoading(false));
  }, [accountId]);

  const handleDelete = async () => {
    if (!account) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/v1/account/${accountId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const json = await res.json();
      if (!json.success) {
        setDeleteError(json.error?.message || 'Failed to delete');
        return;
      }
      toast.success(`Deleted ${account.legalName}`);
      router.push(fromPortal === 'vendor' ? '/vendor/dashboard' : '/');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="animate-spin text-[#299E60]" />
      </div>
    );
  }

  if (!account) {
    return <p className="text-[13px] text-[#666] py-8 text-center">Could not load business account details.</p>;
  }

  const incomplete = account.outlets.filter((o) => o.requiresAddressUpdate).length;

  const statClass = 'bg-white border border-[#F0F0F0] rounded-xl p-4 hover:border-[#299E60]/30 hover:shadow-sm transition-all flex flex-col justify-between text-left w-full';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {onSelectTab ? (
          <>
            <button type="button" onClick={() => onSelectTab('outlets')} className={statClass}>
              <StatCardInner icon={<MapPin size={16} className="text-[#299E60]" />} iconBg="bg-[#E8F5E9]" title="Outlets" value={String(account.outlets.length)} sub={incomplete > 0 ? `${incomplete} need address` : 'All complete'} subClass={incomplete > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            </button>
            <button type="button" onClick={() => onSelectTab('users')} className={statClass}>
              <StatCardInner icon={<Users size={16} className="text-blue-500" />} iconBg="bg-blue-50" title="Members" value={String(account._count.members)} sub="Manage access" />
            </button>
            <button type="button" onClick={() => onSelectTab('roles')} className={statClass}>
              <StatCardInner icon={<ShieldCheck size={16} className="text-purple-500" />} iconBg="bg-purple-50" title="Custom roles" value={String(account._count.roles)} sub="Permissions matrix" />
            </button>
          </>
        ) : (
          <>
            <Link href={`${base}/outlets${qs}`} className={statClass}>
              <StatCardInner icon={<MapPin size={16} className="text-[#299E60]" />} iconBg="bg-[#E8F5E9]" title="Outlets" value={String(account.outlets.length)} sub={incomplete > 0 ? `${incomplete} need address` : 'All complete'} subClass={incomplete > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            </Link>
            <Link href={`${base}/users${qs}`} className={statClass}>
              <StatCardInner icon={<Users size={16} className="text-blue-500" />} iconBg="bg-blue-50" title="Members" value={String(account._count.members)} sub="Manage access" />
            </Link>
            <Link href={`${base}/roles${qs}`} className={statClass}>
              <StatCardInner icon={<ShieldCheck size={16} className="text-purple-500" />} iconBg="bg-purple-50" title="Custom roles" value={String(account._count.roles)} sub="Permissions matrix" />
            </Link>
          </>
        )}
      </div>

      <div className="bg-white border border-[#F0F0F0] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4 border-b border-gray-50 pb-2.5">
          <Building2 size={16} className="text-[#299E60]" />
          <h3 className="text-[14px] font-bold text-[#181725]">Business details</h3>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-4 text-[13px]">
          <DetailRow label="Legal name" value={account.legalName} />
          <DetailRow label="Display name" value={account.displayName ?? '—'} />
          <DetailRow label="GSTIN" value={account.gstin ?? '—'} mono />
          <DetailRow label="PAN" value={account.pan ?? '—'} mono />
          <DetailRow label="Business type" value={account.businessType ?? '—'} />
          <DetailRow
            label="Account type"
            value={[account.isCustomer && 'Customer', account.isVendor && 'Vendor', account.isBrand && 'Brand'].filter(Boolean).join(' · ')}
          />
        </dl>
      </div>

      <div className="bg-red-50/60 border border-red-100 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-red-500" />
          <h3 className="text-[14px] font-bold text-red-700">Danger zone</h3>
        </div>
        <p className="text-[12px] text-red-600/90 mb-4 leading-relaxed">
          Permanently deletes this business account and everything attached. Cannot be undone.
        </p>
        {isActive && (
          <p className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-3">
            You&apos;re currently using this account. Switch to a different business before deleting.
          </p>
        )}
        {!confirmOpen ? (
          <button
            type="button"
            onClick={() => { setConfirmOpen(true); setDeleteError(null); }}
            disabled={isActive}
            className="h-[40px] px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2"
          >
            <Trash2 size={14} />
            Delete this business account
          </button>
        ) : (
          <div className="bg-white border border-red-100 rounded-lg p-4 space-y-3">
            <p className="text-[12px] text-[#181725]">
              Type <code className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded font-mono text-[11.5px]">{account.legalName}</code> to confirm.
            </p>
            <input
              type="text"
              autoFocus
              value={confirmText}
              onChange={(e) => { setConfirmText(e.target.value); if (deleteError) setDeleteError(null); }}
              placeholder={account.legalName}
              className="w-full h-[40px] border border-red-200 rounded-[10px] px-3 text-[13px] font-mono outline-none focus:border-red-400"
            />
            {deleteError && <p className="text-[11.5px] text-red-600">{deleteError}</p>}
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleDelete} disabled={deleting || confirmText !== account.legalName} className="h-[38px] px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-[10px] text-[12.5px] font-bold flex items-center gap-2">
                {deleting && <Loader2 size={13} className="animate-spin" />}
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button type="button" onClick={() => { setConfirmOpen(false); setConfirmText(''); setDeleteError(null); }} disabled={deleting} className="h-[38px] px-4 text-[#7C7C7C] text-[12.5px] font-bold">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-semibold text-[#AEAEAE] uppercase tracking-wider">{label}</dt>
      <dd className={`text-[#181725] font-medium mt-1 ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </div>
  );
}

function StatCardInner({
  icon, iconBg, title, value, sub, subClass = 'text-gray-500',
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  value: string;
  sub: string;
  subClass?: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between w-full mb-2">
        <span className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>{icon}</span>
        <ChevronRight size={14} className="text-gray-300" />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-[#AEAEAE] uppercase tracking-wider">{title}</p>
        <p className="text-[18px] font-bold text-[#181725]">{value}</p>
        <p className={`text-[9.5px] mt-0.5 font-medium ${subClass}`}>{sub}</p>
      </div>
    </>
  );
}
