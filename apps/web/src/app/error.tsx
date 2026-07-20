'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

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
      <div className="max-w-md w-full bg-slate-800/60 border border-slate-700 rounded-xl p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-danger/15 text-danger ring-1 ring-inset ring-danger/30">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Something went wrong</h2>
        <p className="text-sm text-slate-400 mb-6">
          The tool hit an unexpected error. Try again — if it keeps happening, contact your administrator.
        </p>
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-400"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
