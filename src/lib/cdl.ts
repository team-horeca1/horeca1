/**
 * Horeca1 CDL color tokens for inline styles / JS (maps, charts, email HTML).
 * Prefer Tailwind utilities (`bg-primary`, `text-success`) in classNames.
 * Keep in sync with `src/app/globals.css` `@theme`.
 */
export const CDL = {
  primary: '#6B1D2E',
  primaryDark: '#5A1926',
  primaryPressed: '#4A141F',
  primaryLight: '#F8E8EC',

  background: '#FAF7F2',
  ivory: '#FFF7F0',
  cream: '#FAF5EC',
  surface: '#FFFFFF',
  divider: '#E9E3DD',

  text: '#1C1C1C',
  textSecondary: '#667085',
  textMuted: '#6B7280',

  success: '#16A34A',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  error: '#DC2626',
  errorLight: '#FEF2F2',
  info: '#2563EB',
  infoLight: '#EFF6FF',
} as const;

export type CdlColor = (typeof CDL)[keyof typeof CDL];
