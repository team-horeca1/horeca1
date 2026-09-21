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
import { DemoEnvBanner } from '@/components/layout/DemoEnvBanner';

// Only weights used by UI tokens — fewer font files on cold start.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'horeca1 - B2B E-commerce for Restaurant Products',
  description: 'High speed, optimized B2B platform for restaurant and eating products.',
  icons: {
    icon: '/horeca1_logo.jpg',
    shortcut: '/horeca1_logo.jpg',
    apple: '/horeca1_logo.jpg',
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
  // Runtime env (not build-time) so the same GHCR image can serve prod + demo.
  const isDemo = process.env.APP_ENV === 'demo';
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
              <DemoEnvBanner enabled={isDemo} />
              {children}
              <PostLoginAccountSelector />
            </ConfirmProvider>
          </GoogleMapsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
