import { StorefrontShell } from '@/components/layout/StorefrontShell';
import { resolveInitialNav } from '@/lib/navBootstrap';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const initialNav = await resolveInitialNav();
  return <StorefrontShell initialNav={initialNav}>{children}</StorefrontShell>;
}
