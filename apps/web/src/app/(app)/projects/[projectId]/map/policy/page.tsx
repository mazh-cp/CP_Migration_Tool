'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { validateCheckPointExportName } from '@/lib/checkpoint-format';

interface MappingDecision {
  id: string;
  entityType: string;
  sourceId: string;
  proposedTarget: {
    name?: string;
    action?: string;
    source?: string[];
    destination?: string[];
    comments?: string;
    type?: string;
    [k: string]: unknown;
  };
  confidenceScore: number;
  warnings: string[];
}

const ANY_NET_ID = '__ANY_NETWORK__';
const ANY_SVC_ID = '__ANY_SERVICE__';

function buildNameById(
  objects: Array<{ id: string; name: string }>,
  objectMappings: Array<{ sourceId: string; proposedTarget: { name?: string } }>
): Map<string, string> {
  const map = new Map<string, string>();
  map.set(ANY_NET_ID, 'Any');
  map.set(ANY_SVC_ID, 'Any');
  for (const obj of objects) {
    map.set(obj.id, obj.name);
  }
  for (const m of objectMappings) {
    const n = m.proposedTarget?.name;
    if (n) map.set(m.sourceId, n);
  }
  return map;
}

async function fetchMapping(projectId: string): Promise<MappingDecision[]> {
  const r = await fetch(`/api/projects/${projectId}/mapping`);
  return r.json();
}

export default function MapPolicyPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [objects, setObjects] = useState<Array<{ id: string; name: string }>>([]);
  const [allMappings, setAllMappings] = useState<MappingDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<MappingDecision | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [editNat, setEditNat] = useState<MappingDecision | null>(null);
  const [natComments, setNatComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [norm, map] = await Promise.all([
        fetch(`/api/projects/${projectId}/normalized`).then((r) => r.json()),
        fetchMapping(projectId),
      ]);
      setObjects(norm.objects || []);
      setAllMappings(map || []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const ruleMappings = allMappings.filter((m) => m.entityType === 'rule');
  const natMappings = allMappings.filter((m) => m.entityType === 'nat');
  const objectMappings = allMappings.filter(
    (m) => (m.entityType === 'object' || m.entityType === 'service') && m.proposedTarget?.name
  );
  const nameById = buildNameById(objects, objectMappings);
  const resolveIds = (ids: string[]) =>
    ids.map((id) => nameById.get(id) ?? id).slice(0, 5).join(', ');

  function openRuleEdit(m: MappingDecision) {
    setError(null);
    setBanner(null);
    setEditRule(m);
    setRuleName(m.proposedTarget.name || m.sourceId);
  }

  function openNatEdit(m: MappingDecision) {
    setError(null);
    setBanner(null);
    setEditNat(m);
    setNatComments(String(m.proposedTarget.comments ?? ''));
  }

  async function saveRuleName() {
    if (!editRule) return;
    const err = validateCheckPointExportName(ruleName);
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const merged = { ...editRule.proposedTarget, name: ruleName.trim() };
      const res = await fetch(`/api/projects/${projectId}/mapping/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: 'rule',
          sourceId: editRule.sourceId,
          proposedTarget: merged,
          notes: 'Map Policy: rule name edit',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Save failed');
        return;
      }
      setEditRule(null);
      setBanner('Rule mapping saved.');
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function saveNatComments() {
    if (!editNat) return;
    setSaving(true);
    setError(null);
    try {
      const merged = { ...editNat.proposedTarget, comments: natComments.trim() || undefined };
      const res = await fetch(`/api/projects/${projectId}/mapping/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: 'nat',
          sourceId: editNat.sourceId,
          proposedTarget: merged,
          notes: 'Map Policy: NAT comment edit',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Save failed');
        return;
      }
      setEditNat(null);
      setBanner('NAT mapping saved.');
      await reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/projects" className="hover:text-cyan-400">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Map Policy</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Map Policy Rules</h2>
      <p className="text-slate-400 mb-6">
        Rename access rules and adjust NAT comments before validate/export. Names must match Check Point SMS naming (letters,
        numbers, underscore, hyphen; max 63).
      </p>
      {banner && (
        <p className="mb-4 text-sm text-green-400" role="status">
          {banner}
        </p>
      )}

      <h3 className="text-sm font-medium text-slate-300 mb-2">Access rules</h3>
      <div className="border border-slate-700 rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left p-4">Rule</th>
              <th className="text-left p-4">Action</th>
              <th className="text-left p-4">Source → Dest</th>
              <th className="text-left p-4">Confidence</th>
              <th className="text-left p-4 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : ruleMappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-slate-500">
                  No access rules in this project.
                </td>
              </tr>
            ) : (
              ruleMappings.map((m) => (
                <tr key={m.id} className="border-t border-slate-700 hover:bg-slate-800/50">
                  <td className="p-4 font-mono">{m.proposedTarget.name}</td>
                  <td className="p-4">{m.proposedTarget.action}</td>
                  <td className="p-4 text-slate-400">
                    {resolveIds(m.proposedTarget.source || [])} →{' '}
                    {resolveIds(m.proposedTarget.destination || [])}
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
                  <td className="p-4">
                    <button
                      type="button"
                      onClick={() => openRuleEdit(m)}
                      className="text-cyan-400 hover:text-cyan-300 text-xs font-medium"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-medium text-slate-300 mb-2">NAT</h3>
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left p-4">Type</th>
              <th className="text-left p-4">Original → Translated</th>
              <th className="text-left p-4">Comment</th>
              <th className="text-left p-4 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="p-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : natMappings.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-slate-500">
                  No NAT rules.
                </td>
              </tr>
            ) : (
              natMappings.map((m) => {
                const pt = m.proposedTarget;
                return (
                  <tr key={m.id} className="border-t border-slate-700 hover:bg-slate-800/50">
                    <td className="p-4">{String(pt.type ?? '')}</td>
                    <td className="p-4 text-slate-400 text-xs font-mono">
                      {String(pt.originalDestination ?? pt.originalSource ?? '—')} →{' '}
                      {String(pt.translatedDestination ?? pt.translatedSource ?? '—')}
                    </td>
                    <td className="p-4 text-slate-500 text-xs">{String(pt.comments ?? '—')}</td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => openNatEdit(m)}
                        className="text-cyan-400 hover:text-cyan-300 text-xs font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editRule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-rule-title"
        >
          <div className="bg-slate-900 border border-slate-600 rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 id="edit-rule-title" className="text-lg font-semibold mb-4">
              Rename access rule
            </h3>
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <label className="block text-xs text-slate-500 mb-1">Check Point rule name</label>
            <input
              className="w-full mb-4 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              autoComplete="off"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditRule(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveRuleName()}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editNat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-nat-title"
        >
          <div className="bg-slate-900 border border-slate-600 rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 id="edit-nat-title" className="text-lg font-semibold mb-4">
              Edit NAT comment
            </h3>
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <label className="block text-xs text-slate-500 mb-1">Comment (export / SmartConsole)</label>
            <textarea
              className="w-full mb-4 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100 min-h-[88px]"
              value={natComments}
              onChange={(e) => setNatComments(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditNat(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveNatComments()}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

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
