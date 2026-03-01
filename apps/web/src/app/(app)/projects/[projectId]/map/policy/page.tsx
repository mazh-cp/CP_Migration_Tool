'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface MappingDecision {
  entityType: string;
  sourceId: string;
  proposedTarget: { name: string; action: string; source?: string[]; destination?: string[] };
  confidenceScore: number;
  warnings: string[];
}

export default function MapPolicyPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [rules, setRules] = useState<Array<{ id: string; name?: string }>>([]);
  const [mappings, setMappings] = useState<MappingDecision[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/normalized`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/mapping`).then((r) => r.json()),
    ]).then(([norm, map]) => {
      setRules(norm.rules || []);
      setMappings(map.filter((m: MappingDecision) => m.entityType === 'rule'));
    });
  }, [projectId]);

  return (
    <div>
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/projects" className="hover:text-cyan-400">Projects</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Map Policy</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Map Policy Rules</h2>
      <p className="text-slate-400 mb-6">
        Review access rules and NAT mappings. Click a row to see raw source and mapping rationale.
      </p>
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left p-4">Rule</th>
              <th className="text-left p-4">Action</th>
              <th className="text-left p-4">Source → Dest</th>
              <th className="text-left p-4">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.sourceId} className="border-t border-slate-700 hover:bg-slate-800/50">
                <td className="p-4 font-mono">{m.proposedTarget.name}</td>
                <td className="p-4">{m.proposedTarget.action}</td>
                <td className="p-4 text-slate-400">
                  {(m.proposedTarget.source || []).slice(0, 2).join(', ')} →{' '}
                  {(m.proposedTarget.destination || []).slice(0, 2).join(', ')}
                </td>
                <td className="p-4">
                  <span
                    className={
                      m.confidenceScore >= 0.9 ? 'text-green-400' : m.confidenceScore >= 0.7 ? 'text-amber-400' : 'text-red-400'
                    }
                  >
                    {(m.confidenceScore * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex gap-4">
        <Link
          href={`/projects/${projectId}/validate`}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg"
        >
          Next: Validate & Fix
        </Link>
        <Link href={`/projects/${projectId}/map/objects`} className="px-4 py-2 bg-slate-700 rounded-lg">
          Back
        </Link>
      </div>
    </div>
  );
}
