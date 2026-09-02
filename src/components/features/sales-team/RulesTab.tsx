'use client';

// Commission Rules tab — list rules + add new. Each rule binds a
// salesperson to a scope (default | customer | brand | category) with
// either a percent rate or a fixed amount.

import { useEffect, useState, useMemo } from 'react';
import { Plus, Power, Loader2, AlertCircle, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';

type Scope = 'default' | 'customer' | 'brand' | 'category';

interface RuleRow {
  id: string;
  vendorId: string;
  salespersonId: string;
  scope: Scope;
  scopeRefId: string | null;
  ratePercent: string | null;
  rateFixed: string | null;
  minOrderValue: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  salesperson: { id: string; name: string; isActive: boolean };
}

interface Props {
  salespersons: Array<{ id: string; name: string; isActive: boolean }>;
  perms: string[];
}

export function RulesTab({ salespersons, perms }: Props) {
  const canEdit = perms.includes('commissions.edit');
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const confirm = useConfirm();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/commission-rules?includeInactive=true');
      const json = await res.json();
      if (json.success) setRows(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleDisable = async (rule: RuleRow) => {
    const ok = await confirm({
      title: 'Disable rule?',
      message: 'New orders will not generate accruals from this rule. Existing accruals are kept.',
      confirmText: 'Disable',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/vendor/commission-rules/${rule.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      toast.success('Rule disabled');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            className="h-[40px] px-4 bg-primary hover:bg-primary-dark text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus size={15} /> Add Rule
          </button>
        )}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-[12px] overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <AlertCircle size={20} className="mx-auto text-[#AEAEAE] mb-2" />
            <p className="text-[13px] font-bold text-[#181725]">No commission rules yet</p>
            <p className="text-[12px] text-[#7C7C7C]">Add a default rate per salesperson, or a customer/brand/category override.</p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-[#FAFAFA]">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Salesperson</th>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Scope</th>
                <th className="text-right px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Rate</th>
                <th className="text-right px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Min Order</th>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Window</th>
                <th className="text-center px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Status</th>
                <th className="text-right px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#F5F5F5] hover:bg-[#FAFAFA]/60">
                  <td className="px-4 py-3 font-bold text-[#181725]">{r.salesperson.name}</td>
                  <td className="px-4 py-3 text-[#7C7C7C] capitalize">{r.scope}</td>
                  <td className="px-4 py-3 text-right font-bold text-[#181725]">
                    {r.ratePercent != null ? `${r.ratePercent}%` : `₹${r.rateFixed}`}
                  </td>
                  <td className="px-4 py-3 text-right text-[#7C7C7C]">{r.minOrderValue ? `₹${r.minOrderValue}` : '—'}</td>
                  <td className="px-4 py-3 text-[#7C7C7C] text-[12px]">
                    {r.validFrom || r.validTo
                      ? `${r.validFrom ? new Date(r.validFrom).toLocaleDateString() : '∞'} → ${r.validTo ? new Date(r.validTo).toLocaleDateString() : '∞'}`
                      : '∞'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.isActive ? (
                      <span className="text-[10.5px] font-bold text-primary bg-success-light px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-[10.5px] font-bold text-[#7C7C7C] bg-[#F5F5F5] px-2 py-0.5 rounded-full">Disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && r.isActive && (
                      <button
                        onClick={() => handleDisable(r)}
                        title="Disable"
                        className="p-1.5 hover:bg-[#F5F5F5] rounded-[8px] text-red-500"
                      >
                        <Power size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <RuleDialog
          salespersons={salespersons.filter((s) => s.isActive)}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refresh(); }}
        />
      )}
    </div>
  );
}

// ── Create Rule Dialog ──────────────────────────────────────────────────
function RuleDialog({
  salespersons,
  onClose,
  onSaved,
}: {
  salespersons: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [salespersonId, setSalespersonId] = useState(salespersons[0]?.id ?? '');
  const [scope, setScope] = useState<Scope>('default');
  const [scopeRefId, setScopeRefId] = useState('');
  const [rateType, setRateType] = useState<'percent' | 'fixed'>('percent');
  const [rateValue, setRateValue] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');

  // Options for the scope-ref dropdown depending on scope choice. We lazy-
  // load customers / brands / categories the first time the user picks the
  // scope so we don't fetch lists they never use.
  const [refOptions, setRefOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRefOptions = async (s: Scope) => {
    if (s === 'default') { setRefOptions([]); return; }
    setRefLoading(true);
    try {
      const url =
        s === 'customer' ? '/api/v1/vendor/customers' :
        s === 'brand'    ? '/api/v1/brands' :
                           '/api/v1/admin/categories';
      const res = await fetch(url);
      const json = await res.json();
      if (!json.success) { setRefOptions([]); return; }
      // Each endpoint returns a slightly different shape; we normalize.
      type CustomerRow = { id: string; user?: { fullName?: string; businessName?: string }; fullName?: string; businessName?: string };
      type BrandRow = { id: string; name: string };
      type CategoryRow = { id: string; name: string };
      const data = (json.data ?? []) as Array<CustomerRow | BrandRow | CategoryRow>;
      const opts = data.map((row): { id: string; label: string } => {
        if (s === 'customer') {
          const r = row as CustomerRow;
          return { id: r.id, label: r.user?.fullName ?? r.user?.businessName ?? r.businessName ?? r.fullName ?? r.id };
        }
        const r = row as BrandRow | CategoryRow;
        return { id: r.id, label: r.name };
      });
      setRefOptions(opts);
    } finally {
      setRefLoading(false);
    }
  };

  // Memo derived options so the JSX render-keys are stable.
  const scopeLabel = useMemo(() => ({
    default: 'All orders (default)',
    customer: 'Customer-specific',
    brand: 'Brand-specific',
    category: 'Category-specific',
  } as Record<Scope, string>), []);

  const handleScopeChange = (next: Scope) => {
    setScope(next);
    setScopeRefId('');
    fetchRefOptions(next);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!salespersonId) { setError('Pick a salesperson'); return; }
    if (scope !== 'default' && !scopeRefId) { setError(`Pick a ${scope}`); return; }
    const numericRate = Number(rateValue);
    if (!Number.isFinite(numericRate) || numericRate < 0) { setError('Rate must be a non-negative number'); return; }
    if (rateType === 'percent' && numericRate > 100) { setError('Percent rate cannot exceed 100'); return; }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        salespersonId,
        scope,
        scopeRefId: scope === 'default' ? null : scopeRefId,
        ratePercent: rateType === 'percent' ? numericRate : null,
        rateFixed: rateType === 'fixed' ? numericRate : null,
        minOrderValue: minOrderValue ? Number(minOrderValue) : null,
        validFrom: validFrom ? new Date(validFrom).toISOString() : null,
        validTo: validTo ? new Date(validTo).toISOString() : null,
      };
      const res = await fetch('/api/v1/vendor/commission-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || 'Failed');
        return;
      }
      toast.success('Rule added');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[15000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[520px] shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0] sticky top-0 bg-white">
          <h3 className="text-[15px] font-bold text-[#181725]">Add Commission Rule</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={16} className="text-[#7C7C7C]" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="Salesperson" required>
            <select
              value={salespersonId}
              onChange={(e) => setSalespersonId(e.target.value)}
              className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
            >
              {salespersons.length === 0 && <option value="">No active salespersons</option>}
              {salespersons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>

          <Field label="Applies to" required>
            <select
              value={scope}
              onChange={(e) => handleScopeChange(e.target.value as Scope)}
              className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
            >
              {(['default', 'customer', 'brand', 'category'] as Scope[]).map((s) => (
                <option key={s} value={s}>{scopeLabel[s]}</option>
              ))}
            </select>
          </Field>

          {scope !== 'default' && (
            <Field label={`Pick ${scope}`} required>
              <select
                value={scopeRefId}
                onChange={(e) => setScopeRefId(e.target.value)}
                disabled={refLoading}
                className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
              >
                <option value="">{refLoading ? 'Loading…' : `Select ${scope}…`}</option>
                {refOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
          )}

          <div>
            <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">
              Rate Type
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRateType('percent')}
                className={`flex-1 h-[40px] rounded-[10px] text-[12.5px] font-bold border-2 transition-all
                  ${rateType === 'percent' ? 'border-primary bg-success-light text-primary' : 'border-[#EEEEEE] bg-white text-[#7C7C7C]'}`}
              >
                Percent of order
              </button>
              <button
                type="button"
                onClick={() => setRateType('fixed')}
                className={`flex-1 h-[40px] rounded-[10px] text-[12.5px] font-bold border-2 transition-all
                  ${rateType === 'fixed' ? 'border-primary bg-success-light text-primary' : 'border-[#EEEEEE] bg-white text-[#7C7C7C]'}`}
              >
                Fixed per order
              </button>
            </div>
          </div>

          <Field label={rateType === 'percent' ? 'Rate (%)' : 'Rate (₹)'} required>
            <input
              type="number" min="0" max={rateType === 'percent' ? 100 : undefined} step="0.01"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              placeholder={rateType === 'percent' ? '5' : '50'}
              className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
            />
          </Field>

          <Field label="Min order value (₹) — optional">
            <input
              type="number" min="0" step="0.01"
              value={minOrderValue}
              onChange={(e) => setMinOrderValue(e.target.value)}
              placeholder="No minimum"
              className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valid from">
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
              />
            </Field>
            <Field label="Valid until">
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
              />
            </Field>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-[10px]">
              <AlertCircle size={13} className="text-red-500 shrink-0" />
              <p className="text-[12px] text-red-700">{error}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#F0F0F0] bg-[#FAFAFA] rounded-b-[16px] sticky bottom-0">
          <button
            onClick={onClose} disabled={saving}
            className="h-[38px] px-4 text-[#7C7C7C] hover:text-[#181725] text-[12.5px] font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !salespersonId || !rateValue}
            className="h-[38px] px-5 bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white rounded-[10px] text-[12.5px] font-bold flex items-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
