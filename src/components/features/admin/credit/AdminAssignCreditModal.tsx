'use client';

import { useCallback, useState } from 'react';
import { IndianRupee, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EntityPicker } from './EntityPicker';
import { INPUT_CLS, type PickOption } from './adminCreditTypes';

type RepaymentMode = '' | 'REPAY_BEFORE_NEXT_USE' | 'ALLOW_USAGE_TILL_DUE';
type BillingModel = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';

const LIMIT_CHIPS = [10_000, 50_000, 100_000];

interface AdminAssignCreditModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminAssignCreditModal({ onClose, onSuccess }: AdminAssignCreditModalProps) {
  const [formUserId, setFormUserId] = useState('');
  const [formVendorId, setFormVendorId] = useState('');
  const [formCreditLimit, setFormCreditLimit] = useState('');
  const [formRemark, setFormRemark] = useState('');
  const [terms, setTerms] = useState<RepaymentMode>('');
  const [formCreditTenureDays, setFormCreditTenureDays] = useState('');
  const [cycle, setCycle] = useState<BillingModel>('MONTHLY');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formInterestRatePct, setFormInterestRatePct] = useState('');
  const [formGracePeriodDays, setFormGracePeriodDays] = useState('');
  const [formPenaltyAmount, setFormPenaltyAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const searchUsers = useCallback(async (q: string): Promise<PickOption[]> => {
    const url = new URL('/api/v1/admin/users', window.location.origin);
    url.searchParams.set('limit', '10');
    if (q.trim()) url.searchParams.set('search', q.trim());
    const json = await fetch(url.toString()).then((r) => r.json());
    const users = (json?.data?.users ?? []) as Array<{
      id: string;
      fullName: string | null;
      email: string | null;
      phone: string | null;
      role: string;
      hcidDisplay: string | null;
    }>;
    return users.map((u) => ({
      id: u.id,
      label: u.fullName || u.email || u.phone || u.id,
      sub: [u.role, u.phone, u.hcidDisplay].filter(Boolean).join(' · '),
    }));
  }, []);

  const searchVendors = useCallback(async (q: string): Promise<PickOption[]> => {
    const url = new URL('/api/v1/admin/vendors', window.location.origin);
    url.searchParams.set('limit', '10');
    if (q.trim()) url.searchParams.set('search', q.trim());
    const json = await fetch(url.toString()).then((r) => r.json());
    const vendors = (json?.data?.vendors ?? []) as Array<{
      id: string;
      businessName: string;
      slug: string;
      user: { fullName: string | null } | null;
    }>;
    return vendors.map((v) => ({
      id: v.id,
      label: v.businessName,
      sub: v.user?.fullName ?? v.slug,
    }));
  }, []);

  const submit = async () => {
    if (!formUserId.trim() || !formCreditLimit.trim()) {
      toast.error('Customer and credit limit are required');
      return;
    }
    const overrides: Record<string, number | string> = {};
    if (terms) {
      overrides.repaymentMode = terms;
      if (terms === 'REPAY_BEFORE_NEXT_USE') {
        overrides.billingModel = 'BILL_TO_BILL';
        if (formCreditTenureDays.trim()) overrides.creditTenureDays = Number(formCreditTenureDays);
      } else {
        overrides.billingModel = cycle;
      }
    }
    if (formInterestRatePct.trim()) overrides.interestRatePct = Number(formInterestRatePct);
    if (formGracePeriodDays.trim()) overrides.gracePeriodDays = Number(formGracePeriodDays);
    if (formPenaltyAmount.trim()) overrides.penaltyAmount = Number(formPenaltyAmount);

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/credit/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: formUserId.trim(),
          vendorId: formVendorId.trim() ? formVendorId.trim() : null,
          creditLimit: Number(formCreditLimit),
          ...(Object.keys(overrides).length > 0 && { overrides }),
          ...(formRemark.trim() && { remark: formRemark.trim() }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || json.message || 'Failed to assign credit');
      toast.success('Credit line assigned');
      setResetKey((k) => k + 1);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign credit');
    } finally {
      setSubmitting(false);
    }
  };

  const labelCls = 'block text-[12px] font-semibold text-[#7C7C7C] mb-1';
  const inputSm = 'w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white';

  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-[16px] w-full max-w-[520px] shadow-2xl my-8">
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-[#181725]">Assign credit</h2>
            <p className="text-[12px] text-[#AEAEAE]">Give a customer a new credit line or update their limit</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-[6px] hover:bg-[#F5F5F5]">
            <X size={16} className="text-[#AEAEAE]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
          <div>
            <label className={labelCls}>
              Customer <span className="text-[#E74C3C]">*</span>
            </label>
            <EntityPicker
              key={`user-${resetKey}`}
              value={formUserId}
              onPick={setFormUserId}
              search={searchUsers}
              placeholder="Search by name / phone / email / HCID"
            />
          </div>

          <div>
            <label className={labelCls}>Wallet type</label>
            <EntityPicker
              key={`vendor-${resetKey}`}
              value={formVendorId}
              onPick={setFormVendorId}
              search={searchVendors}
              placeholder="Search vendor by business name"
              nullOption="H1 Platform Wallet (no vendor)"
            />
          </div>

          <div>
            <label className={labelCls}>
              Credit limit (₹) <span className="text-[#E74C3C]">*</span>
            </label>
            <div className="relative mb-2">
              <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
              <input
                type="number"
                min="0"
                step="100"
                value={formCreditLimit}
                onChange={(e) => setFormCreditLimit(e.target.value)}
                placeholder="e.g. 50000"
                className={cn(inputSm, 'pl-8')}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {LIMIT_CHIPS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setFormCreditLimit(String(amt))}
                  className="px-3 h-[30px] rounded-full text-[12px] font-semibold border border-[#EEEEEE] text-[#7C7C7C] hover:border-[#299E60] hover:text-[#299E60] transition-colors"
                >
                  ₹{amt.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Payment terms</label>
            <div className="space-y-2">
              {(
                [
                  { v: '' as RepaymentMode, title: 'Platform default', desc: 'Use global credit policy from Config tab' },
                  { v: 'REPAY_BEFORE_NEXT_USE' as RepaymentMode, title: 'Pay before next use', desc: 'Customer must clear dues before buying on credit again' },
                  { v: 'ALLOW_USAGE_TILL_DUE' as RepaymentMode, title: 'Use until due date', desc: 'Customer keeps ordering; consolidated dues by cycle' },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.v || 'default'}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-[12px] border cursor-pointer transition-colors',
                    terms === opt.v ? 'border-[#299E60] bg-[#EEF8F1]/50' : 'border-[#EEEEEE] hover:border-[#299E60]/40',
                  )}
                >
                  <input
                    type="radio"
                    name="admin-terms"
                    checked={terms === opt.v}
                    onChange={() => setTerms(opt.v)}
                    className="mt-0.5 accent-[#299E60]"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-[#181725]">{opt.title}</span>
                    <span className="block text-[11.5px] text-[#AEAEAE]">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {terms === 'REPAY_BEFORE_NEXT_USE' && (
              <div className="mt-3">
                <label className={labelCls}>Credit tenure (days)</label>
                <input
                  type="number"
                  min="0"
                  value={formCreditTenureDays}
                  onChange={(e) => setFormCreditTenureDays(e.target.value)}
                  placeholder="Platform default"
                  className={inputSm}
                />
              </div>
            )}
            {terms === 'ALLOW_USAGE_TILL_DUE' && (
              <div className="mt-3">
                <label className={labelCls}>Billing cycle</label>
                <select value={cycle} onChange={(e) => setCycle(e.target.value as BillingModel)} className={inputSm}>
                  <option value="WEEKLY">Weekly</option>
                  <option value="FORTNIGHTLY">Fortnightly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="text-[12.5px] font-semibold text-[#299E60] hover:underline"
            >
              {showAdvanced ? 'Hide' : 'Show'} interest, penalty &amp; grace overrides
            </button>
            {showAdvanced && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Grace (days)</label>
                  <input type="number" min="0" value={formGracePeriodDays} onChange={(e) => setFormGracePeriodDays(e.target.value)} placeholder="Default" className={inputSm} />
                </div>
                <div>
                  <label className={labelCls}>Interest (%)</label>
                  <input type="number" min="0" step="0.1" value={formInterestRatePct} onChange={(e) => setFormInterestRatePct(e.target.value)} placeholder="Default" className={inputSm} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Late fee (₹)</label>
                  <input type="number" min="0" value={formPenaltyAmount} onChange={(e) => setFormPenaltyAmount(e.target.value)} placeholder="Default" className={inputSm} />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Remark (audit log)</label>
            <input type="text" value={formRemark} onChange={(e) => setFormRemark(e.target.value)} placeholder="Optional note" className={INPUT_CLS} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#EEEEEE] flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 h-[38px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold text-[#7C7C7C]">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="px-5 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Assign / Update
          </button>
        </div>
      </div>
    </div>
  );
}
