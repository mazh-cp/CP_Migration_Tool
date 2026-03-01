'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<'asa' | 'ftd' | 'both'>('asa');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sourceType }),
      });
      const project = await res.json();
      if (project.id) router.push(`/projects/${project.id}/import`);
      else alert('Failed to create project');
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">New Project</h1>
      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500"
            required
            placeholder="e.g. DMZ Migration"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Source Type</label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as 'asa' | 'ftd' | 'both')}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500"
          >
            <option value="asa">Cisco ASA</option>
            <option value="ftd">Cisco FTD</option>
            <option value="both">Both (ASA + FTD)</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg font-medium"
        >
          {loading ? 'Creating...' : 'Create & Import'}
        </button>
      </form>
    </div>
  );
}
