'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const variantStyles = {
  primary:
    'bg-primary text-white hover:bg-primary-dark active:bg-primary-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  secondary:
    'bg-primary-light text-primary hover:bg-[#F0D4DC] active:bg-[#E8C4CE]',
  outline:
    'bg-transparent border border-primary text-primary hover:bg-primary-light/50',
  ghost: 'bg-transparent text-primary hover:bg-primary-light/40',
  danger:
    'bg-error text-white hover:bg-error/90 active:bg-error',
  success:
    'bg-success text-white hover:bg-success/90 active:bg-success',
} as const;

const sizeStyles = {
  sm: 'h-8 px-4 text-[13px] font-medium rounded-lg',
  md: 'h-10 px-5 text-[14px] font-semibold rounded-xl',
  lg: 'h-12 px-6 text-[15px] font-semibold rounded-xl min-h-[48px]',
} as const;

export type ButtonVariant = keyof typeof variantStyles;
export type ButtonSize = keyof typeof sizeStyles;

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = BaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & {
    href?: undefined;
  };

type ButtonAsLink = BaseProps &
  Omit<React.ComponentProps<typeof Link>, keyof BaseProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

function sharedClass(variant: ButtonVariant, size: ButtonSize, fullWidth: boolean, className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-2 transition-transform duration-150 ease-out',
    'active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none',
    variantStyles[variant],
    sizeStyles[size],
    fullWidth && 'w-full',
    className,
  );
}

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    size = 'lg',
    fullWidth = false,
    className,
    children,
    ...rest
  } = props;

  const cls = sharedClass(variant, size, fullWidth, className);

  if ('href' in props && props.href) {
    const { href, ...linkRest } = rest as ButtonAsLink;
    return (
      <Link href={href} className={cls} {...linkRest}>
        {children}
      </Link>
    );
  }

  const buttonRest = rest as ButtonAsButton;
  return (
    <button type="button" className={cls} {...buttonRest}>
      {children}
    </button>
  );
}
