'use client';

/**
 * Subtle fixed pill so QA never confuses demo.horeca1.com with production.
 * Shown only when APP_ENV=demo (server passes via data attribute) or host matches.
 */
export function DemoEnvBanner({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return (
    <div
      role="status"
      aria-label="Demo environment"
      className="pointer-events-none fixed bottom-3 left-3 z-[9999] rounded-md border border-[#6B1D2E]/30 bg-[#6B1D2E] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white shadow-sm"
    >
      DEMO
    </div>
  );
}
