'use client';

// Salespersons tab — list + create/edit/disable dialog. Soft-delete only
// (DELETE flips isActive). Phone + email are optional. Code is the
// vendor's internal employee-id (unique within the vendor).

import { useEffect, useState } from 'react';
import { Plus, Pencil, Power, Loader2, AlertCircle, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface SalespersonRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  code: string | null;
  userId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { vendorCustomers: number; orders: number; accruals: number };
}

interface Props {
  salespersons: Array<{ id: string; name: string; isActive: boolean }>;
  loading: boolean;
  perms: string[];
  onChanged: () => void;
}

export function SalespersonsTab({ perms, onChanged }: Props) {
  const canCreate = perms.includes('salespersons.create');
  const canEdit = perms.includes('salespersons.edit');
  const canDelete = perms.includes('salespersons.delete');

  const [rows, setRows] = useState<SalespersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SalespersonRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const confirm = useConfirm();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/salespersons?includeInactive=true');
      const json = await res.json();
      if (json.success) setRows(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleToggleActive = async (sp: SalespersonRow) => {
    const ok = await confirm({
      title: sp.isActive ? 'Disable salesperson?' : 'Re-enable salesperson?',
      message: sp.isActive
        ? `${sp.name} will be marked inactive. Their existing rules + accruals stay; they just don't show up in default lists.`
        : `${sp.name} will be re-enabled.`,
      confirmText: sp.isActive ? 'Disable' : 'Enable',
      tone: sp.isActive ? 'danger' : 'primary',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/vendor/salespersons/${sp.id}`, {
        method: sp.isActive ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: sp.isActive ? undefined : JSON.stringify({ isActive: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      toast.success(sp.isActive ? `${sp.name} disabled` : `${sp.name} re-enabled`);
      refresh();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="h-[40px] px-4 bg-primary hover:bg-primary-dark text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus size={15} /> Add Salesperson
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
            <p className="text-[13px] font-bold text-[#181725]">No salespersons yet</p>
            <p className="text-[12px] text-[#7C7C7C]">Add your first sales rep to start tracking commissions.</p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-[#FAFAFA]">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Name</th>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Code</th>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Phone</th>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Email</th>
                <th className="text-center px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Customers</th>
                <th className="text-center px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Accruals</th>
                <th className="text-center px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Status</th>
                <th className="text-right px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((sp) => (
                <tr key={sp.id} className="border-t border-[#F5F5F5] hover:bg-[#FAFAFA]/60">
                  <td className="px-4 py-3 font-bold text-[#181725]">{sp.name}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#7C7C7C]">{sp.code ?? '—'}</td>
                  <td className="px-4 py-3 text-[#7C7C7C]">{sp.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-[#7C7C7C]">{sp.email ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-[#7C7C7C]">{sp._count?.vendorCustomers ?? 0}</td>
                  <td className="px-4 py-3 text-center text-[#7C7C7C]">{sp._count?.accruals ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    {sp.isActive ? (
                      <span className="text-[10.5px] font-bold text-primary bg-success-light px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-[10.5px] font-bold text-[#7C7C7C] bg-[#F5F5F5] px-2 py-0.5 rounded-full">Disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => setEditing(sp)}
                          title="Edit"
                          className="p-1.5 hover:bg-[#F5F5F5] rounded-[8px] text-[#7C7C7C]"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleToggleActive(sp)}
                          title={sp.isActive ? 'Disable' : 'Enable'}
                          className={`p-1.5 hover:bg-[#F5F5F5] rounded-[8px] ${sp.isActive ? 'text-red-500' : 'text-primary'}`}
                        >
                          <Power size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(showCreate || editing) && (
        <SalespersonDialog
          editing={editing}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSaved={() => { setShowCreate(false); setEditing(null); refresh(); onChanged(); }}
        />
      )}
    </div>
  );
}

// ── Dialog ──────────────────────────────────────────────────────────────
function SalespersonDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: SalespersonRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (phone.trim()) body.phone = phone.trim();
      else if (editing) body.phone = null;
      if (email.trim()) body.email = email.trim();
      else if (editing) body.email = null;
      if (code.trim()) body.code = code.trim();
      else if (editing) body.code = null;

      const res = await fetch(
        editing ? `/api/v1/vendor/salespersons/${editing.id}` : '/api/v1/vendor/salespersons',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || 'Failed');
        return;
      }
      toast.success(editing ? 'Salesperson updated' : 'Salesperson added');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[15000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[460px] shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
          <h3 className="text-[15px] font-bold text-[#181725]">
            {editing ? 'Edit Salesperson' : 'Add Salesperson'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={16} className="text-[#7C7C7C]" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="Name" required>
            <input
              type="text" value={name} autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="Ramesh Kumar"
              className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code (Emp ID)">
              <input
                type="text" value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SR-001"
                className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] font-mono outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
              />
            </Field>
            <Field label="Phone (10-digit)">
              <input
                type="tel" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
              />
            </Field>
          </div>
          <Field label="Email">
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ramesh@vendor.com"
              className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
            />
          </Field>
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-[10px]">
              <AlertCircle size={13} className="text-red-500 shrink-0" />
              <p className="text-[12px] text-red-700">{error}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#F0F0F0] bg-[#FAFAFA] rounded-b-[16px]">
          <button
            onClick={onClose} disabled={saving}
            className="h-[38px] px-4 text-[#7C7C7C] hover:text-[#181725] text-[12.5px] font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="h-[38px] px-5 bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white rounded-[10px] text-[12.5px] font-bold flex items-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {editing ? 'Save' : 'Add'}
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
