import { Hero } from "@/components/features/Hero";
import { CategoryShowcase } from "@/components/features/CategoryShowcase";
import { FeatureBar } from "@/components/features/FeatureBar";
// import { ShopByStore } from "@/components/features/ShopByStore";
import { ShopByStorePromo } from "@/components/features/ShopByStorePromo";
import { ShopByStoreAlt } from "@/components/features/ShopByStoreAlt";
import { QuickActions } from "@/components/features/homepage/QuickActions";
import { ContinueOrdering } from "@/components/features/homepage/ContinueOrdering";
import { NearbyVendors } from "@/components/features/homepage/NearbyVendors";
import { Collections } from "@/components/features/homepage/Collections";
import { NewsletterBanner } from "@/components/features/NewsletterBanner";
import { CompleteProfileBanner } from "@/components/features/homepage/CompleteProfileBanner";
import { FeaturedDeals } from "@/components/features/homepage/FeaturedDeals";
import { FrequentlyOrderedVendors, TopRatedVendors } from "@/components/features/homepage/VendorRollups";

export default function Home() {
  return (
    <div className="flex flex-col w-full min-w-0 overflow-x-hidden">
      {/* Hero / Banner */}
      <Hero />

      {/* Profile completeness nudge — only shows for signed-in users whose profile is incomplete */}
      <CompleteProfileBanner />

      {/* Quick Actions: Reorder, Quick Order, My Vendors */}
      <QuickActions />

      {/* Continue Ordering: Recent vendors */}
      <ContinueOrdering />
      {/* Top Rated Vendors */}
      <TopRatedVendors />

      {/* Vendors Near You (Now Shop By Vendor) */}
      <NearbyVendors />

      {/* Frequently Ordered Vendors — shown for logged-in users */}
      <FrequentlyOrderedVendors />



      {/* Featured Deals: products with a real promo or MRP markdown */}
      <FeaturedDeals />

      {/* Shop By Store Promo (Design 1 - green promo banner with vendor logos) */}

      {/* Categories */}
      <CategoryShowcase />


      {/* Shop By Store Alt (Design 2 - Popular Chains white clean style) */}
      {/* <ShopByStoreAlt /> */}

      {/* Shop by Brand — grid of brand/category cards */}
      <ShopByStorePromo />

      {/* Collections: Italian Kitchen, Oriental, etc. */}
      <Collections />

      {/* Features Bar */}
      <FeatureBar />

      {/* Newsletter / Subscription */}
      <NewsletterBanner />
    </div>
  );
}
