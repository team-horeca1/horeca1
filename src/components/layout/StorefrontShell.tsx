'use client';

import dynamic from 'next/dynamic';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CartProvider } from '@/context/CartContext';
import { AddressProvider } from '@/context/AddressContext';
import { GoogleMapsProvider } from '@/components/providers/GoogleMapsProvider';
import { VendorApplicationBanner } from '@/components/features/homepage/VendorApplicationBanner';
import { AdminCustomerImpersonationBanner } from '@/components/features/admin/AdminCustomerImpersonationBanner';

const MandatoryAddressGate = dynamic(
  () => import('@/components/auth/MandatoryAddressGate').then((m) => m.MandatoryAddressGate),
  { ssr: false },
);
const OutletCompletionBanner = dynamic(
  () => import('@/components/auth/OutletCompletionBanner').then((m) => m.OutletCompletionBanner),
  { ssr: false },
);

/**
 * Marketplace chrome + cart/address/maps. Mounted only under `(storefront)`
 * so admin/vendor/brand portals do not pay this client graph.
 */
export function StorefrontShell({ children }: { children: React.ReactNode }) {
  return (
    <GoogleMapsProvider>
      <AddressProvider>
        <CartProvider>
          <Navbar />
          <div className="px-[clamp(1rem,3vw,2rem)] pt-2">
            <AdminCustomerImpersonationBanner />
          </div>
          <OutletCompletionBanner />
          <VendorApplicationBanner />
          <main className="w-full min-h-screen pb-20 lg:pb-0">{children}</main>
          <Footer />
          <MandatoryAddressGate />
        </CartProvider>
      </AddressProvider>
    </GoogleMapsProvider>
  );
}
