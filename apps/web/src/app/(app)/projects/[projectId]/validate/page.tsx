'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { validateCheckPointObject, type ObjectFormData } from '@/lib/checkpoint-format';

interface Finding {
  id: string;
  severity: string;
  code: string;
  message: string;
  affectedEntityRefs: string[];
  suggestedFix?: string;
}

interface ValidationResult {
  findings: Finding[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

function useValidation(projectId: string) {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);

  const runValidation = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/validate`, { method: 'POST' })
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult({ findings: [], hasErrors: false, hasWarnings: false }))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    runValidation();
  }, [runValidation]);

  return { result, loading, revalidate: runValidation };
}

export default function ValidatePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { result, loading, revalidate } = useValidation(projectId);
  const [fixing, setFixing] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixAllPending, setFixAllPending] = useState(false);
  const [editFinding, setEditFinding] = useState<Finding | null>(null);
  const [editForm, setEditForm] = useState<ObjectFormData>({
    type: 'network',
    name: '',
    value: '',
  });
  const [editErrors, setEditErrors] = useState<{ field: string; message: string }[]>([]);

  const missingRefFindings = result?.findings.filter((f) => f.code === 'MISSING_REF') ?? [];
  const otherFindings = result?.findings.filter((f) => f.code !== 'MISSING_REF') ?? [];
  const canExport = result ? !result.hasErrors : false;

  async function applyFix(
    finding: Finding,
    fixType: 'create_placeholder' | 'replace_with_any' | 'create_custom',
    customObject?: ObjectFormData
  ) {
    const [ruleId, missingObjectId] = finding.affectedEntityRefs;
    if (!ruleId || !missingObjectId) return;

    setFixing(true);
    setFixingId(finding.id);
    try {
      const fixPayload =
        fixType === 'create_custom' && customObject
          ? {
              findingId: finding.id,
              ruleId,
              missingObjectId,
              fixType: 'create_custom' as const,
              object: {
                type: customObject.type,
                name: customObject.name.trim(),
                ...(customObject.type === 'range'
                  ? { rangeFrom: customObject.rangeFrom?.trim(), rangeTo: customObject.rangeTo?.trim() }
                  : { value: customObject.value?.trim() }),
              },
            }
          : { findingId: finding.id, ruleId, missingObjectId, fixType };
      const res = await fetch(`/api/projects/${projectId}/fix-missing-ref`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixes: [fixPayload] }),
      });
      if (res.ok) {
        setEditFinding(null);
        revalidate();
      } else {
        const err = await res.json();
        setEditErrors(err.details || [{ field: 'form', message: err.error || 'Failed' }]);
      }
    } finally {
      setFixing(false);
      setFixingId(null);
    }
  }

  function openEditModal(f: Finding) {
    setEditFinding(f);
    setEditForm({ type: 'network', name: `obj-${f.affectedEntityRefs[1]?.slice(0, 8)}`, value: '0.0.0.0/0' });
    setEditErrors([]);
  }

  function submitEditObject() {
    if (!editFinding) return;
    const errs = validateCheckPointObject(editForm);
    if (errs.length > 0) {
      setEditErrors(errs);
      return;
    }
    applyFix(editFinding, 'create_custom', editForm);
  }

  async function fixAll(fixType: 'create_placeholder' | 'replace_with_any') {
    if (missingRefFindings.length === 0) return;

    setFixAllPending(true);
    try {
      const fixes = missingRefFindings.map((f) => {
        const [ruleId, missingObjectId] = f.affectedEntityRefs;
        return { findingId: f.id, ruleId, missingObjectId, fixType };
      });

      const res = await fetch(`/api/projects/${projectId}/fix-missing-ref`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixes }),
      });
      if (res.ok) revalidate();
    } finally {
      setFixAllPending(false);
    }
  }

  if (loading || !result) {
    return (
      <div className="animate-pulse h-32 bg-slate-800 rounded-xl flex items-center justify-center">
        Validating...
      </div>
    );
  }

  const errors = result.findings.filter((f) => f.severity === 'error');
  const warnings = result.findings.filter((f) => f.severity === 'warn');
  const infos = result.findings.filter((f) => f.severity === 'info');

  return (
    <div>
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/projects" className="hover:text-cyan-400">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Validate</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Validate & Fix</h2>
      <p className="text-slate-400 mb-6">
        Review validation findings. Fix missing object references before exporting to Check Point
        R82.x. Export is blocked until errors are resolved.
      </p>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-slate-800 rounded-lg border border-red-500/30">
          <div className="text-2xl font-bold text-red-400">{errors.length}</div>
          <div className="text-sm text-slate-400">Errors</div>
        </div>
        <div className="p-4 bg-slate-800 rounded-lg border border-amber-500/30">
          <div className="text-2xl font-bold text-amber-400">{warnings.length}</div>
          <div className="text-sm text-slate-400">Warnings</div>
        </div>
        <div className="p-4 bg-slate-800 rounded-lg border border-slate-600">
          <div className="text-2xl font-bold text-blue-400">{infos.length}</div>
          <div className="text-sm text-slate-400">Info</div>
        </div>
      </div>

      {missingRefFindings.length > 0 && (
        <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-cyan-500/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-cyan-400">
              Missing object references ({missingRefFindings.length})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => fixAll('create_placeholder')}
                disabled={fixAllPending}
                className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg"
              >
                {fixAllPending ? 'Fixing...' : 'Create placeholder for all'}
              </button>
              <button
                onClick={() => fixAll('replace_with_any')}
                disabled={fixAllPending}
                className="px-3 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg"
              >
                Replace all with Any
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Rules reference objects that were not found in the source config. Edit to create a custom
            object (validated for Check Point Gaia OS), use a placeholder (0.0.0.0/0), or replace with
            &quot;Any&quot;.
          </p>
          <div className="space-y-2">
            {missingRefFindings.map((f) => (
              <div
                key={f.id}
                className="p-4 rounded-lg border bg-red-500/10 border-red-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{f.message}</div>
                  <div className="text-xs text-slate-400 mt-1 font-mono">
                    Rule: {f.affectedEntityRefs[0]?.slice(0, 8)}... → Missing: {f.affectedEntityRefs[1]?.slice(0, 8)}...
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    onClick={() => openEditModal(f)}
                    disabled={fixing}
                    className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg"
                  >
                    Edit / Create object
                  </button>
                  <button
                    onClick={() => applyFix(f, 'create_placeholder')}
                    disabled={fixing}
                    className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg"
                  >
                    {fixingId === f.id ? 'Applying...' : 'Create placeholder'}
                  </button>
                  <button
                    onClick={() => applyFix(f, 'replace_with_any')}
                    disabled={fixing}
                    className="px-3 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg"
                  >
                    Replace with Any
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {otherFindings.length > 0 && (
        <div className="space-y-2 mb-6">
          <h3 className="font-medium text-slate-300 mb-2">Other findings</h3>
          {otherFindings.map((f) => (
            <div
              key={f.id}
              className={`p-4 rounded-lg border ${
                f.severity === 'error'
                  ? 'bg-red-500/10 border-red-500/30'
                  : f.severity === 'warn'
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-slate-800 border-slate-700'
              }`}
            >
              <div className="font-medium">{f.message}</div>
              <div className="text-sm text-slate-400 mt-1">
                Code: {f.code} | Affected: {f.affectedEntityRefs.join(', ')}
              </div>
              {f.suggestedFix && (
                <div className="text-sm text-cyan-400 mt-1">Fix: {f.suggestedFix}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {result.findings.length === 0 && (
        <div className="p-6 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 mb-6">
          No validation issues found. Ready to export.
        </div>
      )}

      <div className="flex gap-4 items-center">
        <button
          onClick={revalidate}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
        >
          Re-validate
        </button>
        <Link
          href={`/projects/${projectId}/export`}
          className={`px-4 py-2 rounded-lg ${canExport ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-slate-700 cursor-not-allowed opacity-60 pointer-events-none'}`}
        >
          {canExport ? 'Next: Export to Check Point R82.x' : 'Resolve errors to export'}
        </Link>
        <Link href={`/projects/${projectId}/map/policy`} className="px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600">
          Back
        </Link>
      </div>

      {/* Edit / Create Object Modal */}
      {editFinding && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => !fixing && setEditFinding(null)}
        >
          <div
            className="bg-slate-800 rounded-xl border border-slate-600 w-full max-w-md p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Edit / Create Object</h3>
            <p className="text-sm text-slate-400 mb-4">
              Define the missing object. Values are validated against Check Point Gaia OS R82.x format.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Object type</label>
                <select
                  value={editForm.type}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      type: e.target.value as ObjectFormData['type'],
                      value: f.type === 'range' ? undefined : f.value,
                      rangeFrom: undefined,
                      rangeTo: undefined,
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg"
                >
                  <option value="host">Host (IP)</option>
                  <option value="network">Network (CIDR)</option>
                  <option value="range">Range</option>
                  <option value="fqdn">FQDN</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="obj-name (letters, numbers, _, -)"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg"
                />
                {editErrors.find((e) => e.field === 'name') && (
                  <p className="text-red-400 text-xs mt-1">{editErrors.find((e) => e.field === 'name')?.message}</p>
                )}
              </div>

              {editForm.type === 'range' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Range From (IP)</label>
                    <input
                      type="text"
                      value={editForm.rangeFrom || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, rangeFrom: e.target.value }))}
                      placeholder="192.168.1.1"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg"
                    />
                    {editErrors.find((e) => e.field === 'rangeFrom') && (
                      <p className="text-red-400 text-xs mt-1">
                        {editErrors.find((e) => e.field === 'rangeFrom')?.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Range To (IP)</label>
                    <input
                      type="text"
                      value={editForm.rangeTo || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, rangeTo: e.target.value }))}
                      placeholder="192.168.1.100"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg"
                    />
                    {editErrors.find((e) => e.field === 'rangeTo') && (
                      <p className="text-red-400 text-xs mt-1">
                        {editErrors.find((e) => e.field === 'rangeTo')?.message}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-slate-300 mb-1">
                    {editForm.type === 'host'
                      ? 'IP address'
                      : editForm.type === 'network'
                        ? 'Network (CIDR)'
                        : 'FQDN'}
                  </label>
                  <input
                    type="text"
                    value={editForm.value || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
                    placeholder={
                      editForm.type === 'host'
                        ? '192.168.1.1'
                        : editForm.type === 'network'
                          ? '192.168.1.0/24'
                          : 'host.example.com'
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg"
                  />
                  {editErrors.find((e) => e.field === 'value') && (
                    <p className="text-red-400 text-xs mt-1">{editErrors.find((e) => e.field === 'value')?.message}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={submitEditObject}
                disabled={fixing}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg"
              >
                {fixing ? 'Creating...' : 'Create object'}
              </button>
              <button
                onClick={() => setEditFinding(null)}
                disabled={fixing}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
