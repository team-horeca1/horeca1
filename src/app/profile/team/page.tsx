'use client';

import { TeamPanel } from '@/components/features/team/TeamPanel';

export default function AccountTeamPage() {
  return <TeamPanel scope="account" pageShell blockWhenNoAccess />;
}
