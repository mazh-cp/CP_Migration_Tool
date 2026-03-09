'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export type ExportTarget = 'sms' | 'gateway' | 'both';
export type SmsFormat = 'mgmt-api' | 'smartconsole' | 'both';

export default function ExportPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [target, setTarget] = useState<ExportTarget>('both');
  const [smsFormat, setSmsFormat] = useState<SmsFormat>('both');
  const [loading, setLoading] = useState(false);

  const includeSms = target === 'sms' || target === 'both';
  const includeGateway = target === 'gateway' || target === 'both';

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, smsFormat }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="?([^";\n]+)"?/);
      const ext = blob.type === 'application/json' ? '.json' : blob.type === 'text/plain' ? '.cli' : '.zip';
      const filename = match?.[1] ?? `checkpoint-${projectId}${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
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
        Choose export target and format. SMS = policy objects and rules for Check Point Management. Gateway = Gaia interface/route commands.
      </p>

      <div className="space-y-6 mb-6 max-w-md">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Target</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="target"
                checked={target === 'sms'}
                onChange={() => setTarget('sms')}
                className="text-cyan-600"
              />
              SMS only (policy, objects, rules, NAT)
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="target"
                checked={target === 'gateway'}
                onChange={() => setTarget('gateway')}
                className="text-cyan-600"
              />
              Gateway only (Gaia clish: interfaces, routes)
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="target"
                checked={target === 'both'}
                onChange={() => setTarget('both')}
                className="text-cyan-600"
              />
              Both (SMS + Gateway)
            </label>
          </div>
        </div>

        {includeSms && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">SMS format</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="smsFormat"
                  checked={smsFormat === 'mgmt-api'}
                  onChange={() => setSmsFormat('mgmt-api')}
                  className="text-cyan-600"
                />
                Mgmt API ops (JSON, automation-friendly)
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="smsFormat"
                  checked={smsFormat === 'smartconsole'}
                  onChange={() => setSmsFormat('smartconsole')}
                  className="text-cyan-600"
                />
                SmartConsole import (CSV, GUI-friendly)
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="smsFormat"
                  checked={smsFormat === 'both'}
                  onChange={() => setSmsFormat('both')}
                  className="text-cyan-600"
                />
                Both formats
              </label>
            </div>
          </div>
        )}

        <p className="text-slate-500 text-sm">
          Selected: {includeSms && (smsFormat === 'both' ? 'mgmt_api + smartconsole' : smsFormat)} {includeSms && includeGateway && '+ '} {includeGateway && 'gateway'}
        </p>
      </div>

      <div className="flex gap-4">
        <button
          onClick={handleExport}
          disabled={loading}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg"
        >
          {loading ? 'Preparing…' : 'Download'}
        </button>
        <Link href={`/projects/${projectId}/validate`} className="px-4 py-2 bg-slate-700 rounded-lg">
          Back
        </Link>
      </div>
    </div>
  );
}
