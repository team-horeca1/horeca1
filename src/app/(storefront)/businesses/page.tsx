'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Loader2, Plus, Store, ShoppingBag, Sparkles, X, ArrowRight } from 'lucide-react';
import { FORM } from '@/components/ui/form';
import { toast } from 'sonner';
import { CreateBusinessAccountModal } from '@/components/auth/CreateBusinessAccountModal';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import {
  businessKindLabel,
  kindFromFlags,
  type BusinessKind,
} from '@/lib/businessCapability';
import { cn } from '@/lib/utils';
import {
  VendorProfileForm,
  type VendorProfileValues,
} from '@/components/features/vendor/VendorProfileForm';
import { EMPTY_VENDOR_PROFILE } from '@/components/features/vendor/vendorProfileDefaults';
import {
  getEffectiveVendorTypeSelections,
  validateFieldBlur as validateVendorFieldBlur,
} from '@/lib/validators/vendor-profile';

type HubStore = {
  id: string;
  name: string;
  isActive: boolean;
  isPrimaryStore: boolean;
};

type HubBrand = {
  id: string;
  name: string;
  approvalStatus: string;
  isActive: boolean;
} | null;

type HubAccount = {
  id: string;
  legalName: string;
  displayName: string | null;
  gstin: string | null;
  status: string;
  isPrimary: boolean;
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
  capability: BusinessKind;
  stores: HubStore[];
  brand: HubBrand;
  catalogueCount?: number;
  outlets: Array<{ id: string; name: string; pincode: string | null }>;
};

function accountName(a: HubAccount): string {
  return a.displayName || a.legalName;
}

function AddTile({
  title,
  subtitle,
  onClick,
  testId,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="w-full min-h-[168px] h-full text-left border border-dashed border-divider rounded-[16px] p-5 bg-ivory/70 hover:border-primary/40 hover:bg-primary-light/40 active:scale-[0.99] transition-[border-color,background-color,transform] duration-150 flex flex-col"
    >
      <span className="size-10 rounded-[10px] bg-white border border-divider flex items-center justify-center text-primary mb-3">
        <Plus size={18} />
      </span>
      <p className="text-[15px] font-semibold text-text text-balance">{title}</p>
      <p className="text-[13px] text-text-secondary mt-1.5 leading-relaxed text-pretty flex-1">{subtitle}</p>
      <span className="inline-flex items-center gap-1 mt-4 text-[13px] font-bold text-primary">
        Start <ArrowRight size={14} />
      </span>
    </button>
  );
}

function BusinessesHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { switchAccount, switching } = useBusinessAccountSwitcher();

  const [accounts, setAccounts] = useState<HubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [addKind, setAddKind] = useState<BusinessKind | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [supplierProfile, setSupplierProfile] = useState<VendorProfileValues>({ ...EMPTY_VENDOR_PROFILE });
  const [supplierErrors, setSupplierErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/account');
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error?.message ?? 'Failed to load businesses');
        return;
      }
      const rows = (json.data as HubAccount[]).map((a) => ({
        ...a,
        capability: a.capability ?? kindFromFlags(a),
        stores: a.stores ?? [],
        outlets: a.outlets ?? [],
        brand: a.brand ?? null,
      }));
      setAccounts(rows);
    } catch {
      toast.error('Failed to load businesses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  const suppliers = useMemo(() => accounts.filter((a) => a.capability === 'vendor'), [accounts]);
  const buyers = useMemo(() => accounts.filter((a) => a.capability === 'customer'), [accounts]);
  const brands = useMemo(() => accounts.filter((a) => a.capability === 'brand'), [accounts]);

  const openAdd = useCallback((kind: BusinessKind) => {
    if (kind === 'vendor') {
      if (suppliers.length === 0) {
        router.push('/vendor/register');
        return;
      }
      setShowAddSupplier(true);
      return;
    }
    setAddKind(kind);
  }, [router, suppliers.length]);

  useEffect(() => {
    if (loading) return;
    const add = searchParams.get('add');
    if (!add) return;
    if (add === 'buyer' || add === 'customer') setAddKind('customer');
    else if (add === 'brand') setAddKind('brand');
    else if (add === 'supplier' || add === 'vendor') {
      if (suppliers.length === 0) {
        router.replace('/vendor/register');
        return;
      }
      setShowAddSupplier(true);
    } else {
      return;
    }
    router.replace('/businesses', { scroll: false });
  }, [loading, searchParams, suppliers.length, router]);

  useEffect(() => {
    if (loading) return;
    if (searchParams.get('type') !== 'supplier') return;
    // Keep the page title in view — only nudge to the supplier block if it is below the fold.
    const el = document.getElementById('supplier-businesses');
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.65) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [searchParams, loading]);

  const closeAddSupplier = () => {
    if (submitting) return;
    setShowAddSupplier(false);
    setSupplierErrors({});
    setSupplierProfile({ ...EMPTY_VENDOR_PROFILE });
  };

  const enterBrand = async (a: HubAccount) => {
    setEnteringId(a.id);
    try {
      await switchAccount(a.id, undefined, { redirect: false });
      window.location.assign('/brand/portal');
    } catch {
      toast.error('Could not open brand dashboard');
      setEnteringId(null);
    }
  };

  const enterSupplier = async (a: HubAccount) => {
    setEnteringId(a.id);
    try {
      await switchAccount(a.id, undefined, { redirect: false });
      window.location.assign(`/vendor/businesses/${a.id}`);
    } catch {
      toast.error('Could not open supplier business');
      setEnteringId(null);
    }
  };

  const handleAddSupplier = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const legalName = (supplierProfile.legalName ?? supplierProfile.businessName ?? '').trim();
    const errors: Record<string, string> = {};
    if (legalName.length < 2) errors.legalName = 'Legal business name is required';
    const typeSelections = getEffectiveVendorTypeSelections(supplierProfile);
    if (typeSelections.length === 0) {
      errors.vendorTypeSelections = 'Select at least one vendor type and sub-type';
    }
    setSupplierErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/supplier/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName,
          displayName: (supplierProfile.displayName ?? '').trim() || undefined,
          gstin: (supplierProfile.gstin ?? supplierProfile.gstNumber ?? '').trim() || undefined,
          vendorTypeSelections: typeSelections,
          businessSize: supplierProfile.businessSize || undefined,
          categoriesHandled: supplierProfile.categoriesHandled ?? [],
          coverage: supplierProfile.coverage || undefined,
          warehouseCount: supplierProfile.warehouseCount
            ? Number(supplierProfile.warehouseCount)
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Failed to create supplier business');
        return;
      }
      toast.success('Supplier business created — add an Online Store when ready');
      const newId = json.data?.businessAccountId as string | undefined;
      setShowAddSupplier(false);
      setSupplierProfile({ ...EMPTY_VENDOR_PROFILE });
      if (newId) {
        router.push(`/vendor/businesses/${newId}`);
        return;
      }
      await fetchAccounts();
    } catch {
      toast.error('Failed to create supplier business');
    } finally {
      setSubmitting(false);
    }
  };

  const renderCard = (a: HubAccount) => {
    const kind = a.capability;
    const skuCount = a.catalogueCount ?? 0;
    const activeStores = a.stores.filter((s) => s.isActive).length;
    const childCount = kind === 'vendor'
      ? `${activeStores} of ${a.stores.length} online store${a.stores.length === 1 ? '' : 's'}`
      : kind === 'brand'
        ? `${skuCount} SKU${skuCount === 1 ? '' : 's'}${a.brand?.approvalStatus ? ` · ${a.brand.approvalStatus}` : ''}`
        : `${a.outlets.length} outlet${a.outlets.length === 1 ? '' : 's'}`;

    const onEnter = kind === 'vendor'
      ? () => void enterSupplier(a)
      : kind === 'brand'
        ? () => void enterBrand(a)
        : null;
    const viewHref = kind === 'customer' ? `/businesses/${a.id}` : null;
    const cta = kind === 'vendor' ? 'View stores' : kind === 'brand' ? 'Enter Brand' : 'View outlets';

    const KindIcon = kind === 'vendor' ? Store : kind === 'brand' ? Sparkles : ShoppingBag;

    return (
      <div
        key={a.id}
        className="bg-white border border-primary/[0.12] rounded-[16px] p-5 flex flex-col min-h-[168px] hover:border-primary/35 hover:shadow-[0_8px_24px_rgba(107,29,46,0.06)] transition-[border-color,box-shadow] duration-150"
        data-testid="business-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="size-10 rounded-[10px] bg-primary-light flex items-center justify-center shrink-0">
            <KindIcon size={18} className="text-primary" />
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase text-primary bg-primary-light px-2 py-1 rounded-full">
            {businessKindLabel(kind)}
          </span>
        </div>
        <div className="min-w-0 mt-3 flex-1">
          <p className="font-semibold text-[16px] text-text truncate">{accountName(a)}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {a.isPrimary && (
              <span className="text-[11px] font-semibold text-text-muted">Primary</span>
            )}
            {accountName(a) !== a.legalName && (
              <p className="text-[12px] text-text-muted truncate">{a.legalName}</p>
            )}
          </div>
          <p className="text-text-secondary text-[13px] mt-2">{childCount}</p>
        </div>
        {viewHref ? (
          <Link
            href={viewHref}
            className="mt-4 inline-flex items-center justify-center min-h-12 px-4 text-[13px] font-bold text-white bg-primary hover:bg-primary-dark active:bg-primary-pressed rounded-[12px] active:scale-[0.97] transition-transform"
            data-testid="view-business"
          >
            {cta}
          </Link>
        ) : (
          <button
            type="button"
            disabled={switching || enteringId === a.id}
            onClick={onEnter ?? undefined}
            className="mt-4 inline-flex items-center justify-center gap-2 min-h-12 px-4 text-[13px] font-bold text-white bg-primary hover:bg-primary-dark active:bg-primary-pressed rounded-[12px] disabled:opacity-50 active:scale-[0.97] transition-transform"
            data-testid="view-business"
          >
            {enteringId === a.id ? <Loader2 size={14} className="animate-spin" /> : null}
            {cta}
          </button>
        )}
      </div>
    );
  };

  const section = (
    id: string,
    title: string,
    icon: typeof Store,
    rows: HubAccount[],
    emptyTitle: string,
    emptySubtitle: string,
    addKindValue: BusinessKind,
    addLabel: string,
  ) => {
    const Icon = icon;
    return (
      <section id={id} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[clamp(1.05rem,1.4vw+0.7rem,1.25rem)] font-bold text-primary flex items-center gap-2 min-w-0 text-balance">
            <Icon size={18} className="shrink-0" />
            {title}
          </h2>
          <button
            type="button"
            onClick={() => openAdd(addKindValue)}
            data-testid={`add-${addKindValue}-header`}
            className="inline-flex items-center gap-1 min-h-11 px-3 text-[13px] font-bold text-primary hover:bg-primary-light rounded-[12px] shrink-0"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">{addLabel}</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(renderCard)}
          <AddTile
            title={emptyTitle}
            subtitle={emptySubtitle}
            onClick={() => openAdd(addKindValue)}
            testId={`add-${addKindValue}-tile`}
          />
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="fluid-container py-[clamp(1.25rem,3vw,2.5rem)] space-y-8">
      <div className="rounded-[20px] bg-white border border-divider shadow-[0_8px_30px_rgba(0,0,0,0.04)] px-5 sm:px-7 py-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1">Your workspace</p>
        <h1 className="text-[clamp(1.35rem,2vw+0.5rem,1.75rem)] font-extrabold text-text leading-tight text-balance">
          My Businesses
        </h1>
        <p className="text-[13px] text-text-secondary mt-1 text-pretty max-w-[52rem]">
          Same types as signup — restaurant to order, supplier to sell, brand to publish catalogues.
        </p>
      </div>

      {section(
        'supplier-businesses',
        'Supplier businesses',
        Store,
        suppliers,
        'Onboard as Supplier',
        'Sell on Horeca1 — add a business, then Online Stores.',
        'vendor',
        'Add supplier',
      )}
      {section(
        'buyer-businesses',
        'Restaurant / Retail',
        ShoppingBag,
        buyers,
        'Restaurant or Retail',
        'Order supplies for your outlets',
        'customer',
        'Add restaurant or retail',
      )}
      {section(
        'brand-businesses',
        'Brand stores',
        Sparkles,
        brands,
        'Onboard as Brand',
        'Publish catalogues and map distributors',
        'brand',
        'Add brand',
      )}

      <CreateBusinessAccountModal
        isOpen={addKind === 'customer' || addKind === 'brand'}
        initialType={addKind === 'brand' ? 'brand' : 'customer'}
        lockType
        onClose={() => setAddKind(null)}
        onCreated={() => void fetchAccounts()}
      />

      {showAddSupplier && (
        <div
          className="fixed inset-0 z-[16000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={closeAddSupplier}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-supplier-title"
            data-testid="add-supplier-modal"
            className="bg-white rounded-[20px] w-full max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-divider"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 sm:p-6 border-b border-divider flex items-start gap-3 shrink-0">
              <div className="size-12 rounded-2xl bg-primary-light flex items-center justify-center shrink-0">
                <Store size={22} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="add-supplier-title" className="text-[17px] font-extrabold text-text leading-snug text-balance">
                  Add a supplier business
                </h3>
                <p className="text-[13px] text-text-secondary mt-1 leading-relaxed text-pretty">
                  Mapping only — add Online Stores from the business page when you are ready.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddSupplier}
                disabled={submitting}
                className="size-11 rounded-[12px] hover:bg-ivory flex items-center justify-center shrink-0"
                aria-label="Close add supplier"
              >
                <X size={18} className="text-text-muted" />
              </button>
            </div>
            <form onSubmit={(e) => void handleAddSupplier(e)} className="flex flex-col flex-1 min-h-0 min-w-0">
              <div className="p-5 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 min-w-0">
                <VendorProfileForm
                  value={supplierProfile}
                  onChange={(patch) => setSupplierProfile((prev) => ({ ...prev, ...patch }))}
                  errors={supplierErrors}
                  onFieldBlur={(field, value) => {
                    const msg = validateVendorFieldBlur(field, value);
                    setSupplierErrors((prev) => ({ ...prev, [field]: msg }));
                  }}
                  visibleSections={{ identity: true, ops: true }}
                  layout="modal"
                  showDisplayName
                  showCategories
                  showGstin
                />
              </div>
              <div className="p-5 border-t border-divider flex items-center justify-end gap-3 shrink-0 bg-ivory/60 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={closeAddSupplier}
                  disabled={submitting}
                  className="min-h-12 px-5 text-[13px] font-semibold text-text-secondary hover:bg-white rounded-[12px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={cn(FORM.primaryBtn, 'min-w-[8.5rem]')}
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {submitting ? 'Creating…' : 'Create Business'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BusinessesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      }
    >
      <BusinessesHubInner />
    </Suspense>
  );
}
