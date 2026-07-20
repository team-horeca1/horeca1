'use client';

import Link from 'next/link';
import { Warehouse, ArrowRight } from 'lucide-react';

/**
 * Warehouses / multi-outlet fulfillment retired in Supplier Foundation.
 * Online Stores under a Business replace the old warehouse model.
 */
export default function VendorOutletsPage() {
  return (
    <div className="max-w-[560px] mx-auto py-16">
      <div className="bg-white border border-[#EEEEEE] rounded-[20px] p-10 text-center shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="w-16 h-16 rounded-full bg-[#F8F9FB] flex items-center justify-center mx-auto mb-5">
          <Warehouse size={28} className="text-[#AEAEAE]" />
        </div>
        <h1 className="text-[20px] font-bold text-[#181725] mb-2">Warehouses retired</h1>
        <p className="text-[14px] text-[#7C7C7C] leading-relaxed mb-8">
          Warehouses retired — create another Online Store instead.
        </p>
        <Link
          href="/vendor/businesses"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#299E60] hover:bg-[#238a54] text-white text-[14px] font-bold rounded-[10px] transition-colors"
        >
          Go to Businesses
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
