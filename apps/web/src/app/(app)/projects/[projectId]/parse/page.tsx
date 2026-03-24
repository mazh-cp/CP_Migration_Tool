'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatApiFailureMessage, readApiJson } from '@/lib/read-api-json';

export default function ParsePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const [counts, setCounts] = useState<{
    objects?: number;
    rules?: number;
    nat?: number;
    warnings?: number;
    interfaces?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState('');
  const [parsed, setParsed] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/normalized-summary`)
      .then(async (r) => {
        const parsed = await readApiJson<{
          objects?: number;
          rules?: number;
          nat?: number;
          interfaces?: number;
          warnings?: number;
        }>(r);
        if (!r.ok || parsed.isHtml || !parsed.data) return null;
        return parsed.data;
      })
      .then((data) => {
        if (data && typeof data.objects === 'number') {
          setParsed(true);
          setCounts({
            objects: data.objects,
            rules: data.rules ?? 0,
            nat: data.nat ?? 0,
            interfaces: data.interfaces ?? 0,
            warnings: data.warnings ?? 0,
          });
        }
      })
      .catch(() => {});
  }, [projectId]);

  async function waitForParseJob(
    jobId: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const maxAttempts = 450;
    const intervalMs = 2000;
    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, intervalMs));
      setLoadingHint(
        `Parsing… (${Math.round((i * intervalMs) / 1000)}s elapsed — large configs can take several minutes)`
      );
      const r = await fetch(`/api/projects/${projectId}/status?jobId=${encodeURIComponent(jobId)}`);
      const st = await readApiJson<{ job?: { status: string; errorMessage?: string | null } }>(r);
      if (!r.ok || st.isHtml || !st.data?.job) continue;
      const status = st.data.job.status;
      if (status === 'completed') return { ok: true };
      if (status === 'failed') {
        return { ok: false, error: st.data.job.errorMessage || 'Parse failed' };
      }
    }
    return {
      ok: false,
      error:
        'Timed out waiting for parse (15 min). The job may still be running — check server logs (journalctl -u cp-migration-tool -f) or retry.',
    };
  }

  async function applyNormalizedCounts() {
    const normRes = await fetch(`/api/projects/${projectId}/normalized-summary`);
    const normParsed = await readApiJson<{
      objects?: number;
      rules?: number;
      nat?: number;
      interfaces?: number;
      warnings?: number;
    }>(normRes);
    if (!normRes.ok || normParsed.isHtml || !normParsed.data) {
      setParsed(true);
      setCounts({ objects: 0, rules: 0, nat: 0, interfaces: 0, warnings: 0 });
      return;
    }
    const data = normParsed.data;
    setParsed(true);
    setCounts({
      objects: data.objects ?? 0,
      rules: data.rules ?? 0,
      nat: data.nat ?? 0,
      interfaces: data.interfaces ?? 0,
      warnings: data.warnings ?? 0,
    });
    router.refresh();
  }

  async function runParse() {
    setLoading(true);
    setLoadingHint('Starting parse…');
    try {
      const res = await fetch(`/api/projects/${projectId}/parse`, { method: 'POST' });
      const body = await readApiJson<{
        jobId?: string;
        objects?: number;
        rules?: number;
        nat?: number;
        warnings?: number;
        interfaces?: number;
        findings?: number;
      }>(res);

      if (!res.ok || body.isHtml) {
        alert(
          formatApiFailureMessage(body.status, body.isHtml, body.data, body.rawPreview)
        );
        return;
      }

      if (res.status === 202 && body.data?.jobId) {
        const outcome = await waitForParseJob(body.data.jobId);
        if (!outcome.ok) {
          alert(outcome.error);
          return;
        }
        await applyNormalizedCounts();
        return;
      }

      if (res.ok && body.data && typeof body.data.objects === 'number') {
        setParsed(true);
        setCounts(body.data);
        router.refresh();
        return;
      }

      alert('Unexpected response from parse. Try again or check server logs.');
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    } finally {
      setLoading(false);
      setLoadingHint('');
    }
  }

  return (
    <div>
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/projects" className="hover:text-cyan-400">Projects</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Parse & Normalize</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Parse & Normalize</h2>
      {!parsed && (
        <>
          <p className="text-slate-400 mb-6">
            Run the parser to convert your imported configuration into normalized objects and rules.
          </p>
          <div className="flex flex-col gap-2 items-start">
            <button
              onClick={runParse}
              disabled={loading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg"
            >
              {loading ? 'Parsing…' : 'Run Parse'}
            </button>
            {loading && loadingHint && (
              <p className="text-sm text-slate-400 max-w-xl">{loadingHint}</p>
            )}
          </div>
        </>
      )}
      {parsed && counts && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-2xl font-bold text-cyan-400">{counts.objects ?? 0}</div>
              <div className="text-sm text-slate-400">Objects</div>
            </div>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-2xl font-bold text-cyan-400">{counts.rules ?? 0}</div>
              <div className="text-sm text-slate-400">Rules</div>
            </div>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-2xl font-bold text-cyan-400">{counts.nat ?? 0}</div>
              <div className="text-sm text-slate-400">NAT</div>
            </div>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-2xl font-bold text-cyan-400">{counts.interfaces ?? 0}</div>
              <div className="text-sm text-slate-400">Interfaces</div>
            </div>
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-2xl font-bold text-amber-400">{counts.warnings ?? 0}</div>
              <div className="text-sm text-slate-400">Warnings</div>
            </div>
          </div>
          <div className="flex gap-4">
            <Link
              href={`/projects/${projectId}/map/interfaces`}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg"
            >
              Proceed to Map Interfaces
            </Link>
            <button onClick={runParse} disabled={loading} className="px-4 py-2 bg-slate-700 rounded-lg">
              Re-run Parse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
