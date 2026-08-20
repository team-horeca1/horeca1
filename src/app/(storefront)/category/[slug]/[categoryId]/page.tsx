'use client';

// This route is deprecated per UI/UX Notes V2.2:
//   "MAJOR ISSUES IN CURRENT FIGMA: No strong vendor journey —
//    User should feel they are buying from a supplier"
//
// The vendor-scoped category browse experience now lives on the unified
// Vendor Store page (/vendor/[id]?cat=<slug>) so there is ONE place users
// land on per vendor — with the Hyperpure-style 1-column sub-category
// sidebar. Bookmarks to the old /category/<vendorSlug>/<catSlug> URL are
// redirected here so external links continue to work.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function DeprecatedCategoryVendorPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;
    const categoryId = params.categoryId as string;

    useEffect(() => {
        if (!slug) return;
        const target = categoryId
            ? `/vendor/${slug}?cat=${encodeURIComponent(categoryId)}`
            : `/vendor/${slug}`;
        router.replace(target);
    }, [slug, categoryId, router]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <div className="w-8 h-8 border-2 border-[#53B175] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[14px] text-gray-500">Redirecting…</p>
            </div>
        </div>
    );
}
