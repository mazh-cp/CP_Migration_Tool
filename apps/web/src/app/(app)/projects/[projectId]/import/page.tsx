'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { formatApiFailureMessage, readApiJson } from '@/lib/read-api-json';

type SourceType = 'asa' | 'ftd' | 'fortinet' | 'fortimanager' | 'fortianalyzer';

function defaultFilename(st: SourceType): string {
  if (st === 'ftd' || st === 'fortimanager' || st === 'fortianalyzer') return 'config.json';
  if (st === 'fortinet') return 'config.conf';
  return 'config.txt';
}

export default function ImportPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [content, setContent] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('asa');
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [fmgBaseUrl, setFmgBaseUrl] = useState('https://fortimanager.example.com');
  const [fmgSession, setFmgSession] = useState('');
  const [fmgUser, setFmgUser] = useState('');
  const [fmgPass, setFmgPass] = useState('');
  const [fmgAdom, setFmgAdom] = useState('root');
  const [fmgPkg, setFmgPkg] = useState('default');
  const [fmgVdom, setFmgVdom] = useState('');
  const [fmgUseLogin, setFmgUseLogin] = useState(false);

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
          filename: defaultFilename(sourceType),
        }),
      });
      const parsed = await readApiJson(res);
      if (!res.ok || parsed.isHtml) {
        alert(
          formatApiFailureMessage(parsed.status, parsed.isHtml, parsed.data, parsed.rawPreview)
        );
        return;
      }
      if (res.ok) router.push(`/projects/${projectId}/parse`);
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
      const parsed = await readApiJson(res);
      if (!res.ok || parsed.isHtml) {
        alert(
          formatApiFailureMessage(parsed.status, parsed.isHtml, parsed.data, parsed.rawPreview)
        );
        return;
      }
      if (res.ok) router.push(`/projects/${projectId}/parse`);
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFmgLive(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !fmgBaseUrl.trim()) return;
    setLoading(true);
    try {
      const body: Record<string, string | undefined> = {
        baseUrl: fmgBaseUrl.trim(),
        adom: fmgAdom.trim(),
        packageName: fmgPkg.trim(),
      };
      if (fmgVdom.trim()) body.vdom = fmgVdom.trim();
      if (fmgUseLogin) {
        body.username = fmgUser.trim();
        body.password = fmgPass;
      } else {
        body.session = fmgSession.trim();
      }
      const res = await fetch(`/api/projects/${projectId}/import/fortimanager-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const parsed = await readApiJson(res);
      if (!res.ok || parsed.isHtml) {
        alert(
          formatApiFailureMessage(parsed.status, parsed.isHtml, parsed.data, parsed.rawPreview)
        );
        return;
      }
      router.push(`/projects/${projectId}/parse`);
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const placeholder =
    sourceType === 'fortimanager'
      ? 'Paste FortiManager bundle JSON (policy + address + service objects from API export or live pull).'
      : sourceType === 'fortianalyzer'
        ? 'Paste JSON: {"hits":[{"policyName":"allow-web","hits":1234},{"policyId":"1","hits":500}]} — import after firewall config; merge runs on Parse.'
        : 'Paste your ASA, FTD, or FortiGate configuration here...';

  return (
    <div>
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/projects" className="hover:text-cyan-400">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Import</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Import Configuration</h2>
      <div className="flex gap-4 mb-6">
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={`px-4 py-2 rounded-lg ${mode === 'paste' ? 'bg-cyan-600' : 'bg-slate-700'}`}
        >
          Paste
        </button>
        <button
          type="button"
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
          onChange={(e) => setSourceType(e.target.value as SourceType)}
          className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg w-full max-w-md"
        >
          <option value="asa">Cisco ASA</option>
          <option value="ftd">Cisco FTD</option>
          <option value="fortinet">Fortinet FortiGate (CLI backup)</option>
          <option value="fortimanager">FortiManager (JSON bundle)</option>
          <option value="fortianalyzer">FortiAnalyzer hits (JSON or CSV — after firewall import)</option>
        </select>
      </div>
      {mode === 'paste' && (
        <form onSubmit={handlePaste}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
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
            accept=".txt,.cfg,.json,.conf,.csv"
            onChange={handleFile}
            className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-cyan-600 file:text-white"
          />
          {loading && <p className="mt-2 text-amber-400">Uploading...</p>}
        </div>
      )}

      <div className="mt-12 pt-8 border-t border-slate-700">
        <h3 className="text-lg font-medium text-slate-200 mb-2">FortiManager — live API pull</h3>
        <p className="text-sm text-slate-500 mb-4 max-w-2xl">
          Server-side JSON-RPC to your FortiManager (same bundle as file import). Session key from
          FortiManager API user, or username/password for one-shot login. Credentials are not stored.
        </p>
        <form onSubmit={handleFmgLive} className="max-w-xl space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Base URL</label>
            <input
              type="url"
              value={fmgBaseUrl}
              onChange={(e) => setFmgBaseUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={fmgUseLogin}
              onChange={(e) => setFmgUseLogin(e.target.checked)}
            />
            Use username / password instead of session key
          </label>
          {!fmgUseLogin ? (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Session key</label>
              <input
                type="password"
                value={fmgSession}
                onChange={(e) => setFmgSession(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm font-mono"
                placeholder="From FortiManager API admin"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Username</label>
                <input
                  value={fmgUser}
                  onChange={(e) => setFmgUser(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Password</label>
                <input
                  type="password"
                  value={fmgPass}
                  onChange={(e) => setFmgPass(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">ADOM</label>
              <input
                value={fmgAdom}
                onChange={(e) => setFmgAdom(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Policy package</label>
              <input
                value={fmgPkg}
                onChange={(e) => setFmgPkg(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">VDOM (optional)</label>
            <input
              value={fmgVdom}
              onChange={(e) => setFmgVdom(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
              placeholder="Leave empty for non-VDOM package path"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-sm font-medium"
          >
            {loading ? 'Pulling…' : 'Pull from FortiManager & import'}
          </button>
        </form>
      </div>
    </div>
  );
}
