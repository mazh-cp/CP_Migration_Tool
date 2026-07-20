'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
    service?: string[];
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

/** Map Check Point export fields back to normalized rule fields for the edit form. */
function checkpointRuleToForm(pt: MappingDecision['proposedTarget']) {
  const actionCp = String(pt.action ?? 'accept');
  const action: 'allow' | 'deny' | 'reject' =
    actionCp === 'drop' ? 'deny' : actionCp === 'reject' ? 'reject' : 'allow';
  const tr = String(pt.track ?? 'log');
  const log: 'none' | 'log' | 'alert' =
    tr === 'none' ? 'none' : tr === 'alert' ? 'alert' : 'log';
  return {
    enabled: pt.enabled !== false,
    comments: String(pt.comments ?? ''),
    action,
    log,
  };
}

function RefListEditor({
  label,
  helper,
  ids,
  onChange,
  allObjects,
  resolveLabel,
  disabled,
}: {
  label: string;
  helper?: string;
  ids: string[];
  onChange: (ids: string[]) => void;
  allObjects: Array<{ id: string; name: string; type?: string }>;
  resolveLabel: (id: string) => string;
  disabled: boolean;
}) {
  const [filter, setFilter] = useState('');
  const catalog = useMemo(() => {
    const builtins: Array<{ id: string; name: string; type: string }> = [
      { id: ANY_NET_ID, name: 'Any (address)', type: 'builtin' },
      { id: ANY_SVC_ID, name: 'Any (service)', type: 'builtin' },
    ];
    const rest = [...allObjects]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => ({ id: o.id, name: o.name, type: o.type ?? 'object' }));
    const t = filter.trim().toLowerCase();
    const list = [...builtins, ...rest];
    if (!t) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(t) || c.id.toLowerCase().includes(t) || c.type.includes(t)
    );
  }, [allObjects, filter]);

  return (
    <div className="mb-3">
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {helper ? <p className="text-[11px] text-slate-500 mb-2">{helper}</p> : null}
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {ids.length === 0 ? (
          <span className="text-xs text-slate-600">None</span>
        ) : (
          ids.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded bg-slate-800 border border-slate-600 px-2 py-0.5 text-xs max-w-full"
            >
              <span className="truncate text-slate-200" title={id}>
                {resolveLabel(id)}
              </span>
              <button
                type="button"
                disabled={disabled}
                className="shrink-0 text-danger hover:text-red-300 disabled:opacity-40"
                onClick={() => onChange(ids.filter((x) => x !== id))}
                aria-label={`Remove ${id}`}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <input
        type="search"
        className="w-full mb-1.5 px-2 py-1.5 rounded bg-slate-950 border border-slate-600 text-xs text-slate-200 placeholder:text-slate-600"
        placeholder="Filter by name, id, or type…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        disabled={disabled}
      />
      <div className="max-h-36 overflow-y-auto rounded border border-slate-700 bg-slate-950/50 pr-1">
        {catalog.map((c) => {
          const on = ids.includes(c.id);
          return (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-800/80 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-slate-200">{c.name}</div>
                <div className="truncate font-mono text-[10px] text-slate-500">
                  {c.id} · {c.type}
                </div>
              </div>
              {on ? (
                <button
                  type="button"
                  disabled={disabled}
                  className="shrink-0 text-amber-400 hover:text-amber-300"
                  onClick={() => onChange(ids.filter((x) => x !== c.id))}
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  className="shrink-0 text-brand-400 hover:text-brand-300"
                  onClick={() => onChange([...ids, c.id])}
                >
                  Add
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MapPolicyPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [objects, setObjects] = useState<Array<{ id: string; name: string; type?: string }>>([]);
  const [allMappings, setAllMappings] = useState<MappingDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<MappingDecision | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleAction, setRuleAction] = useState<'allow' | 'deny' | 'reject'>('allow');
  const [ruleLog, setRuleLog] = useState<'none' | 'log' | 'alert'>('log');
  const [ruleComments, setRuleComments] = useState('');
  const [ruleSourceIds, setRuleSourceIds] = useState<string[]>([]);
  const [ruleDestIds, setRuleDestIds] = useState<string[]>([]);
  const [ruleServiceIds, setRuleServiceIds] = useState<string[]>([]);
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
  const nameById = useMemo(() => buildNameById(objects, objectMappings), [objects, objectMappings]);
  const resolveIds = (ids: string[]) =>
    ids.map((id) => nameById.get(id) ?? id).slice(0, 5).join(', ');
  const resolveLabel = useCallback((id: string) => nameById.get(id) ?? id, [nameById]);

  function openRuleEdit(m: MappingDecision) {
    setError(null);
    setBanner(null);
    setEditRule(m);
    setRuleName(m.proposedTarget.name || m.sourceId);
    const f = checkpointRuleToForm(m.proposedTarget);
    setRuleEnabled(f.enabled);
    setRuleAction(f.action);
    setRuleLog(f.log);
    setRuleComments(f.comments);
    setRuleSourceIds([...(m.proposedTarget.source ?? [])]);
    setRuleDestIds([...(m.proposedTarget.destination ?? [])]);
    setRuleServiceIds([...((m.proposedTarget.service as string[] | undefined) ?? [])]);
  }

  function openNatEdit(m: MappingDecision) {
    setError(null);
    setBanner(null);
    setEditNat(m);
    setNatComments(String(m.proposedTarget.comments ?? ''));
  }

  async function saveRuleEdits() {
    if (!editRule) return;
    const err = validateCheckPointExportName(ruleName);
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/patch-rule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: editRule.sourceId,
          name: ruleName.trim(),
          enabled: ruleEnabled,
          comments: ruleComments,
          action: ruleAction,
          log: ruleLog,
          sourceRefs: ruleSourceIds,
          destinationRefs: ruleDestIds,
          serviceRefs: ruleServiceIds,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Save failed');
        return;
      }
      setEditRule(null);
      if (j.hasErrors) {
        setBanner('Rule saved. Validation still reports errors — check the Validate step before export.');
      } else if (j.hasWarnings) {
        setBanner('Rule saved. Review warnings on the Validate step if needed.');
      } else {
        setBanner('Rule saved.');
      }
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
        <Link href="/projects" className="hover:text-brand-300">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Map Policy</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4">Map Policy Rules</h2>
      <p className="text-slate-400 mb-6">
        Edit access rule names, action, logging, enabled state, comments, and source / destination / service membership when
        migration needs a different object set (updates normalized data and mapping together). Adjust NAT comments where
        needed. Rule names must match Check Point SMS naming (letters, numbers, underscore, hyphen; max 63).
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
                            : 'text-danger'
                      }
                    >
                      {(m.confidenceScore * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="p-4">
                    <button
                      type="button"
                      onClick={() => openRuleEdit(m)}
                      className="text-brand-300 hover:text-brand-200 text-xs font-medium"
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
                        className="text-brand-300 hover:text-brand-200 text-xs font-medium"
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
          <div className="bg-slate-900 border border-slate-600 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl">
            <h3 id="edit-rule-title" className="text-lg font-semibold mb-4">
              Edit access rule
            </h3>
            {error && <p className="text-sm text-danger mb-3">{error}</p>}
            <label className="block text-xs text-slate-500 mb-1">Check Point rule name</label>
            <input
              className="w-full mb-3 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              autoComplete="off"
            />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Action (normalized)</label>
                <select
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100"
                  value={ruleAction}
                  onChange={(e) => setRuleAction(e.target.value as 'allow' | 'deny' | 'reject')}
                  disabled={saving}
                >
                  <option value="allow">Allow → Accept</option>
                  <option value="deny">Deny → Drop</option>
                  <option value="reject">Reject</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Track</label>
                <select
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100"
                  value={ruleLog}
                  onChange={(e) => setRuleLog(e.target.value as 'none' | 'log' | 'alert')}
                  disabled={saving}
                >
                  <option value="none">None</option>
                  <option value="log">Log</option>
                  <option value="alert">Alert</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-3 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-slate-600"
                checked={ruleEnabled}
                onChange={(e) => setRuleEnabled(e.target.checked)}
                disabled={saving}
              />
              Enabled
            </label>

            <div className="border-t border-slate-700 pt-4 mt-1 mb-2">
              <p className="text-xs text-slate-500 mb-3">
                Source, destination, and service lists use normalized object IDs. Only objects present in this project (plus
                Any) can be selected — add or rename objects on{' '}
                <Link href={`/projects/${projectId}/map/objects`} className="text-brand-300 hover:text-brand-200 underline">
                  Map Objects
                </Link>{' '}
                first if something is missing.
              </p>
              <RefListEditor
                key={`${editRule.sourceId}-src`}
                label="Source"
                helper="Typically hosts, networks, groups, or Any (address)."
                ids={ruleSourceIds}
                onChange={setRuleSourceIds}
                allObjects={objects}
                resolveLabel={resolveLabel}
                disabled={saving}
              />
              <RefListEditor
                key={`${editRule.sourceId}-dst`}
                label="Destination"
                helper="Typically hosts, networks, groups, or Any (address)."
                ids={ruleDestIds}
                onChange={setRuleDestIds}
                allObjects={objects}
                resolveLabel={resolveLabel}
                disabled={saving}
              />
              <RefListEditor
                key={`${editRule.sourceId}-svc`}
                label="Services"
                helper="TCP/UDP/ICMP services, service groups, or Any (service)."
                ids={ruleServiceIds}
                onChange={setRuleServiceIds}
                allObjects={objects}
                resolveLabel={resolveLabel}
                disabled={saving}
              />
            </div>

            <label className="block text-xs text-slate-500 mb-1">Comment</label>
            <textarea
              className="w-full mb-4 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-100 min-h-[72px]"
              value={ruleComments}
              onChange={(e) => setRuleComments(e.target.value)}
              disabled={saving}
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
                onClick={() => void saveRuleEdits()}
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50"
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
            {error && <p className="text-sm text-danger mb-3">{error}</p>}
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
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50"
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
          className="px-4 py-2 bg-brand-500 hover:bg-brand-400 rounded-lg"
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
