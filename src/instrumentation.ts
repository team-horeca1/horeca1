import * as Sentry from "@sentry/nextjs";

/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * This file is automatically loaded by Next.js on server startup.
 * The `register` function runs once when a new Next.js server instance is created.
 */
export async function register() {
  const hasSentryDsn = Boolean(process.env.SENTRY_DSN);

  // Initialize Sentry for the appropriate runtime (skip when DSN unset in dev)
  if (hasSentryDsn && process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (hasSentryDsn && process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  // Validate environment variables on startup
  await import("@/lib/env");

  // Only register event listeners on the Node.js server runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const shouldRegisterListeners =
      process.env.NODE_ENV === "production" ||
      process.env.REGISTER_EVENT_LISTENERS === "true";

    if (shouldRegisterListeners) {
      const { registerEventListeners } = await import("@/events/listeners");
      registerEventListeners();
    }

    // Catch unhandled promise rejections to prevent silent crashes
    process.on("unhandledRejection", (reason) => {
      console.error("[CRITICAL] Unhandled Promise Rejection:", reason);
    });
  }
}

// Automatically captures all unhandled server-side request errors
export const onRequestError = Sentry.captureRequestError;
