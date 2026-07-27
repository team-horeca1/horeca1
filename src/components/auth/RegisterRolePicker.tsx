'use client';

import Link from 'next/link';
import { ShoppingBag, Store, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RegisterRolePickerProps {
  redirectTo?: string | null;
}

const ROLES = [
  {
    id: 'customer' as const,
    href: (redirect: string | null) => {
      const qs = new URLSearchParams({ role: 'customer' });
      if (redirect) qs.set('redirect', redirect);
      return `/register?${qs.toString()}`;
    },
    icon: ShoppingBag,
    title: 'Onboard as Customer',
    subtitle: 'Order supplies for your business',
  },
  {
    id: 'vendor' as const,
    href: (redirect: string | null) =>
      redirect ? `/vendor/register?redirect=${encodeURIComponent(redirect)}` : '/vendor/register',
    icon: Store,
    title: 'Onboard as Supplier',
    subtitle: 'Sell on Horeca1 — full KYC, about 5 minutes',
  },
  {
    id: 'brand' as const,
    href: (redirect: string | null) =>
      redirect ? `/brand/register?redirect=${encodeURIComponent(redirect)}` : '/brand/register',
    icon: Sparkles,
    title: 'Onboard as Brand',
    subtitle: 'Register your brand on the marketplace',
  },
];

export function RegisterRolePicker({ redirectTo = null }: RegisterRolePickerProps) {
  const loginHref = `/login${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`;

  return (
    <div className="flex items-start justify-center px-4 py-5 min-h-[calc(100vh-150px)]">
      <div className="w-full max-w-[900px] rounded-[20px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-[#EEEEEE]">
        <div className="px-5 sm:px-7 pt-6 sm:pt-7 pb-5 border-b border-[#F5F5F5]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#299E60] mb-1">Get started</p>
              <h1 className="text-[clamp(1.25rem,2vw+0.5rem,1.75rem)] font-[800] text-[#181725] leading-tight">
                How do you want to join Horeca1?
              </h1>
              <p className="text-[13px] text-gray-500 mt-1">
                Choose how you&apos;ll use the platform — you can add more business types later.
              </p>
            </div>
            <p className="text-[13px] text-gray-500 lg:text-right shrink-0">
              Already have an account?{' '}
              <Link href={loginHref} className="text-[#299E60] font-[800] hover:underline">
                Login
              </Link>
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <Link
                  key={role.id}
                  href={role.href(redirectTo)}
                  className={cn(
                    'group flex flex-col gap-3 rounded-[14px] border border-[#EEEEEE] bg-[#FAFAFA] px-4 py-4',
                    'hover:border-[#299E60]/30 hover:bg-[#F7FBF8] transition-all duration-200',
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-[#EEEEEE] flex items-center justify-center shrink-0 shadow-sm group-hover:border-[#299E60]/20 transition-colors">
                    <Icon size={16} className="text-[#299E60]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[13px] text-[#181725] leading-tight">{role.title}</p>
                    <p className="text-[11.5px] text-gray-500 mt-0.5 leading-relaxed">{role.subtitle}</p>
                  </div>
                  <span className="flex items-center gap-1 text-[12px] font-bold text-[#299E60] group-hover:gap-1.5 transition-all">
                    Start <ArrowRight size={14} />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
