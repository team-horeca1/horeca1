import React, { Suspense } from 'react';
import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Inter } from "next/font/google";
import { CartProvider } from "@/context/CartContext";
import { GoogleMapsProvider } from "@/components/providers/GoogleMapsProvider";
import { AddressProvider } from "@/context/AddressContext";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { VendorApplicationBanner } from '@/components/features/homepage/VendorApplicationBanner';
import { AdminCustomerImpersonationBanner } from '@/components/features/admin/AdminCustomerImpersonationBanner';
import { ScrollRestoration } from '@/components/layout/ScrollRestoration';
import { PostLoginAccountSelector } from '@/components/auth/PostLoginAccountSelector';
import { MandatoryAddressGate } from '@/components/auth/MandatoryAddressGate';
import { CallbackUrlRedirect } from '@/components/auth/CallbackUrlRedirect';
import { OutletCompletionBanner } from '@/components/auth/OutletCompletionBanner';

const inter = Inter({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "horeca1 - B2B E-commerce for Restaurant Products",
  description: "High speed, optimized B2B platform for restaurant and eating products.",
  icons: {
    icon: "/horeca1_logo.jpg",
    shortcut: "/horeca1_logo.jpg",
    apple: "/horeca1_logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className="font-sans antialiased bg-background">
        <AuthProvider>
          <GoogleMapsProvider>
            <AddressProvider>
              <CartProvider>
                <ConfirmProvider>
                  <Suspense fallback={null}><ScrollRestoration /></Suspense>
                  <Suspense fallback={null}><CallbackUrlRedirect /></Suspense>
                  <Toaster position="top-center" richColors />
                  <Navbar />
                  <div className="px-[clamp(1rem,3vw,2rem)] pt-2">
                    <AdminCustomerImpersonationBanner />
                  </div>
                  <OutletCompletionBanner />
                  <VendorApplicationBanner />
                  <main className="w-full min-h-screen pb-20 md:pb-0">
                    {children}
                  </main>
                  <Footer />
                  <PostLoginAccountSelector />
                  <MandatoryAddressGate />
                </ConfirmProvider>
              </CartProvider>
            </AddressProvider>
          </GoogleMapsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
