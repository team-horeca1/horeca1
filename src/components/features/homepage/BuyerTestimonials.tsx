'use client';

import { SectionHeader } from '@/components/ui/SectionHeader';

const TESTIMONIALS = [
  {
    quote: 'Cut our ordering time in half — no more calling five suppliers every morning.',
    name: 'Rakesh Mehta',
    role: 'Owner, Spice Route Kitchen',
  },
  {
    quote: 'DiSCCO credit meant we could stock up for festival season without waiting on cash flow.',
    name: 'Priya Nair',
    role: 'Purchase Manager, Coastal Bites',
  },
  {
    quote: 'One place for rice, oils, dairy and cleaning — our kitchen managers finally stopped juggling WhatsApp groups.',
    name: 'Ananya Desai',
    role: 'Ops Lead, Cloud Kitchen Collective',
  },
] as const;

export function BuyerTestimonials() {
  return (
    <section className="w-full py-6 md:py-8 bg-white border-t border-divider">
      <div className="max-w-[var(--container-max)] mx-auto">
        <div className="px-4 md:px-[var(--container-padding)] mb-3 md:mb-4">
          <SectionHeader title="What Our Buyers Say" subtitle="From kitchens that buy every week" />
        </div>

        <div className="overflow-x-auto no-scrollbar md:overflow-visible scroll-smooth">
          <div className="flex md:grid md:grid-cols-3 gap-3 md:gap-4 px-4 md:px-[var(--container-padding)] w-max md:w-auto">
            {TESTIMONIALS.map((t) => (
              <article
                key={t.name}
                className="min-w-[240px] max-w-[280px] md:min-w-0 md:max-w-none shrink-0 bg-ivory border border-divider border-l-[3px] border-l-primary rounded-r-xl rounded-l-sm p-4 shadow-cdl-1"
              >
                <p className="text-[28px] leading-none text-[#C9C4B8] font-serif select-none" aria-hidden>
                  &ldquo;
                </p>
                <p className="text-[13px] md:text-[14px] text-[#444] leading-relaxed mt-1 text-pretty">
                  {t.quote}
                </p>
                <div className="flex items-center gap-2.5 mt-4">
                  <div
                    className="size-8 rounded-full bg-primary-light text-primary flex items-center justify-center text-[11px] font-bold shrink-0"
                    aria-hidden
                  >
                    {t.name
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-[#1C1C1C] truncate">{t.name}</p>
                    <p className="text-[11px] text-[#667085] truncate">{t.role}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
