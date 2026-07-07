'use client';

/**
 * BecomeVendorModal — lets a customer apply to also become a vendor on their
 * existing BusinessAccount. Submits to POST /api/v1/account/[id]/become-vendor
 * which flips the isVendor flag, creates the Vendor row (pending approval),
 * and grants the Vendor Admin role.
 *
 * After submit, the existing VendorApplicationBanner takes over and shows the
 * pending → approved status on the homepage automatically.
 */

import { useState } from 'react';
import { X, Store, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { FORM, TextField, FormField, FormTextarea, FormErrorBanner, useFormFeedback } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';

interface BecomeVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultBusinessName?: string;
  defaultGstNumber?: string;
  onSubmitted?: () => void;
}

export function BecomeVendorModal({
  isOpen, onClose, defaultBusinessName = '', defaultGstNumber = '', onSubmitted,
}: BecomeVendorModalProps) {
  const { data: session, update: updateSession } = useSession();
  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [description, setDescription] = useState('');
  const [gstNumber, setGstNumber] = useState(defaultGstNumber);
  const [minOrderValue, setMinOrderValue] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const {
    bannerError,
    fieldErrors,
    clearErrors,
    clearFieldError,
    applyApiError,
    applyValidationErrors,
  } = useFormFeedback();

  if (!isOpen) return null;

  const activeAccountId = (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId;

  const handleSubmit = async () => {
    if (!activeAccountId) {
      applyValidationErrors({}, 'No active business account. Please pick an account from the navbar switcher first.');
      return;
    }
    if (!businessName.trim() || businessName.trim().length < 2) {
      applyValidationErrors(
        { businessName: 'Business name is required (at least 2 characters)' },
        'Business name is required (at least 2 characters)',
        { dataField: true },
      );
      return;
    }
    setSubmitting(true);
    clearErrors();
    try {
      const res = await fetch(`/api/v1/account/${activeAccountId}/become-vendor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          description: description.trim() || undefined,
          gstNumber: gstNumber.trim() || undefined,
          minOrderValue: minOrderValue ? Number(minOrderValue) : undefined,
        }),
      });
      const json = await parseJsonResponse(res);
      if (!json.success) {
        applyApiError(json, {
          fieldOrder: ['businessName'],
          dataField: true,
        });
        setSubmitting(false);
        return;
      }
      // Refresh the JWT so session.user.role flips from 'customer' to 'vendor'
      // and activeBusinessAccountType.isVendor becomes true. Passing an explicit
      // argument (instead of a bare update()) forces NextAuth to re-fire the jwt
      // callback with trigger==='update' — a bare update() is sometimes a no-op
      // when the session hasn't visibly changed yet from the client's POV.
      await updateSession({ refresh: Date.now() });

      // Toast BEFORE navigation so the user sees confirmation, then we do a full
      // page navigation (not router.push) so the browser actually re-reads the
      // freshly-rotated session cookie and the vendor portal gates re-evaluate.
      toast.success('Vendor application submitted — admin will review shortly.');
      onSubmitted?.();
      onClose();
      window.location.assign('/vendor/dashboard');
    } catch {
      applyValidationErrors({ _server: 'Network error — try again' }, 'Network error — try again');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[14000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-[20px] w-full max-w-[520px] max-h-[90vh] flex flex-col overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-gray-100 animate-in zoom-in-95 duration-150">
        {/* Header with brand-style icon */}
        <div className="p-6 border-b border-gray-100 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#53B175] to-[#299E60] flex items-center justify-center shrink-0 shadow-lg shadow-emerald-100">
            <Store size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[17px] font-[800] text-[#181725] flex items-center gap-1.5 leading-snug">
              Become a vendor
              <Sparkles size={14} className="text-amber-500" />
            </h3>
            <p className="text-[12px] text-gray-400 mt-0.5 leading-normal">
              Start selling to other Horeca1 customers using your existing account.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-400 hover:text-gray-700" />
          </button>
        </div>

        <FormErrorBanner message={bannerError} className="mx-6 mt-0" />

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div data-field="businessName">
            <TextField
              label="Legal Business Name"
              required
              value={businessName}
              onChange={v => { setBusinessName(v); if (fieldErrors.businessName) clearFieldError('businessName'); }}
              placeholder="e.g. Dairy Direct Wholesale"
              error={fieldErrors.businessName}
            />
          </div>
          <Field
            label="Short description"
            value={description}
            onChange={setDescription}
            placeholder="What do you sell? (one line)"
            multiline
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="GSTIN (optional)"
              value={gstNumber}
              onChange={setGstNumber}
              placeholder="22AAAAA0000A1Z5"
            />
            <Field
              label="Minimum order value (₹)"
              value={minOrderValue}
              onChange={(v) => setMinOrderValue(v.replace(/[^0-9]/g, ''))}
              placeholder="0"
              inputMode="numeric"
            />
          </div>

          {/* What happens next */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 mt-2">
            <p className="text-[12px] font-bold text-emerald-950 mb-1.5">What happens after you submit</p>
            <ol className="text-[11.5px] text-emerald-900/80 space-y-1.5 list-decimal list-inside">
              <li>You stay logged in to the same account.</li>
              <li>Admin reviews your application (usually within 24 hours).</li>
              <li>Once approved, the <strong className="text-emerald-950">Vendor</strong> portal becomes available in the navbar.</li>
              <li>You can keep buying as a customer the whole time.</li>
            </ol>
          </div>

        </div>

        <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 text-[13px] font-bold text-gray-500 hover:bg-gray-100/80 rounded-xl transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !businessName.trim()}
            className={cn(FORM.primaryBtn, 'px-6 py-2.5 text-[13px] shadow-emerald-100')}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
      </div>
    </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, multiline, inputMode }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
}) {
  if (multiline) {
    return (
      <FormField label={label} required={required}>
        <FormTextarea value={value} onChange={onChange} placeholder={placeholder} rows={2} />
      </FormField>
    );
  }
  return (
    <TextField label={label} required={required} value={value} onChange={onChange} placeholder={placeholder} inputMode={inputMode} />
  );
}
