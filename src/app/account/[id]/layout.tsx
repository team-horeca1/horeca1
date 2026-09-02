'use client';
import { CDL } from '@/lib/cdl';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, MapPin, Users, ShieldCheck, Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { getAccountTabPermission } from '@/lib/permissions/routePermissions';
import { RequirePermission } from '@/components/auth/RequirePermission';

interface AccountHeader {
  id: string;
  legalName: string;
  displayName: string | null;
  gstin: string | null;
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
  status: string;
  _count?: { members: number; roles: number };
}

const TABS = [
  { href: '',         label: 'Overview', icon: Building2 },
  { href: '/outlets', label: 'Outlets',  icon: MapPin },
  { href: '/users',   label: 'Users',    icon: Users },
  { href: '/roles',   label: 'Roles',    icon: ShieldCheck },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={(
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    )}>
      <AccountLayoutInner>{children}</AccountLayoutInner>
    </Suspense>
  );
}

function AccountLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = params.id;
  const fromPortal = searchParams.get('from');
  const fromQs = fromPortal ? `?from=${fromPortal}` : '';

  useEffect(() => {
    if (fromPortal !== 'vendor') return;
    let tab = 'overview';
    if (pathname.endsWith('/outlets')) tab = 'outlets';
    else if (pathname.endsWith('/users') || pathname.endsWith('/roles')) tab = 'team';
    const dest = tab === 'overview' ? '/vendor/account' : `/vendor/account?tab=${tab}`;
    router.replace(dest);
  }, [fromPortal, pathname, router]);

  const backHref =
    fromPortal === 'vendor' ? '/vendor/dashboard'
    : fromPortal === 'brand' ? '/brand/portal'
    : '/';
  const backLabel =
    fromPortal === 'vendor' ? 'Back to Vendor Panel'
    : fromPortal === 'brand' ? 'Back to Brand Portal'
    : 'Back';

  const [account, setAccount] = useState<AccountHeader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { can, loading: permsLoading } = usePermissions();

  const visibleTabs = TABS.filter((t) => can(getAccountTabPermission(t.href)));

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) { setLoading(true); setError(null); } });
    fetch(`/api/v1/account/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) setError(json.error?.message ?? 'Could not load account');
        else setAccount(json.data as AccountHeader);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load account');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const basePath = `/account/${id}`;
  const activeTab = TABS.find(
    (t) => pathname === `${basePath}${t.href}` || (t.href === '' && pathname === basePath),
  );
  const pagePerm = getAccountTabPermission(activeTab?.href ?? '');

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-[1200px] mx-auto px-[clamp(1rem,3vw,2rem)] py-[clamp(1rem,3vw,2rem)]">
        <Link href={backHref} className="inline-flex items-center gap-2 text-[13px] text-[#666] hover:text-[#181725] mb-4">
          <ArrowLeft size={14} />
          {backLabel}
        </Link>

        {loading || permsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : error || !account ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
            {error ?? 'Account not found'}
          </div>
        ) : (
          <>
            <header className="bg-white rounded-2xl border border-[#F0F0F0] p-[clamp(1rem,2vw,1.5rem)] mb-[clamp(1rem,2vw,1.5rem)]">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div>
                  <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold text-[#181725]">
                    {account.displayName ?? account.legalName}
                  </h1>
                  <p className="text-[13px] text-[#666] mt-0.5">{account.legalName}</p>
                  {account.gstin && (
                    <p className="text-[12px] text-[#AEAEAE] font-mono mt-0.5">GSTIN: {account.gstin}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 sm:ml-auto">
                  {account.isCustomer && <Badge color="#2563EB" bg="#DBEAFE">Customer</Badge>}
                  {account.isVendor   && <Badge color={CDL.primary} bg={CDL.successLight}>Vendor</Badge>}
                  {account.isBrand    && <Badge color="#7C3AED" bg="#EDE9FE">Brand</Badge>}
                  {account.status !== 'active' && <Badge color="#DC2626" bg="#FEE2E2">{account.status}</Badge>}
                </div>
              </div>
            </header>

            {/* Tabs */}
            <nav className="bg-white rounded-2xl border border-[#F0F0F0] p-1 mb-[clamp(1rem,2vw,1.5rem)] flex gap-1 overflow-x-auto">
              {visibleTabs.map((t) => {
                const href = `${basePath}${t.href}${fromQs}`;
                const active = pathname === `${basePath}${t.href}` || (t.href === '' && pathname === basePath);
                const Icon = t.icon;
                return (
                  <Link
                    key={t.label}
                    href={href}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${
                      active ? 'bg-[#181725] text-white' : 'text-[#666] hover:bg-[#F8F8F8]'
                    }`}
                  >
                    <Icon size={14} />
                    {t.label}
                  </Link>
                );
              })}
            </nav>

            <RequirePermission perm={pagePerm}>
              {children}
            </RequirePermission>
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span
      className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
      style={{ color, backgroundColor: bg }}
    >
      {children}
    </span>
  );
}
