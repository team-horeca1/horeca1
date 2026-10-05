import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { auth } from '@/auth';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { ScrollRestoration } from '@/components/layout/ScrollRestoration';
import { CallbackUrlRedirect } from '@/components/auth/CallbackUrlRedirect';
import { PostLoginAccountSelector } from '@/components/auth/PostLoginAccountSelector';

// Inter is a variable font — omitting weight downloads the single optimized variable file instead of 35 static slices.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const SITE_URL = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'https://horeca1.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Horeca1 - Bharat's Food & Grocery Distribution OS",
    template: '%s | Horeca1',
  },
  description: "Bharat's Food & Grocery Distribution OS. F&B Wholesale Made Easy.",
  applicationName: 'Horeca1',
  keywords: [
    'Horeca1',
    "Bharat's Food & Grocery Distribution OS",
    'F&B Wholesale Made Easy',
    'B2B Food Distribution',
    'HoReCa Wholesale Procurement',
    'Restaurant Grocery Supplier',
    'Commercial Kitchen Supplies',
    'Bulk Food Procurement India',
  ],
  authors: [{ name: 'Horeca1' }],
  creator: 'Horeca1',
  publisher: 'Horeca1',
  icons: {
    icon: '/horeca1_logo.jpg',
    shortcut: '/horeca1_logo.jpg',
    apple: '/horeca1_logo.jpg',
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: 'Horeca1',
    title: "Horeca1 - Bharat's Food & Grocery Distribution OS",
    description: "Bharat's Food & Grocery Distribution OS. F&B Wholesale Made Easy.",
    images: [
      {
        url: '/horeca1_logo.jpg',
        width: 800,
        height: 800,
        alt: "Horeca1 - Bharat's Food & Grocery Distribution OS",
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Horeca1 - Bharat's Food & Grocery Distribution OS",
    description: "Bharat's Food & Grocery Distribution OS. F&B Wholesale Made Easy.",
    images: ['/horeca1_logo.jpg'],
  },
};

import { GoogleMapsProvider } from '@/components/providers/GoogleMapsProvider';

/**
 * Root layout: auth + google maps + confirm + toaster.
 * GoogleMapsProvider is provided globally so address search and location
 * services work reliably across all pages, registration flows, and portals.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className="font-sans antialiased bg-background">
        <AuthProvider session={session}>
          <GoogleMapsProvider>
            <ConfirmProvider>
              <Suspense fallback={null}>
                <ScrollRestoration />
              </Suspense>
              <Suspense fallback={null}>
                <CallbackUrlRedirect />
              </Suspense>
              <Toaster position="top-center" richColors />
              {children}
              <PostLoginAccountSelector />
            </ConfirmProvider>
          </GoogleMapsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
