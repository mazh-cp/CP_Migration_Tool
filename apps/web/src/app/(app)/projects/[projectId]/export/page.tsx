'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function ExportPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [format, setFormat] = useState<'json' | 'cli'>('json');

  async function handleExport() {
    const res = await fetch(`/api/projects/${projectId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format }),
    });
    if (format === 'json') {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checkpoint-${projectId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checkpoint-${projectId}.cli`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div>
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/projects" className="hover:text-cyan-400">Projects</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Export</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Export</h2>
      <p className="text-slate-400 mb-6">
        Choose export format and download your Check Point R82.x–ready artifacts (JSON bundle or
        CLI template).
      </p>
      <div className="space-y-4 mb-6">
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="format"
            checked={format === 'json'}
            onChange={() => setFormat('json')}
            className="text-cyan-600"
          />
          JSON bundle (always available)
        </label>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="format"
            checked={format === 'cli'}
            onChange={() => setFormat('cli')}
            className="text-cyan-600"
          />
          CLI template (beta)
        </label>
      </div>
      <div className="flex gap-4">
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg"
        >
          Download {format === 'json' ? 'JSON' : 'CLI'}
        </button>
        <Link href={`/projects/${projectId}/validate`} className="px-4 py-2 bg-slate-700 rounded-lg">
          Back
        </Link>
      </div>
    </div>
  );
}
