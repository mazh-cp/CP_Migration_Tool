'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { validateCheckPointExportName, validateNormalizedObjectRename } from '@/lib/checkpoint-format';

interface NormalizedObject {
  id: string;
  name: string;
  type: string;
  port?: number;
  portRange?: { from: number; to: number };
}

interface MappingDecision {
  id: string;
  entityType: string;
  sourceId: string;
  proposedTarget: { type: string; name: string; [k: string]: unknown };
  confidenceScore: number;
  reasons: string[];
  warnings: string[];
}

function isServiceMapping(m: MappingDecision): boolean {
  return m.entityType === 'service';
}

async function fetchProjectData(projectId: string) {
  const [normRes, mapRes] = await Promise.all([
    fetch(`/api/projects/${projectId}/normalized`),
    fetch(`/api/projects/${projectId}/mapping`),
  ]);
  const norm = await normRes.json();
  const map = await mapRes.json();
  return {
    objects: (norm.objects || []) as NormalizedObject[],
    mappings: (map as MappingDecision[]).filter((m) => m.entityType === 'object' || m.entityType === 'service'),
  };
}

export default function MapObjectsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [normalized, setNormalized] = useState<{ objects: NormalizedObject[] } | null>(null);
  const [mappings, setMappings] = useState<MappingDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<MappingDecision | null>(null);
  const [cpName, setCpName] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [portInput, setPortInput] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { objects, mappings: m } = await fetchProjectData(projectId);
      setNormalized({ objects });
      setMappings(m);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const objMap = new Map(normalized?.objects?.map((o) => [o.id, o]) || []);

  function openEdit(m: MappingDecision) {
    setError(null);
    setSuccess(null);
    setEditRow(m);
    setCpName(m.proposedTarget.name);
    const src = objMap.get(m.sourceId);
    setSourceName(src?.name ?? '');
    const pt = m.proposedTarget as { port?: number; portFrom?: number; portTo?: number };
    if (pt.port != null) setPortInput(String(pt.port));
    else setPortInput('');
    if (pt.portFrom != null && pt.portTo != null) {
      setRangeFrom(String(pt.portFrom));
      setRangeTo(String(pt.portTo));
    } else {
      setRangeFrom('');
      setRangeTo('');
    }
  }

  function closeEdit() {
    setEditRow(null);
    setError(null);
  }

  async function saveEdit() {
    if (!editRow) return;
    setError(null);
    setSuccess(null);

    const cpErr = validateCheckPointExportName(cpName);
    if (cpErr) {
      setError(cpErr);
      return;
    }

    const src = objMap.get(editRow.sourceId);
    const sourceChanged = src && sourceName.trim() !== src.name;
    let portChanged = false;
    let portPayload: { port?: number; portRange?: { from: number; to: number } } = {};

    if (isServiceMapping(editRow) && src?.type === 'service') {
      const pt = editRow.proposedTarget as { port?: number; portFrom?: number; portTo?: number };
      const rf = rangeFrom.trim() ? parseInt(rangeFrom, 10) : NaN;
      const rt = rangeTo.trim() ? parseInt(rangeTo, 10) : NaN;
      if (!isNaN(rf) && !isNaN(rt)) {
        if (rf > rt) {
          setError('Port range: from must be ≤ to');
          return;
        }
        portChanged =
          pt.portFrom !== rf || pt.portTo !== rt || pt.port != null;
        portPayload = { portRange: { from: rf, to: rt } };
      } else if (portInput.trim()) {
        const p = parseInt(portInput, 10);
        if (isNaN(p) || p < 0 || p > 65535) {
          setError('Port must be 0–65535');
          return;
        }
        portChanged = pt.port !== p || pt.portFrom != null;
        portPayload = { port: p };
      }
    }

    if (sourceChanged) {
      const nErr = validateNormalizedObjectRename(sourceName);
      if (nErr) {
        setError(nErr);
        return;
      }
    }

    setSaving(true);
    try {
      if (sourceChanged || portChanged) {
        const body: {
          objectId: string;
          name?: string;
          port?: number;
          portRange?: { from: number; to: number };
        } = { objectId: editRow.sourceId };
        if (sourceChanged) body.name = sourceName.trim();
        if (portChanged && isServiceMapping(editRow)) {
          if (portPayload.portRange) body.portRange = portPayload.portRange;
          else if (portPayload.port !== undefined) body.port = portPayload.port;
        }
        const res = await fetch(`/api/projects/${projectId}/patch-object`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof j.error === 'string' ? j.error : 'Failed to update source object');
          return;
        }
      }

      const { mappings: fresh } = await fetchProjectData(projectId);
      const latest = fresh.find(
        (x) => x.entityType === editRow.entityType && x.sourceId === editRow.sourceId
      );
      const base = { ...(latest ?? editRow).proposedTarget } as Record<string, unknown>;
      base.name = cpName.trim();

      const ov = await fetch(`/api/projects/${projectId}/mapping/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: editRow.entityType,
          sourceId: editRow.sourceId,
          proposedTarget: base,
          notes: 'Map Objects: name / mapping edit',
        }),
      });
      if (!ov.ok) {
        const j = await ov.json().catch(() => ({}));
        setError(typeof j.error === 'string' ? j.error : 'Failed to save mapping');
        return;
      }

      await reload();
      setSuccess('Saved.');
      closeEdit();
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
        <span className="text-slate-300">Map Objects</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Map Objects</h2>
      <p className="text-slate-400 mb-6">
        Review and edit Check Point export names and optional source object fields before export. Edits are saved to
        your project mapping.
      </p>
      {success && !editRow && (
        <p className="mb-4 text-sm text-green-400" role="status">
          {success}
        </p>
      )}
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left p-4">Source</th>
              <th className="text-left p-4">Mapped To</th>
              <th className="text-left p-4">Confidence</th>
              <th className="text-left p-4">Warnings</th>
              <th className="text-left p-4 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-4 text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-slate-500">
                  No object or service mappings yet. Run parse first.
                </td>
              </tr>
            ) : (
              mappings.map((m) => {
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
                    <td className="p-4 text-amber-400">{m.warnings?.length ? m.warnings.join('; ') : '-'}</td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => openEdit(m)}
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

      {editRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-object-title"
        >
          <div className="bg-slate-900 border border-slate-600 rounded-lg max-w-lg w-full p-6 shadow-xl">
            <h3 id="edit-object-title" className="text-lg font-semibold mb-1">
              Edit object mapping
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Source: <span className="font-mono text-slate-300">{objMap.get(editRow.sourceId)?.name ?? editRow.sourceId}</span>
            </p>
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <label className="block text-xs text-slate-500 mb-1">Check Point export name</label>
            <input
              className="w-full mb-4 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100"
              value={cpName}
              onChange={(e) => setCpName(e.target.value)}
              autoComplete="off"
            />
            <label className="block text-xs text-slate-500 mb-1">Source object name (normalized)</label>
            <input
              className="w-full mb-4 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-slate-500 mb-4">
              Changing the source name or port rebuilds the proposed object, then applies the Check Point name above.
            </p>
            {isServiceMapping(editRow) && objMap.get(editRow.sourceId)?.type === 'service' && (
              <>
                <label className="block text-xs text-slate-500 mb-1">TCP/UDP port (single)</label>
                <input
                  className="w-full mb-2 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100"
                  value={portInput}
                  onChange={(e) => setPortInput(e.target.value)}
                  placeholder="e.g. 443"
                  inputMode="numeric"
                />
                <label className="block text-xs text-slate-500 mb-1">Or port range (from / to)</label>
                <div className="flex gap-2 mb-4">
                  <input
                    className="flex-1 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    placeholder="from"
                    inputMode="numeric"
                  />
                  <input
                    className="flex-1 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    placeholder="to"
                    inputMode="numeric"
                  />
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={closeEdit}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
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
