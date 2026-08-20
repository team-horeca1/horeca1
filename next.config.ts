import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";
/** Docker bind-mounts need polling; host `dev:turbo` uses native FS events. */
const useFsPolling =
  isDev &&
  (process.env.WATCHPACK_POLLING === "true" ||
    process.env.CHOKIDAR_USEPOLLING === "true" ||
    process.env.HORECA_DOCKER_DEV === "1");

const nextConfig: NextConfig = {
  output: process.env.HORECA_SKIP_STANDALONE === '1' ? undefined : 'standalone',

  // Dev: React Compiler adds compile work; keep it for production builds only.
  // Toggle HORECA_REACT_COMPILER=1 to force-on in development for A/B.
  reactCompiler:
    process.env.NODE_ENV === 'production' || process.env.HORECA_REACT_COMPILER === '1',
  reactStrictMode: true,

  // Only poll when explicitly opted-in (Docker compose sets WATCHPACK_POLLING).
  ...(useFsPolling ? { watchOptions: { pollIntervalMs: 1000 } } : {}),

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

  // Lint runs via `npm run lint` / CI — Next 16 no longer accepts `eslint`
  // in next.config (was warning as unrecognized).

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
    // react-icons is not a dependency — only lucide-react is used.
    // recharts is barrel-heavy on admin/vendor dashboards.
    optimizePackageImports: ['lucide-react', 'recharts'],
    // Note: we don't enable Next.js's experimental scrollRestoration — it fires
    // BEFORE async-loaded sections (Top Rated, Vendors, etc.) populate, so the
    // saved scrollY ends up clamped to a shorter document height and lands at
    // the footer. Custom restoration in src/components/layout/ScrollRestoration.tsx
    // uses sessionStorage + requestAnimationFrame retry once content settles.
  },
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(nextConfig, {
  org: "horeca1",
  project: "javascript-nextjs",

  // Source map upload auth token
  authToken: sentryAuthToken,

  // Wider client upload + sourcemap upload are CI-only (local builds were
  // spending 15–30s in runAfterProductionCompile).
  widenClientFileUpload: Boolean(process.env.CI),
  sourcemaps: {
    disable: !process.env.CI,
  },

  // Proxy route to bypass ad-blockers (prod only — in local dev the tunnel
  // repeatedly ECONNRESET's when Sentry ingest is unreachable and adds noise
  // while the event loop is already under compile pressure).
  ...(isDev ? {} : { tunnelRoute: "/monitoring" }),

  // Suppress non-CI output
  silent: !process.env.CI,
});
