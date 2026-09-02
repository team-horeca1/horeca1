import dynamic from 'next/dynamic';
import { Hero } from '@/components/features/Hero';
import { QuickActions } from '@/components/features/homepage/QuickActions';
import { CompleteProfileBanner } from '@/components/features/homepage/CompleteProfileBanner';

const ContinueOrdering = dynamic(
  () => import('@/components/features/homepage/ContinueOrdering').then((m) => m.ContinueOrdering),
);
const TopRatedVendors = dynamic(() =>
  import('@/components/features/homepage/VendorRollups').then((m) => m.TopRatedVendors),
);
const NearbyVendors = dynamic(
  () => import('@/components/features/homepage/NearbyVendors').then((m) => m.NearbyVendors),
);
const FrequentlyOrderedVendors = dynamic(() =>
  import('@/components/features/homepage/VendorRollups').then((m) => m.FrequentlyOrderedVendors),
);
const FeaturedDeals = dynamic(
  () => import('@/components/features/homepage/FeaturedDeals').then((m) => m.FeaturedDeals),
);
const CategoryShowcase = dynamic(
  () => import('@/components/features/CategoryShowcase').then((m) => m.CategoryShowcase),
);
const ShopByStorePromo = dynamic(
  () => import('@/components/features/ShopByStorePromo').then((m) => m.ShopByStorePromo),
);
const Collections = dynamic(
  () => import('@/components/features/homepage/Collections').then((m) => m.Collections),
);
const FeatureBar = dynamic(
  () => import('@/components/features/FeatureBar').then((m) => m.FeatureBar),
);
const HomeTicker = dynamic(
  () => import('@/components/features/homepage/HomeTicker').then((m) => m.HomeTicker),
);
const VoicesSection = dynamic(
  () => import('@/components/features/homepage/VoicesSection').then((m) => m.VoicesSection),
);
const NewsletterBanner = dynamic(
  () => import('@/components/features/NewsletterBanner').then((m) => m.NewsletterBanner),
);

export default function Home() {
  return (
    <div className="flex flex-col w-full min-w-0 overflow-x-hidden">
      <Hero />
      <CompleteProfileBanner />
      <HomeTicker />
      <ContinueOrdering />
      <QuickActions />
      <CategoryShowcase />
      <TopRatedVendors />
      <NearbyVendors />
      <FrequentlyOrderedVendors />
      <ShopByStorePromo />
      <FeaturedDeals />
      <Collections />
      <VoicesSection />
      <FeatureBar />
      <NewsletterBanner />
    </div>
  );
}
