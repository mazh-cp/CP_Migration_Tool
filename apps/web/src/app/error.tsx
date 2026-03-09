'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-xl p-8 text-center">
        <h2 className="text-xl font-semibold text-red-400 mb-2">Something went wrong</h2>
        <p className="text-slate-400 mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
