import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: 'standalone',

  reactCompiler: true,
  reactStrictMode: true,

  // pdfkit ships .afm font metric files alongside its JS that webpack cannot bundle.
  // Marking it external means Next loads it from node_modules at runtime, so
  // PDFDocument can resolve `js/data/Helvetica.afm` and friends.
  serverExternalPackages: ['pdfkit', 'bullmq', 'ioredis'],

  // Dev-only: evict idle route modules sooner to stay under Next 16 memory auto-restart.
  ...(isDev
    ? {
        onDemandEntries: {
          maxInactiveAge: 60_000,
          pagesBufferLength: 2,
        },
      }
    : {}),

  // The .afm files are not detected by Next's static analysis (they're loaded via
  // fs.readFileSync at runtime). Force-include them so the standalone build copies
  // them into the production output bundle.
  outputFileTracingIncludes: {
    '/api/v1/orders/*/invoice': ['./node_modules/pdfkit/js/data/**/*'],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'ik.imagekit.io' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },

  compress: true,
  generateEtags: true,
  poweredByHeader: false,

  // Next runs an out-of-process `tsc` pass at the END of `next build` to
  // surface type errors. On the production droplet (3.8G RAM) that pass
  // gets SIGKILL'd by the OOM killer after webpack itself already
  // consumed most of the heap. We type-check locally via `npx tsc
  // --noEmit` on every commit (and in the lint step), so skipping the
  // build-time TS pass doesn't lose safety — it just shifts the check
  // from "twice" to "once, at commit time".
  typescript: { ignoreBuildErrors: true },

  // Same reasoning for lint — we run `npm run lint` locally before
  // every commit; the build doesn't need to repeat it.
  // @ts-expect-error — `eslint` is a valid Next build key but absent from the NextConfig type.
  eslint: { ignoreDuringBuilds: true },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },

  experimental: {
    optimizePackageImports: ['lucide-react', 'react-icons'],
    // Note: we don't enable Next.js's experimental scrollRestoration — it fires
    // BEFORE async-loaded sections (Top Rated, Vendors, etc.) populate, so the
    // saved scrollY ends up clamped to a shorter document height and lands at
    // the footer. Custom restoration in src/components/layout/ScrollRestoration.tsx
    // uses sessionStorage + requestAnimationFrame retry once content settles.
  },
};

export default withSentryConfig(nextConfig, {
  org: "horeca1",
  project: "javascript-nextjs",

  // Source map upload auth token
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload wider set of client source files for better stack traces
  widenClientFileUpload: true,

  // Proxy route to bypass ad-blockers (prod only — in local dev the tunnel
  // repeatedly ECONNRESET's when Sentry ingest is unreachable and adds noise
  // while the event loop is already under compile pressure).
  ...(isDev ? {} : { tunnelRoute: "/monitoring" }),

  // Suppress non-CI output
  silent: !process.env.CI,
});
