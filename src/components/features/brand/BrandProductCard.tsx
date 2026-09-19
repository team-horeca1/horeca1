'use client';

import { ShareButton } from '@/components/features/share/ShareButton';
import { brandShareContent } from '@/lib/share-cards/types';
import { cn } from '@/lib/utils';
import { Chip } from '@/components/ui/Chip';
import {
  brandHighlightTag,
  formatShelfLife,
  nearbySupplierCount,
  type BrandVegMark,
} from '@/lib/brandStoreUtils';

const PRODUCT_IMAGE_FALLBACK = '/images/placeholders/no-product.svg';

export interface BrandCardProduct {
  id: string;
  name: string;
  image?: string;
  packSize?: string;
  unit?: string;
  vegNonVeg?: BrandVegMark | string | null;
  storageType?: string | null;
  shelfLifeDays?: number | null;
  tags?: string[] | null;
  fssaiRef?: string | null;
  distributors: Array<{ inStock: boolean; servicesPincode?: boolean }>;
}

function VegMark({ kind }: { kind: BrandVegMark }) {
  const color = kind === 'veg' ? '#16A34A' : kind === 'egg' ? '#D97706' : '#B45309';
  return (
    <span
      className="absolute top-2 left-2 size-4 rounded-[3px] bg-white border-[1.5px] flex items-center justify-center"
      style={{ borderColor: color }}
      aria-label={kind === 'veg' ? 'Vegetarian' : kind === 'egg' ? 'Contains egg' : 'Non-vegetarian'}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

export function BrandProductCard({
  product,
  brandSlug,
  brandName,
  image,
  onOpenSuppliers,
}: {
  product: BrandCardProduct;
  brandSlug: string;
  brandName: string;
  image: string;
  onOpenSuppliers: () => void;
}) {
  const veg = product.vegNonVeg === 'veg' || product.vegNonVeg === 'nonveg' || product.vegNonVeg === 'egg'
    ? product.vegNonVeg
    : null;
  const shelf = formatShelfLife(product.shelfLifeDays);
  const highlight = brandHighlightTag(product);
  const nearby = nearbySupplierCount(product.distributors);

  // Brand SKU deep-links to brand store; share uses brand OG card (not raw CDN photo).
  const shareContent = {
    ...brandShareContent({
      slug: brandSlug,
      name: product.name,
      image: image && image !== PRODUCT_IMAGE_FALLBACK ? image : null,
    }),
    path: `/brand/${brandSlug}?sku=${product.id}`,
    text: `${product.name} · ${brandName} on Horeca1`,
    subtitle: brandName,
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenSuppliers}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenSuppliers();
        }
      }}
      className="group w-full text-left bg-white rounded-xl border border-divider overflow-hidden hover:border-primary/30 transition-colors cursor-pointer"
    >
      <div className="relative aspect-square bg-ivory">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image || PRODUCT_IMAGE_FALLBACK}
          alt=""
          className="w-full h-full object-contain p-3"
        />
        {veg && <VegMark kind={veg} />}
        <div className="absolute top-2 right-2 z-10">
          <ShareButton content={shareContent} variant="overlay" />
        </div>
      </div>

      <div className="px-2.5 pt-2 pb-3">
        <p className="text-[13px] font-semibold text-text leading-snug line-clamp-2 min-h-[2.4em]">
          {product.name}
        </p>
        {shelf && (
          <p className="mt-1 text-[11px] text-text-muted">{shelf}</p>
        )}
        {highlight && (
          <div className="mt-1.5">
            <Chip variant="neutral">{highlight}</Chip>
          </div>
        )}
        <p
          className={cn(
            'mt-2 text-[11px] font-medium',
            nearby > 0 ? 'text-success' : 'text-error',
          )}
        >
          {nearby > 0
            ? `Available at ${nearby} supplier${nearby === 1 ? '' : 's'} near you`
            : 'Unavailable in your area'}
        </p>
      </div>
    </div>
  );
}
