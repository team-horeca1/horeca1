'use client';

import { TeamPanel } from '@/components/features/team/TeamPanel';

export default function AdminTeamPage() {
  return <TeamPanel scope="admin" blockWhenNoAccess />;
}
