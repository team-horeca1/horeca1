'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[13px] font-bold text-[#181725] mb-1.5">
      {children}
      {required && <span className="text-[#E74C3C] ml-0.5">*</span>}
    </label>
  );
}

export function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5 mt-1">
      <div className="w-[32px] h-[32px] rounded-[8px] bg-primary-light flex items-center justify-center text-primary">
        {icon}
      </div>
      <h3 className="text-[16px] font-bold text-[#181725]">{title}</h3>
    </div>
  );
}

interface FormSectionProps {
  title: string;
  icon?: React.ReactNode;
  requiredBadge?: boolean;
  sectionId?: string;
  children: React.ReactNode;
  className?: string;
}

export default function FormSection({ title, icon, requiredBadge, sectionId, children, className }: FormSectionProps) {
  return (
    <div
      id={sectionId ? `section-${sectionId}` : undefined}
      className={cn(
        'bg-white rounded-[14px] border shadow-sm p-6 space-y-4 scroll-mt-4',
        requiredBadge ? 'border-primary/25' : 'border-[#EEEEEE]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {icon ? <SectionHeader icon={icon} title={title} /> : (
          <h3 className="text-[16px] font-bold text-[#181725]">{title}</h3>
        )}
        {requiredBadge && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary-light px-2.5 py-1 rounded-full shrink-0">
            Required
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export const productFormInputCls =
  'w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-primary/40 transition-colors bg-white';

export const productFormSelectCls =
  'w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-primary/40 transition-colors bg-white appearance-none';

export const productFormTextareaCls =
  'w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-primary/40 transition-colors resize-none bg-white';
