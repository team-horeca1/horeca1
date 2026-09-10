'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TocSection = {
  id: string;
  label: string;
};

export function VoicesOnThisPageSidebar({ sections }: { sections: TocSection[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id || '');

  useEffect(() => {
    if (!sections.length) return;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const offset = 200;

      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY;
          if (scrollY >= top - offset) {
            setActiveId(sections[i].id);
            return;
          }
        }
      }
      setActiveId(sections[0].id);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -90;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      setActiveId(id);
    }
  };

  return (
    <div className="sticky top-24 w-full space-y-6">
      <nav aria-label="On this page">
        <p className="text-[11px] font-bold text-text-secondary tracking-[0.16em] uppercase mb-3">
          On this page
        </p>
        <div className="relative">
          <div
            aria-hidden
            className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-divider"
          />
          <ul>
            {sections.map((sec) => {
              const isActive = activeId === sec.id;
              return (
                <li key={sec.id}>
                  <a
                    href={`#${sec.id}`}
                    onClick={(e) => scrollToSection(e, sec.id)}
                    className={cn(
                      'relative flex items-center gap-3.5 py-1.5 min-h-8',
                      isActive ? 'text-primary' : 'text-text-secondary hover:text-text',
                    )}
                  >
                    <span
                      className={cn(
                        'relative z-10 size-3 shrink-0 rounded-full',
                        isActive
                          ? 'bg-primary ring-4 ring-primary/15'
                          : 'bg-white border-2 border-divider',
                      )}
                    />
                    <span
                      className={cn(
                        'text-[13px] leading-none',
                        isActive ? 'font-bold' : 'font-medium',
                      )}
                    >
                      {sec.label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <Link
        href="/voices/nominate"
        className="flex items-center gap-3 w-full rounded-xl bg-primary hover:bg-primary-dark text-white px-3.5 py-3 min-h-12 transition-colors"
      >
        <span className="size-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
          <BookOpen size={16} className="text-white" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[13px] font-semibold leading-tight">Nominate a Voice</span>
          <span className="block text-[11px] text-white/80 mt-0.5 leading-tight">
            Celebrate industry leaders
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-white/80" />
      </Link>
    </div>
  );
}
