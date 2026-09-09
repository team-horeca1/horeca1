'use client';

import Link from 'next/link';
import Image from 'next/image';
import { LayoutGrid, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CatNode } from '@/lib/categoryBrowse';

function RailName({ name }: { name: string }) {
  const parts = name.split(' & ');
  if (parts.length < 2) return name;
  return (
    <>
      <span className="md:hidden">
        {parts[0]} &<br />
        {parts.slice(1).join(' & ')}
      </span>
      <span className="hidden md:inline">{name}</span>
    </>
  );
}

function CategoryRailLink({
  href,
  name,
  image,
  active,
}: {
  href: string;
  name: string;
  image?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={name}
      className={cn(
        'w-full min-h-12 rounded-xl transition-colors text-left flex flex-col items-center justify-center md:flex-row md:items-center md:justify-start min-w-0',
        'px-0.5 py-2 md:px-2 md:py-1.5 md:gap-2',
        active ? 'bg-primary-light' : 'hover:bg-gray-50',
      )}
    >
      <div
        className={cn(
          'rounded-full md:rounded-lg overflow-hidden relative shrink-0 bg-white ring-2 ring-white shadow-sm size-10 min-[360px]:size-11 md:size-7',
          active ? 'border border-primary/30' : 'border border-divider',
        )}
      >
        {image ? (
          <Image src={image} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <Package size={14} className="text-gray-300" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <span
        className={cn(
          'leading-snug text-center md:text-left mt-1 md:mt-0 line-clamp-2 md:truncate w-full md:flex-1 overflow-hidden',
          'text-[11px] md:text-xs font-semibold',
          active ? 'text-primary' : 'text-[#667085]',
        )}
      >
        <RailName name={name} />
      </span>
    </Link>
  );
}

export function CategoryBrowseSidebar({
  parent,
  activeChildSlug,
}: {
  parent: CatNode;
  activeChildSlug: string | null;
}) {
  const viewingParent = !activeChildSlug;

  return (
    <aside className="w-[5.5rem] min-[360px]:w-24 md:w-[200px] lg:w-[260px] shrink-0 sticky top-[5.75rem] md:top-24 self-start">
      <div className="bg-white rounded-2xl border border-gray-100 p-1 md:p-3 shadow-sm max-h-[calc(100dvh-11rem)] md:max-h-[calc(100vh-120px)] overflow-y-auto">
        <Link
          href="/"
          className="hidden md:flex items-center gap-1.5 px-2 py-1.5 mb-1 text-[11px] font-semibold text-[#667085] hover:text-primary transition-colors"
        >
          Shop categories
        </Link>

        <Link
          href={`/category/${parent.slug}`}
          className={cn(
            'w-full min-h-12 rounded-xl transition-colors text-left flex flex-col items-center justify-center md:flex-row md:items-center md:justify-start md:gap-3 px-0.5 py-2 md:px-3 md:py-2.5',
            viewingParent ? 'bg-primary-light' : 'hover:bg-gray-50',
          )}
        >
          <div
            className={cn(
              'size-10 min-[360px]:size-11 md:size-9 rounded-full md:rounded-lg flex items-center justify-center shrink-0 bg-white ring-2 ring-white shadow-sm overflow-hidden',
              viewingParent ? 'border border-primary/30' : 'border border-divider',
            )}
          >
            {parent.image ? (
              <span className="relative w-full h-full">
                <Image src={parent.image} alt="" fill sizes="44px" className="object-cover" />
              </span>
            ) : (
              <LayoutGrid className="size-5 md:size-4 text-gray-400" strokeWidth={1.5} />
            )}
          </div>
          <span
            className={cn(
              'text-[11px] md:text-[13px] font-semibold md:font-bold leading-snug text-center md:text-left mt-1 md:mt-0 line-clamp-2 md:truncate w-full md:flex-1',
              viewingParent ? 'text-primary' : 'text-[#181725]',
            )}
          >
            <span className="md:hidden">All</span>
            <span className="hidden md:inline">All {parent.name}</span>
          </span>
        </Link>

        {parent.children.length > 0 ? (
          <div className="md:ml-3 md:pl-3 md:border-l-2 md:border-primary/20">
            <p className="hidden md:block px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#667085]">
              Sub-categories
            </p>
            {parent.children.map((child) => (
              <CategoryRailLink
                key={child.id}
                href={`/category/${child.slug}`}
                name={child.name}
                image={child.image}
                active={activeChildSlug === child.slug}
              />
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
