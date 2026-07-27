'use client';

// "My Businesses" overlay — full list of every BusinessAccount the caller
// belongs to, with per-row delete. Solves the chicken-and-egg from
// AccountOverviewOverlay's Danger Zone: you couldn't delete the active BA
// without first switching, but there was no UI to view a NON-active BA.
// Now you open this overlay, see all BAs, click delete on any non-active row.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, Loader2, X, Building2, AlertTriangle, Trash2, Store, ShoppingBag, Sparkles, Check,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

interface BusinessAccount {
  id: string;
  legalName: string;
  displayName: string | null;
  gstin: string | null;
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
  status: string;
  isPrimary: boolean;
}

interface MyBusinessAccountsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional — fired after any successful delete so the parent can refresh
      navbar / session if it caches the account list. */
  onAccountDeleted?: (deletedAccountId: string) => void;
}

export function MyBusinessAccountsOverlay({ isOpen, onClose, onAccountDeleted }: MyBusinessAccountsOverlayProps) {
  const { data: session } = useSession();
  const activeAccountId = (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId;

  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-row delete state. Storing the id of the row currently in confirm mode
  // (only one at a time) plus the typed confirmation string + any error.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/v1/account')
      .then((r) => r.json())
      .then((j) => { if (j.success) setAccounts(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isOpen) {
      load();
      // Reset confirm state every time the overlay re-opens — stale typed text
      // from a previous session would be confusing.
      setConfirmingId(null);
      setConfirmText('');
      setDeleteError(null);
    }
  }, [isOpen, load]);

  const startConfirm = (id: string) => {
    setConfirmingId(id);
    setConfirmText('');
    setDeleteError(null);
  };

  const cancelConfirm = () => {
    setConfirmingId(null);
    setConfirmText('');
    setDeleteError(null);
  };

  const handleDelete = async (account: BusinessAccount) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/v1/account/${account.id}`, {
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
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      setConfirmingId(null);
      setConfirmText('');
      onAccountDeleted?.(account.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
      <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[640px] md:mt-[5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-[#F2F3F2] md:bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative bg-white border-b border-gray-100">
          <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10">
            <ChevronLeft size={20} className="text-[#181725]" />
          </button>
          <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">My Businesses</h2>
          <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-5 pb-28 md:pb-6">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="animate-spin text-[#53B175]" />
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-[13px] text-[#666] py-12 text-center bg-white rounded-xl border border-gray-100">
              No business accounts yet.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-[12px] text-[#7C7C7C] mb-2">
                All business accounts you own or belong to. Deleting an account is permanent and only allowed for the
                account owner (or a platform admin).
              </p>
              {accounts.map((acc) => {
                const isActive = acc.id === activeAccountId;
                const isConfirming = confirmingId === acc.id;
                return (
                  <div key={acc.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-start gap-3 p-4">
                      <div className="w-10 h-10 rounded-lg bg-[#F0F7FF] flex items-center justify-center shrink-0">
                        <Building2 size={18} className="text-[#3B82F6]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-bold text-[#181725] truncate">
                            {acc.displayName || acc.legalName}
                          </p>
                          {isActive && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-[#ECFDF5] text-[#299E60] px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                          {acc.isPrimary && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                              Owner
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {acc.isCustomer && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#7C7C7C] bg-[#F5F5F5] px-2 py-0.5 rounded-full">
                              <ShoppingBag size={10} /> Customer
                            </span>
                          )}
                          {acc.isVendor && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <Store size={10} /> Supplier
                            </span>
                          )}
                          {acc.isBrand && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                              <Sparkles size={10} /> Brand
                            </span>
                          )}
                          {acc.gstin && (
                            <span className="text-[10.5px] font-mono text-[#7C7C7C] bg-[#F5F5F5] px-2 py-0.5 rounded-full">
                              {acc.gstin}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Delete trigger — disabled if this is the user's
                          currently-active BA. Server enforces this too. */}
                      {!isConfirming && (
                        <button
                          onClick={() => startConfirm(acc.id)}
                          disabled={isActive}
                          title={isActive ? 'Switch to another business account first' : 'Delete this business account'}
                          className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-colors text-red-500 hover:bg-red-50 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {/* Inline confirm card — folds under the row */}
                    {isConfirming && (
                      <div className="border-t border-red-100 bg-red-50/50 p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                          <div className="text-[12px] text-[#181725] leading-relaxed">
                            Deletes <strong>{acc.legalName}</strong> and everything attached: outlets, members,
                            roles, supplier/brand profile, products, inventory. Cannot be undone.
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1.5">
                            Type <span className="font-mono text-red-700 normal-case font-bold">{acc.legalName}</span> to confirm
                          </label>
                          <input
                            type="text"
                            autoFocus
                            value={confirmText}
                            onChange={(e) => { setConfirmText(e.target.value); if (deleteError) setDeleteError(null); }}
                            placeholder={acc.legalName}
                            className="w-full h-[40px] border border-red-200 rounded-[10px] px-3 text-[13px] font-mono outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all"
                          />
                          {deleteError && (
                            <p className="text-[11.5px] text-red-600 mt-1.5">{deleteError}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDelete(acc)}
                            disabled={deleting || confirmText !== acc.legalName}
                            className="h-[38px] px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-[10px] text-[12.5px] font-bold flex items-center gap-2 transition-colors"
                          >
                            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            {deleting ? 'Deleting…' : 'Delete permanently'}
                          </button>
                          <button
                            onClick={cancelConfirm}
                            disabled={deleting}
                            className="h-[38px] px-4 text-[#7C7C7C] hover:text-[#181725] text-[12.5px] font-bold transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
