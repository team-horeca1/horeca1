'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { CategoryBrowseSidebar } from '@/components/features/category/CategoryBrowseSidebar';
import type { CatNode } from '@/lib/categoryBrowse';

export interface CategoryCrumb {
  href?: string;
  label: string;
}

export function CategoryBrowseLayout({
  displayName,
  image,
  subtitle,
  crumbs,
  parent,
  activeChildSlug,
  children,
}: {
  displayName: string;
  image?: string;
  subtitle: string;
  crumbs: CategoryCrumb[];
  parent: CatNode;
  activeChildSlug: string | null;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="bg-background min-h-dvh pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] md:pb-24">
      <div className="md:hidden bg-white border-b border-divider px-1 flex items-center justify-between sticky top-[2.75rem] z-40 min-h-12">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-11 shrink-0 items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft size={22} className="text-text" strokeWidth={2} />
        </button>
        <h1 className="flex-1 min-w-0 text-[14px] min-[360px]:text-[15px] font-bold text-primary truncate px-1 text-center">
          {displayName}
        </h1>
        <Link
          href="/search"
          className="flex size-11 shrink-0 items-center justify-center"
          aria-label="Search"
        >
          <Search size={20} className="text-text" strokeWidth={2} />
        </Link>
      </div>

      <div className="hidden md:block bg-white border-b border-divider">
        <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-8">
          <div className="flex items-center gap-2 text-[13px] text-text-secondary mb-5 font-medium">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex items-center gap-2">
                {i > 0 ? <span>/</span> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-primary transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-text font-semibold">{crumb.label}</span>
                )}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-5">
            {image ? (
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white ring-4 ring-white shadow-md shrink-0 relative">
                <Image src={image} alt={displayName} fill sizes="64px" className="object-cover" />
              </div>
            ) : null}
            <div>
              <h1 className="text-[clamp(1.4rem,2vw+0.75rem,1.875rem)] font-bold text-primary tracking-tight leading-none mb-1 text-balance">
                {displayName}
              </h1>
              <p className="text-sm text-text-secondary">{subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[var(--container-max)] mx-auto px-2 min-[380px]:px-3 md:px-[var(--container-padding)] pt-2 md:pt-6">
        <div className="flex gap-1.5 min-[380px]:gap-2 md:gap-4 lg:gap-6 items-start">
          <CategoryBrowseSidebar parent={parent} activeChildSlug={activeChildSlug} />
          <div className="flex-1 min-w-0 overflow-x-hidden">{children}</div>
        </div>
      </div>

      <StickyCartBar />
    </div>
  );
}
