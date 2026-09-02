import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, Tag } from 'lucide-react';
import { OffersList } from '@/components/features/promo/OffersList';

export const metadata: Metadata = {
  title: 'Deals & Discounts · HoReCa Hub',
};

export default function DealsPage() {
  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-[clamp(1rem,3vw,2rem)] py-[clamp(1.25rem,4vw,2.5rem)]">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[13px] font-bold text-gray-400 hover:text-primary mb-4"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
          Home
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Tag size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-[clamp(1.4rem,2vw+0.8rem,1.9rem)] font-bold text-[#181725]">Deals & Discounts</h1>
            <p className="text-[13px] text-gray-400 font-medium">
              Copy a code and apply it at checkout. Store offers apply automatically.
            </p>
          </div>
        </div>
        <div className="mt-6">
          <OffersList />
        </div>
      </div>
    </div>
  );
}
