'use client';

import { HeroSlideManager } from '@/components/features/homepage/HeroSlideManager';
import { usePermissions } from '@/hooks/usePermissions';

export default function AdminHomepageHeroPage() {
  const { can } = usePermissions();

  return (
    <HeroSlideManager
      apiBase="/api/v1/admin/homepage/hero"
      title="Homepage Hero"
      description="Add as many banners as you need. The homepage slides through active ones with arrows and dots. Text and button are optional — turn them off for image-only banners."
      canEdit={can('settings.edit')}
    />
  );
}
