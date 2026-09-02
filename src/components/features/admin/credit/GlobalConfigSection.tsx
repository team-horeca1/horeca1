'use client';

import { useCallback, useEffect, useState } from 'react';
import { Info, Loader2, Save, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { buildPolicySummary, INPUT_CLS, type GlobalConfig } from './adminCreditTypes';

export function GlobalConfigSection() {
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const loadConfig = useCallback(() => {
    setLoading(true);
    fetch('/api/v1/admin/credit/config')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          const c = json.data as GlobalConfig;
          setConfig(c);
          setForm({
            repaymentMode: c.repaymentMode,
            billingModel: c.billingModel,
            creditLimit: String(c.creditLimit),
            creditTenureDays: String(c.creditTenureDays),
            gracePeriodDays: String(c.gracePeriodDays),
            blacklistDays: String(c.blacklistDays),
            interestRatePct: String(c.interestRatePct),
            interestFrequencyDays: String(c.interestFrequencyDays),
            penaltyAmount: String(c.penaltyAmount),
            penaltyFrequencyDays: String(c.penaltyFrequencyDays),
            eligiblePurchaseCount: String(c.eligiblePurchaseCount),
            unlockCreditAmount: String(c.unlockCreditAmount),
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const setField = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      const body = {
        repaymentMode: form.repaymentMode as GlobalConfig['repaymentMode'],
        billingModel: form.billingModel as GlobalConfig['billingModel'],
        creditLimit: Number(form.creditLimit),
        creditTenureDays: Number(form.creditTenureDays),
        gracePeriodDays: Number(form.gracePeriodDays),
        blacklistDays: Number(form.blacklistDays),
        interestRatePct: Number(form.interestRatePct),
        interestFrequencyDays: Number(form.interestFrequencyDays),
        penaltyAmount: Number(form.penaltyAmount),
        penaltyFrequencyDays: Number(form.penaltyFrequencyDays),
        eligiblePurchaseCount: Number(form.eligiblePurchaseCount),
        unlockCreditAmount: Number(form.unlockCreditAmount),
      };
      const res = await fetch('/api/v1/admin/credit/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || json.message || 'Failed to save config');
      toast.success('Global credit config updated');
      loadConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[#6B1D2E]" size={32} />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm flex flex-col items-center justify-center py-20 gap-3">
        <ShieldAlert className="text-[#E74C3C]" size={32} />
        <p className="text-[14px] text-[#7C7C7C] font-medium">Could not load global config.</p>
      </div>
    );
  }

  const labelCls = 'block text-[12px] font-semibold text-[#7C7C7C] mb-1';

  return (
    <div className="space-y-5">
      <div className="bg-[#F8E8EC] border border-[#6B1D2E]/20 rounded-[14px] px-4 py-3 flex gap-3 items-start">
        <Info size={18} className="text-[#6B1D2E] shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-bold text-[#181725]">Current policy summary</p>
          <p className="text-[12px] text-[#7C7C7C] mt-1 leading-relaxed">{buildPolicySummary(config)}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 md:p-6 space-y-8">
        <ConfigGroup title="Repayment & billing" desc="Default rules applied to new credit lines unless overridden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Repayment mode</label>
              <select value={form.repaymentMode ?? ''} onChange={(e) => setField('repaymentMode', e.target.value)} className={cn(INPUT_CLS, 'cursor-pointer h-[40px] text-[13px]')}>
                <option value="REPAY_BEFORE_NEXT_USE">Repay before next use</option>
                <option value="ALLOW_USAGE_TILL_DUE">Allow usage till due</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Billing model</label>
              <select value={form.billingModel ?? ''} onChange={(e) => setField('billingModel', e.target.value)} className={cn(INPUT_CLS, 'cursor-pointer h-[40px] text-[13px]')}>
                <option value="BILL_TO_BILL">Bill to bill</option>
                <option value="WEEKLY">Weekly</option>
                <option value="FORTNIGHTLY">Fortnightly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Default credit limit (₹)</label>
              <input type="number" min="0" value={form.creditLimit ?? ''} onChange={(e) => setField('creditLimit', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
          </div>
        </ConfigGroup>

        <ConfigGroup title="Limits & grace" desc="Tenure and blacklist thresholds">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Credit tenure (days)</label>
              <input type="number" min="0" value={form.creditTenureDays ?? ''} onChange={(e) => setField('creditTenureDays', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
            <div>
              <label className={labelCls}>Grace period (days)</label>
              <input type="number" min="0" value={form.gracePeriodDays ?? ''} onChange={(e) => setField('gracePeriodDays', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
            <div>
              <label className={labelCls}>Blacklist after (days overdue)</label>
              <input type="number" min="0" value={form.blacklistDays ?? ''} onChange={(e) => setField('blacklistDays', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
          </div>
        </ConfigGroup>

        <ConfigGroup title="Interest & penalties" desc="Automatic charges on overdue balances">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Interest rate (%)</label>
              <input type="number" min="0" step="0.001" value={form.interestRatePct ?? ''} onChange={(e) => setField('interestRatePct', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
            <div>
              <label className={labelCls}>Interest every (days)</label>
              <input type="number" min="1" value={form.interestFrequencyDays ?? ''} onChange={(e) => setField('interestFrequencyDays', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
            <div>
              <label className={labelCls}>Late fee (₹)</label>
              <input type="number" min="0" value={form.penaltyAmount ?? ''} onChange={(e) => setField('penaltyAmount', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
            <div>
              <label className={labelCls}>Late fee every (days)</label>
              <input type="number" min="1" value={form.penaltyFrequencyDays ?? ''} onChange={(e) => setField('penaltyFrequencyDays', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
          </div>
        </ConfigGroup>

        <ConfigGroup title="Unlock rules" desc="How new customers earn their first credit line">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Eligible purchase count</label>
              <input type="number" min="0" value={form.eligiblePurchaseCount ?? ''} onChange={(e) => setField('eligiblePurchaseCount', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
            <div>
              <label className={labelCls}>Unlock credit amount (₹)</label>
              <input type="number" min="0" value={form.unlockCreditAmount ?? ''} onChange={(e) => setField('unlockCreditAmount', e.target.value)} className={cn(INPUT_CLS, 'h-[40px] text-[13px]')} />
            </div>
          </div>
        </ConfigGroup>

        <button
          type="submit"
          disabled={saving}
          className="h-[40px] px-6 bg-[#6B1D2E] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#5A1926] disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Save changes
        </button>
      </form>
    </div>
  );
}

function ConfigGroup({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[15px] font-bold text-[#181725]">{title}</h3>
      <p className="text-[12px] text-[#AEAEAE] mb-4">{desc}</p>
      {children}
    </div>
  );
}
