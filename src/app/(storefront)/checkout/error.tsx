'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Checkout Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-3">
          Checkout error
        </h2>
        <p className="text-gray-600 mb-4">
          Something went wrong during checkout. Your cart items are safe.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="rounded-lg bg-orange-500 px-6 py-3 text-white font-medium hover:bg-orange-600 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/cart"
            className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Back to Cart
          </Link>
        </div>
      </div>
    </div>
  );
}
