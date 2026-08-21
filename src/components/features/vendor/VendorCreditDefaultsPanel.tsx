'use client';

/**
 * Vendor → Credit → Defaults — supplier-level overrides of GlobalCreditConfig.
 * Empty fields mean "use global default". Persists via PATCH /api/v1/vendor/credit/config.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type RepaymentMode = 'REPAY_BEFORE_NEXT_USE' | 'ALLOW_USAGE_TILL_DUE';
type BillingModel = 'BILL_TO_BILL' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';

interface GlobalConfig {
  repaymentMode: RepaymentMode;
  billingModel: BillingModel;
  creditLimit: number;
  creditTenureDays: number;
  gracePeriodDays: number;
  blacklistDays: number;
  interestRatePct: number;
  interestFrequencyDays: number;
  penaltyAmount: number;
  penaltyFrequencyDays: number;
}

interface VendorConfig {
  repaymentMode: RepaymentMode | null;
  billingModel: BillingModel | null;
  defaultCreditLimit: number | null;
  creditTenureDays: number | null;
  gracePeriodDays: number | null;
  blacklistDays: number | null;
  interestRatePct: number | null;
  interestFrequencyDays: number | null;
  penaltyAmount: number | null;
  penaltyFrequencyDays: number | null;
  creditEnabled: boolean;
}

type FormState = {
  creditEnabled: boolean;
  repaymentMode: '' | RepaymentMode;
  billingModel: '' | BillingModel;
  defaultCreditLimit: string;
  creditTenureDays: string;
  gracePeriodDays: string;
  blacklistDays: string;
  interestRatePct: string;
  interestFrequencyDays: string;
  penaltyAmount: string;
  penaltyFrequencyDays: string;
};

const emptyForm = (): FormState => ({
  creditEnabled: true,
  repaymentMode: '',
  billingModel: '',
  defaultCreditLimit: '',
  creditTenureDays: '',
  gracePeriodDays: '',
  blacklistDays: '',
  interestRatePct: '',
  interestFrequencyDays: '',
  penaltyAmount: '',
  penaltyFrequencyDays: '',
});

function fromVendor(v: VendorConfig | null): FormState {
  if (!v) return emptyForm();
  return {
    creditEnabled: v.creditEnabled,
    repaymentMode: v.repaymentMode ?? '',
    billingModel: v.billingModel ?? '',
    defaultCreditLimit: v.defaultCreditLimit != null ? String(v.defaultCreditLimit) : '',
    creditTenureDays: v.creditTenureDays != null ? String(v.creditTenureDays) : '',
    gracePeriodDays: v.gracePeriodDays != null ? String(v.gracePeriodDays) : '',
    blacklistDays: v.blacklistDays != null ? String(v.blacklistDays) : '',
    interestRatePct: v.interestRatePct != null ? String(v.interestRatePct) : '',
    interestFrequencyDays: v.interestFrequencyDays != null ? String(v.interestFrequencyDays) : '',
    penaltyAmount: v.penaltyAmount != null ? String(v.penaltyAmount) : '',
    penaltyFrequencyDays: v.penaltyFrequencyDays != null ? String(v.penaltyFrequencyDays) : '',
  };
}

function parseOptionalNumber(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseOptionalInt(raw: string): number | null | undefined {
  const n = parseOptionalNumber(raw);
  if (n === null || n === undefined) return n;
  if (!Number.isInteger(n)) return undefined;
  return n;
}

const inputCls =
  'w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white';
const labelCls = 'block text-[12px] font-semibold text-[#7C7C7C] mb-1';

function ProvenanceHint({ globalLabel }: { globalLabel: string }) {
  return (
    <p className="text-[11px] text-[#AEAEAE] mt-1">
      Leave blank to use global: <span className="font-semibold text-[#7C7C7C]">{globalLabel}</span>
    </p>
  );
}

export function VendorCreditDefaultsPanel({ canEdit }: { canEdit: boolean }) {
  const [global, setGlobal] = useState<GlobalConfig | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/credit/config');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to load credit defaults');
      setGlobal(json.data.global as GlobalConfig);
      setForm(fromVendor(json.data.vendor as VendorConfig | null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load credit defaults');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const save = async () => {
    if (!canEdit) return;

    const defaultCreditLimit = parseOptionalNumber(form.defaultCreditLimit);
    const creditTenureDays = parseOptionalInt(form.creditTenureDays);
    const gracePeriodDays = parseOptionalInt(form.gracePeriodDays);
    const blacklistDays = parseOptionalInt(form.blacklistDays);
    const interestRatePct = parseOptionalNumber(form.interestRatePct);
    const interestFrequencyDays = parseOptionalInt(form.interestFrequencyDays);
    const penaltyAmount = parseOptionalNumber(form.penaltyAmount);
    const penaltyFrequencyDays = parseOptionalInt(form.penaltyFrequencyDays);

    if (
      defaultCreditLimit === undefined
      || creditTenureDays === undefined
      || gracePeriodDays === undefined
      || blacklistDays === undefined
      || interestRatePct === undefined
      || interestFrequencyDays === undefined
      || penaltyAmount === undefined
      || penaltyFrequencyDays === undefined
    ) {
      toast.error('Fix invalid numeric fields before saving');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/v1/vendor/credit/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditEnabled: form.creditEnabled,
          repaymentMode: form.repaymentMode === '' ? null : form.repaymentMode,
          billingModel: form.billingModel === '' ? null : form.billingModel,
          defaultCreditLimit,
          creditTenureDays,
          gracePeriodDays,
          blacklistDays,
          interestRatePct,
          interestFrequencyDays,
          penaltyAmount,
          penaltyFrequencyDays,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to save defaults');
      toast.success('Supplier credit defaults saved');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save defaults');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#299E60]" size={28} />
      </div>
    );
  }

  if (!global) {
    return (
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-8 text-center text-[13px] text-[#AEAEAE]">
        Could not load global credit policy.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 space-y-1">
        <h2 className="text-[16px] font-bold text-[#181725]">Supplier credit defaults</h2>
        <p className="text-[12px] text-[#AEAEAE] max-w-2xl">
          These defaults sit between the platform global policy and each customer&apos;s credit line.
          Blank fields inherit the global value. Customer-specific terms on a credit line still override these.
        </p>
      </div>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 space-y-5">
        <label className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-[#181725]">Enable credit for this store</p>
            <p className="text-[11px] text-[#AEAEAE]">When off, new assignments should be avoided until re-enabled</p>
          </div>
          <input
            type="checkbox"
            checked={form.creditEnabled}
            disabled={!canEdit}
            onChange={(e) => setField('creditEnabled', e.target.checked)}
            className="h-4 w-4 rounded border-[#DDD]"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Default credit limit (₹)</label>
            <input
              type="number"
              min={0}
              disabled={!canEdit}
              value={form.defaultCreditLimit}
              onChange={(e) => setField('defaultCreditLimit', e.target.value)}
              placeholder={String(global.creditLimit)}
              className={inputCls}
            />
            <ProvenanceHint globalLabel={`₹${global.creditLimit.toLocaleString('en-IN')}`} />
          </div>

          <div>
            <label className={labelCls}>Repayment option</label>
            <select
              disabled={!canEdit}
              value={form.repaymentMode}
              onChange={(e) => setField('repaymentMode', e.target.value as FormState['repaymentMode'])}
              className={inputCls}
            >
              <option value="">Use global default</option>
              <option value="REPAY_BEFORE_NEXT_USE">Pay before next usage</option>
              <option value="ALLOW_USAGE_TILL_DUE">Allow usage until due date</option>
            </select>
            <ProvenanceHint
              globalLabel={
                global.repaymentMode === 'REPAY_BEFORE_NEXT_USE'
                  ? 'Pay before next usage'
                  : 'Allow until due'
              }
            />
          </div>

          <div>
            <label className={labelCls}>Billing / tenure model</label>
            <select
              disabled={!canEdit}
              value={form.billingModel}
              onChange={(e) => setField('billingModel', e.target.value as FormState['billingModel'])}
              className={inputCls}
            >
              <option value="">Use global default</option>
              <option value="BILL_TO_BILL">Bill to bill</option>
              <option value="WEEKLY">Weekly</option>
              <option value="FORTNIGHTLY">Fortnightly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
            <ProvenanceHint globalLabel={global.billingModel.toLowerCase().replace(/_/g, ' ')} />
          </div>

          <div>
            <label className={labelCls}>Credit tenure (days)</label>
            <input
              type="number"
              min={0}
              disabled={!canEdit}
              value={form.creditTenureDays}
              onChange={(e) => setField('creditTenureDays', e.target.value)}
              placeholder={String(global.creditTenureDays)}
              className={inputCls}
            />
            <ProvenanceHint globalLabel={`${global.creditTenureDays} days`} />
          </div>

          <div>
            <label className={labelCls}>Grace period (days)</label>
            <input
              type="number"
              min={0}
              disabled={!canEdit}
              value={form.gracePeriodDays}
              onChange={(e) => setField('gracePeriodDays', e.target.value)}
              placeholder={String(global.gracePeriodDays)}
              className={inputCls}
            />
            <ProvenanceHint globalLabel={`${global.gracePeriodDays} days`} />
          </div>

          <div>
            <label className={labelCls}>Blacklist after (overdue days)</label>
            <input
              type="number"
              min={0}
              disabled={!canEdit}
              value={form.blacklistDays}
              onChange={(e) => setField('blacklistDays', e.target.value)}
              placeholder={String(global.blacklistDays)}
              className={inputCls}
            />
            <ProvenanceHint globalLabel={`${global.blacklistDays} days`} />
          </div>

          <div>
            <label className={labelCls}>Interest rate (%)</label>
            <input
              type="number"
              min={0}
              step="0.001"
              disabled={!canEdit}
              value={form.interestRatePct}
              onChange={(e) => setField('interestRatePct', e.target.value)}
              placeholder={String(global.interestRatePct)}
              className={inputCls}
            />
            <ProvenanceHint globalLabel={`${global.interestRatePct}%`} />
          </div>

          <div>
            <label className={labelCls}>Interest frequency (days)</label>
            <input
              type="number"
              min={1}
              disabled={!canEdit}
              value={form.interestFrequencyDays}
              onChange={(e) => setField('interestFrequencyDays', e.target.value)}
              placeholder={String(global.interestFrequencyDays)}
              className={inputCls}
            />
            <ProvenanceHint globalLabel={`every ${global.interestFrequencyDays}d`} />
          </div>

          <div>
            <label className={labelCls}>Penalty amount (₹)</label>
            <input
              type="number"
              min={0}
              disabled={!canEdit}
              value={form.penaltyAmount}
              onChange={(e) => setField('penaltyAmount', e.target.value)}
              placeholder={String(global.penaltyAmount)}
              className={inputCls}
            />
            <ProvenanceHint globalLabel={`₹${global.penaltyAmount}`} />
          </div>

          <div>
            <label className={labelCls}>Penalty frequency (days)</label>
            <input
              type="number"
              min={1}
              disabled={!canEdit}
              value={form.penaltyFrequencyDays}
              onChange={(e) => setField('penaltyFrequencyDays', e.target.value)}
              placeholder={String(global.penaltyFrequencyDays)}
              className={inputCls}
            />
            <ProvenanceHint globalLabel={`every ${global.penaltyFrequencyDays}d`} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#F3F3F3]">
          <button
            type="button"
            onClick={() => void load()}
            disabled={saving}
            className="px-4 h-[38px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold text-[#7C7C7C] flex items-center gap-2"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className={cn(
                'px-4 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold flex items-center gap-2 disabled:opacity-50',
              )}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save defaults
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
