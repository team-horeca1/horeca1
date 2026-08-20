"use client";

import * as Sentry from "@sentry/nextjs";
import { useState } from "react";

export default function SentryExamplePage() {
  const [sent, setSent] = useState(false);

  const triggerError = () => {
    const error = new Error("Sentry test error — HoReCa Hub verification");
    Sentry.captureException(error);
    setSent(true);
  };

  const triggerUnhandled = () => {
    throw new Error("Unhandled Sentry test error — HoReCa Hub");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full space-y-6 text-center">
        <h1 className="text-2xl font-bold text-[#181725]">Sentry Test Page</h1>
        <p className="text-sm text-gray-500">
          Click a button to send a test error to Sentry. Check your{" "}
          <a href="https://horeca1.sentry.io/issues/" target="_blank" rel="noopener noreferrer" className="text-[#299E60] underline">
            Sentry dashboard
          </a>{" "}
          to verify it appears.
        </p>

        <div className="space-y-3">
          <button
            onClick={triggerError}
            className="w-full h-12 bg-[#299E60] text-white rounded-xl font-bold hover:bg-[#238a54] transition-colors"
          >
            Send Captured Error
          </button>

          <button
            onClick={triggerUnhandled}
            className="w-full h-12 bg-[#E74C3C] text-white rounded-xl font-bold hover:bg-[#c0392b] transition-colors"
          >
            Throw Unhandled Error
          </button>
        </div>

        {sent && (
          <p className="text-sm font-bold text-[#299E60] animate-pulse">
            Error sent! Check Sentry dashboard in ~30 seconds.
          </p>
        )}

        <p className="text-xs text-gray-400">Delete this page after verification.</p>
      </div>
    </div>
  );
}
