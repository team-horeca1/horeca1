'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { LayoutGrid, Package, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CategoryTreeChild, CategoryTreeNode } from '@/lib/categoryTree';

interface VendorCategoryRailProps {
  tree: CategoryTreeNode[];
  activeTab: string;
  productCount: number;
  onSelect: (tab: string) => void;
  /** Tab used when Your Items is tapped at root. Drilled state always returns to `all`. */
  yourItemsRootTab?: string;
  /** Brand stores omit Your Items — a brand is not a transacting entity. */
  showYourItems?: boolean;
}

function RailIcon({
  active,
  image,
  fallback,
}: {
  active: boolean;
  image?: string;
  fallback: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex size-10 rounded-full items-center justify-center overflow-hidden shrink-0',
        active ? 'bg-primary-tint' : 'bg-ivory',
      )}
    >
      {image ? (
        <Image src={image} alt="" width={36} height={36} className="object-contain size-full p-1.5" />
      ) : (
        fallback
      )}
    </div>
  );
}

function RailButton({
  label,
  active,
  onClick,
  count,
  image,
  fallback,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  image?: string;
  fallback: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex flex-col items-center md:flex-row md:gap-3 px-1 md:px-2.5 py-2.5 md:py-2 min-h-11',
        active ? 'md:bg-primary-tint md:rounded-xl' : 'md:hover:bg-ivory md:rounded-xl',
      )}
    >
      <RailIcon active={active} image={image} fallback={fallback} />
      <span
        className={cn(
          'mt-1 md:mt-0 text-[10px] md:text-[13px] font-medium md:font-semibold leading-tight text-center md:text-left line-clamp-2 md:truncate w-full md:flex-1',
          active ? 'text-primary' : 'text-text',
        )}
      >
        {label}
      </span>
      {typeof count === 'number' && (
        <span className="hidden md:inline text-[11px] font-medium text-text-muted tabular-nums shrink-0">
          {count}
        </span>
      )}
    </button>
  );
}

export function VendorCategoryRail({
  tree,
  activeTab,
  productCount,
  onSelect,
  yourItemsRootTab = 'prev-ordered',
  showYourItems = true,
}: VendorCategoryRailProps) {
  const activeName = activeTab.startsWith('cat:') ? activeTab.slice(4) : '';
  const drilledParent =
    tree.find((p) => p.name === activeName && p.children.length > 0)
    ?? tree.find((p) => p.children.some((c) => c.name === activeName))
    ?? null;

  const isYourItems = activeTab === yourItemsRootTab && yourItemsRootTab !== 'all';
  const isAll = activeTab === 'all';

  const goHome = () => onSelect('all');

  return (
    <aside className="w-[72px] md:w-[200px] lg:w-[240px] shrink-0 sticky top-[4.25rem] md:top-24 max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar">
      <div className="bg-white md:rounded-2xl md:border md:border-divider py-1.5 md:p-2">
        {(showYourItems || drilledParent) && (
          <RailButton
            label={showYourItems ? 'Your Items' : 'Back'}
            active={isYourItems}
            onClick={() => {
              if (drilledParent) goHome();
              else onSelect(yourItemsRootTab);
            }}
            fallback={<Undo2 size={16} className={isYourItems ? 'text-primary' : 'text-text-muted'} strokeWidth={2} />}
          />
        )}

        {drilledParent ? (
          <>
            <RailButton
              label={drilledParent.name}
              active={activeTab === `cat:${drilledParent.name}`}
              onClick={() => onSelect(`cat:${drilledParent.name}`)}
              count={drilledParent.count}
              image={drilledParent.image}
              fallback={<Package size={16} className="text-text-muted" strokeWidth={1.5} />}
            />
            {drilledParent.children.map((child: CategoryTreeChild) => {
              const active = activeTab === `cat:${child.name}`;
              return (
                <RailButton
                  key={child.id}
                  label={child.name}
                  active={active}
                  onClick={() => onSelect(`cat:${child.name}`)}
                  count={child.count}
                  image={child.image}
                  fallback={<Package size={16} className="text-text-muted" strokeWidth={1.5} />}
                />
              );
            })}
          </>
        ) : (
          <>
            <RailButton
              label="All"
              active={isAll}
              onClick={goHome}
              count={productCount}
              fallback={<LayoutGrid size={16} className={isAll ? 'text-primary' : 'text-text-muted'} strokeWidth={1.5} />}
            />
            {tree.map((parent) => {
              const active = activeTab === `cat:${parent.name}`;
              return (
                <RailButton
                  key={parent.id}
                  label={parent.name}
                  active={active}
                  onClick={() => onSelect(`cat:${parent.name}`)}
                  count={parent.count}
                  image={parent.image}
                  fallback={<Package size={16} className="text-text-muted" strokeWidth={1.5} />}
                />
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}
