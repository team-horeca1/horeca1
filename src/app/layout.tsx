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

// Only weights used by UI tokens — fewer font files on cold start.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
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

/**
 * Minimal root: auth + confirm + toaster only.
 * Marketplace chrome lives in `(storefront)/layout` so portals skip Maps/Cart/Navbar.
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
          <ConfirmProvider>
            <Suspense fallback={null}>
              <ScrollRestoration />
            </Suspense>
            <Suspense fallback={null}>
              <CallbackUrlRedirect />
            </Suspense>
            <Toaster position="top-center" richColors />
            {children}
          </ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
