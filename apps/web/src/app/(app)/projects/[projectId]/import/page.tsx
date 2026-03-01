'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

export default function ImportPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [content, setContent] = useState('');
  const [sourceType, setSourceType] = useState<'asa' | 'ftd'>('asa');
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handlePaste(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          content: content.trim(),
          filename: `config.${sourceType === 'asa' ? 'txt' : 'json'}`,
        }),
      });
      if (res.ok) router.push(`/projects/${projectId}/parse`);
      else alert('Import failed');
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setLoading(true);
    try {
      const text = await file.text();
      const res = await fetch(`/api/projects/${projectId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          content: text,
          filename: file.name,
        }),
      });
      if (res.ok) router.push(`/projects/${projectId}/parse`);
      else alert('Import failed');
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
        <span className="text-slate-300">Import</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Import Configuration</h2>
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setMode('paste')}
          className={`px-4 py-2 rounded-lg ${mode === 'paste' ? 'bg-cyan-600' : 'bg-slate-700'}`}
        >
          Paste
        </button>
        <button
          onClick={() => setMode('upload')}
          className={`px-4 py-2 rounded-lg ${mode === 'upload' ? 'bg-cyan-600' : 'bg-slate-700'}`}
        >
          Upload File
        </button>
      </div>
      <div className="mb-4">
        <label className="block text-sm text-slate-400 mb-2">Source Type</label>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as 'asa' | 'ftd')}
          className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg"
        >
          <option value="asa">Cisco ASA</option>
          <option value="ftd">Cisco FTD</option>
        </select>
      </div>
      {mode === 'paste' && (
        <form onSubmit={handlePaste}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your ASA or FTD configuration here..."
            className="w-full h-64 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg font-mono text-sm"
            required
          />
          <div className="mt-4 flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg"
            >
              {loading ? 'Importing...' : 'Import & Continue'}
            </button>
            <Link href="/projects" className="px-4 py-2 bg-slate-700 rounded-lg">
              Cancel
            </Link>
          </div>
        </form>
      )}
      {mode === 'upload' && (
        <div>
          <input
            type="file"
            accept=".txt,.cfg,.json"
            onChange={handleFile}
            className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-cyan-600 file:text-white"
          />
          {loading && <p className="mt-2 text-amber-400">Uploading...</p>}
        </div>
      )}
    </div>
  );
}
