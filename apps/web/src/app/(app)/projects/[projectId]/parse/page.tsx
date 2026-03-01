'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ParsePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const [counts, setCounts] = useState<{ objects?: number; rules?: number; nat?: number; warnings?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/normalized`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setParsed(true);
          setCounts({
            objects: data.objects?.length || 0,
            rules: data.rules?.length || 0,
            nat: data.nat?.length || 0,
            warnings: data.warnings?.length || 0,
          });
        }
      })
      .catch(() => {});
  }, [projectId]);

  async function runParse() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/parse`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setParsed(true);
        setCounts(data);
        router.refresh();
      } else alert(data.error || 'Parse failed');
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    } finally {
      setLoading(false);
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
          <button
            onClick={runParse}
            disabled={loading}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg"
          >
            {loading ? 'Parsing...' : 'Run Parse'}
          </button>
        </>
      )}
      {parsed && counts && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <div className="text-2xl font-bold text-amber-400">{counts.warnings ?? 0}</div>
              <div className="text-sm text-slate-400">Warnings</div>
            </div>
          </div>
          <div className="flex gap-4">
            <Link
              href={`/projects/${projectId}/map/objects`}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg"
            >
              Proceed to Map Objects
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
