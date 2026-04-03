'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'cisco2cp_chunk_reload_once';

function isChunkFailureMessage(msg: string): boolean {
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/**
 * After redeploys or HMR, the browser can request stale chunk URLs. One reload
 * usually picks up the current manifest. Only attempts once per tab session.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const tryReload = (msg: string) => {
      if (!isChunkFailureMessage(msg)) return;
      if (sessionStorage.getItem(STORAGE_KEY)) return;
      sessionStorage.setItem(STORAGE_KEY, '1');
      window.location.reload();
    };

    const onWindowError = (e: ErrorEvent) => {
      tryReload(e.message || '');
    };

    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg =
        r instanceof Error
          ? `${r.name} ${r.message}`
          : typeof r === 'object' && r && 'message' in r
            ? String((r as { message?: string }).message)
            : String(r);
      tryReload(msg);
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
