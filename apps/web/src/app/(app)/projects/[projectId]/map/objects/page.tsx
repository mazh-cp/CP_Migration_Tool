'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface MappingDecision {
  id: string;
  entityType: string;
  sourceId: string;
  proposedTarget: { type: string; name: string; [k: string]: unknown };
  confidenceScore: number;
  reasons: string[];
  warnings: string[];
}

export default function MapObjectsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [normalized, setNormalized] = useState<{ objects: Array<{ id: string; name: string; type: string }> } | null>(null);
  const [mappings, setMappings] = useState<MappingDecision[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/normalized`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/mapping`).then((r) => r.json()),
    ]).then(([norm, map]) => {
      setNormalized(norm);
      setMappings(map.filter((m: MappingDecision) => m.entityType === 'object' || m.entityType === 'service'));
    });
  }, [projectId]);

  const objMap = new Map(normalized?.objects?.map((o) => [o.id, o]) || []);

  return (
    <div>
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/projects" className="hover:text-cyan-400">Projects</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Map Objects</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Map Objects</h2>
      <p className="text-slate-400 mb-6">
        Review and edit the proposed Check Point mappings for network objects and services.
      </p>
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left p-4">Source</th>
              <th className="text-left p-4">Mapped To</th>
              <th className="text-left p-4">Confidence</th>
              <th className="text-left p-4">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => {
              const src = objMap.get(m.sourceId);
              return (
                <tr key={m.id} className="border-t border-slate-700 hover:bg-slate-800/50">
                  <td className="p-4">
                    <span className="font-mono">{src?.name || m.sourceId}</span>
                    <span className="text-slate-500 ml-2">({src?.type || m.entityType})</span>
                  </td>
                  <td className="p-4">
                    <span className="font-mono">{m.proposedTarget.name}</span>
                    <span className="text-slate-500 ml-2">({m.proposedTarget.type})</span>
                  </td>
                  <td className="p-4">
                    <span
                      className={
                        m.confidenceScore >= 0.9
                          ? 'text-green-400'
                          : m.confidenceScore >= 0.7
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }
                    >
                      {(m.confidenceScore * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="p-4 text-amber-400">
                    {m.warnings?.length ? m.warnings.join('; ') : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex gap-4">
        <Link
          href={`/projects/${projectId}/map/policy`}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg"
        >
          Next: Map Policy
        </Link>
        <Link href={`/projects/${projectId}/map/interfaces`} className="px-4 py-2 bg-slate-700 rounded-lg">
          Back
        </Link>
      </div>
    </div>
  );
}
