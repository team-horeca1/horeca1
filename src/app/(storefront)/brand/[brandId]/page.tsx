'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrandStore } from '@/components/features/brand/BrandStore';

export default function BrandStorePage({ params }: { params: Promise<{ brandId: string }> }) {
    const { brandId } = use(params);
    const searchParams = useSearchParams();
    const initialCatSlug = searchParams?.get('cat') || '';
    return <BrandStore brandId={brandId} initialCatSlug={initialCatSlug} />;
}
