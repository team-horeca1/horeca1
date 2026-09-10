import dynamic from 'next/dynamic';
import { Hero } from '@/components/features/Hero';
import { QuickActions } from '@/components/features/homepage/QuickActions';
import { CompleteProfileBanner } from '@/components/features/homepage/CompleteProfileBanner';
import { listHomepageVoiceStories } from '@/modules/voices/voice.service';

const HomeTicker = dynamic(
  () => import('@/components/features/homepage/HomeTicker').then((m) => m.HomeTicker),
);
const ContinueOrdering = dynamic(
  () => import('@/components/features/homepage/ContinueOrdering').then((m) => m.ContinueOrdering),
);
const CreditStatusStrip = dynamic(
  () => import('@/components/features/homepage/CreditStatusStrip').then((m) => m.CreditStatusStrip),
);
const FrequentlyOrderedVendors = dynamic(() =>
  import('@/components/features/homepage/VendorRollups').then((m) => m.FrequentlyOrderedVendors),
);
const NearbyVendors = dynamic(
  () => import('@/components/features/homepage/NearbyVendors').then((m) => m.NearbyVendors),
);
const ShopByStorePromo = dynamic(
  () => import('@/components/features/ShopByStorePromo').then((m) => m.ShopByStorePromo),
);
const FeaturedDeals = dynamic(
  () => import('@/components/features/homepage/FeaturedDeals').then((m) => m.FeaturedDeals),
);
const Collections = dynamic(
  () => import('@/components/features/homepage/Collections').then((m) => m.Collections),
);
const VoicesSection = dynamic(
  () => import('@/components/features/homepage/VoicesSection').then((m) => m.VoicesSection),
);
const CategoryShowcase = dynamic(
  () => import('@/components/features/CategoryShowcase').then((m) => m.CategoryShowcase),
);
const CategoryProductRails = dynamic(() =>
  import('@/components/features/homepage/CategoryProductRails').then(
    (m) => m.CategoryProductRails,
  ),
);
const FeatureBar = dynamic(
  () => import('@/components/features/FeatureBar').then((m) => m.FeatureBar),
);
const DistributorCTA = dynamic(
  () => import('@/components/features/homepage/DistributorCTA').then((m) => m.DistributorCTA),
);

export default async function Home() {
  const voiceStories = (await listHomepageVoiceStories()).map((s) => ({
    id: s.id,
    slug: s.slug,
    badge: s.badge,
    name: s.name,
    role: s.role,
    venue: s.venue,
    quote: s.quote,
    photoUrl: s.photoUrl,
    storySquareUrl: s.storySquareUrl,
    storyPortraitUrl: s.storyPortraitUrl,
  }));

  return (
    <div className="flex flex-col w-full min-w-0 overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <Hero />
      <CompleteProfileBanner />
      <ContinueOrdering />
      <CreditStatusStrip />
      <HomeTicker />
      <QuickActions />
      <CategoryShowcase />
      <FrequentlyOrderedVendors />
      <NearbyVendors />
      <ShopByStorePromo />
      <FeatureBar />
      <Collections />
      <VoicesSection stories={voiceStories} />
      <CategoryProductRails />
      <FeaturedDeals />
      <DistributorCTA />
    </div>
  );
}
