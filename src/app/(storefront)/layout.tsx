import { StorefrontShell } from '@/components/layout/StorefrontShell';

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontShell>{children}</StorefrontShell>;
}
