import dynamic from 'next/dynamic';
import { Hero } from '@/components/features/Hero';
import { QuickActions } from '@/components/features/homepage/QuickActions';
import { CompleteProfileBanner } from '@/components/features/homepage/CompleteProfileBanner';
import { listHomepageVoiceStories } from '@/modules/voices/voice.service';
import { getHomepageHeroSlides } from '@/modules/homepage/homepage-hero.service';
import { HERO_FALLBACK } from '@/modules/homepage/homepage-hero.constants';

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
  const [voiceStoriesRaw, heroSlides] = await Promise.all([
    listHomepageVoiceStories().catch(() => []),
    getHomepageHeroSlides().catch(() => []),
  ]);

  const voiceStories = voiceStoriesRaw.map((s) => ({
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

  const slides =
    heroSlides.length > 0
      ? heroSlides.map((s) => ({
          id: s.id,
          eyebrow: s.eyebrow,
          headline: s.headline,
          ctaLabel: s.ctaLabel,
          ctaHref: s.ctaHref,
          showText: s.showText,
          showCta: s.showCta,
          copyAlignX: s.copyAlignX,
          copyAlignY: s.copyAlignY,
          copyOffsetX: s.copyOffsetX,
          copyOffsetY: s.copyOffsetY,
          showTextMobile: s.showTextMobile,
          showCtaMobile: s.showCtaMobile,
          copyAlignXMobile: s.copyAlignXMobile,
          copyAlignYMobile: s.copyAlignYMobile,
          copyOffsetXMobile: s.copyOffsetXMobile,
          copyOffsetYMobile: s.copyOffsetYMobile,
          desktopImageUrl: s.resolvedDesktopImageUrl,
          mobileImageUrl: s.resolvedMobileImageUrl,
        }))
      : [
          {
            eyebrow: HERO_FALLBACK.eyebrow,
            headline: HERO_FALLBACK.headline,
            ctaLabel: HERO_FALLBACK.ctaLabel,
            ctaHref: HERO_FALLBACK.ctaHref,
            showText: HERO_FALLBACK.showText,
            showCta: HERO_FALLBACK.showCta,
            copyAlignX: HERO_FALLBACK.copyAlignX,
            copyAlignY: HERO_FALLBACK.copyAlignY,
            copyOffsetX: HERO_FALLBACK.copyOffsetX,
            copyOffsetY: HERO_FALLBACK.copyOffsetY,
            showTextMobile: HERO_FALLBACK.showTextMobile,
            showCtaMobile: HERO_FALLBACK.showCtaMobile,
            copyAlignXMobile: HERO_FALLBACK.copyAlignXMobile,
            copyAlignYMobile: HERO_FALLBACK.copyAlignYMobile,
            copyOffsetXMobile: HERO_FALLBACK.copyOffsetXMobile,
            copyOffsetYMobile: HERO_FALLBACK.copyOffsetYMobile,
            desktopImageUrl: HERO_FALLBACK.desktopImageUrl,
            mobileImageUrl: HERO_FALLBACK.mobileImageUrl,
          },
        ];

  return (
    <div className="flex flex-col w-full min-w-0 overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <Hero slides={slides} />
      <CompleteProfileBanner />
      <ContinueOrdering />
      <CreditStatusStrip />
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
