'use client';

import { TeamPanel } from '@/components/features/team/TeamPanel';

export function VendorTeamPanel({ embedded = false }: { embedded?: boolean }) {
  return <TeamPanel scope="vendor" embedded={embedded} />;
}
