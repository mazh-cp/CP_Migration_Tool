'use client';

import { useEffect, useState } from 'react';
import { Card, Badge } from '@cisco2cp/ui';
import { ShieldAlert, Route as RouteIcon, FileWarning, CheckCircle2, KeyRound } from 'lucide-react';

type Coverage = {
  converted: { objects: number; rules: number; nat: number; routes: number; interfaces: number; zones: number };
  reviewNotes: { category: string; count: number }[];
  unsupported: { command: string; count: number; samples: string[] }[];
  unsupportedTotal: number;
};

type Vpn = {
  remoteAccess: { poolName?: string; poolRange?: string; splitTunnelList?: string; protocols: string[] }[];
  siteToSite: { name: string; peer?: string; matchAcl?: string; pskConfigured?: boolean }[];
} | null;

type NormalizedRoute = { id: string; destCidr: string; nextHop: string; interfaceName?: string; metric?: number };

type NormalizedResponse = {
  migrationReport?: { coverage?: Coverage };
  routes?: NormalizedRoute[];
  vpn?: Vpn;
};

const CONVERTED_LABELS: [keyof Coverage['converted'], string][] = [
  ['objects', 'Objects'],
  ['rules', 'Rules'],
  ['nat', 'NAT rules'],
  ['routes', 'Static routes'],
  ['interfaces', 'Interfaces'],
  ['zones', 'Zones'],
];

const NOTE_LABELS: Record<string, string> = {
  vpn: 'VPN',
  'dynamic-routing': 'Dynamic routing',
  'high-availability': 'High availability',
  inspection: 'Inspection / Threat Prevention',
  'utm-profiles': 'UTM profiles',
  'identity-policy': 'Identity policy',
  'policy-nat': 'Policy NAT',
  schedule: 'Schedules',
  'orphan-objects': 'Orphan objects',
  'internet-service-isdb': 'ISDB / internet-service',
};

function noteLabel(category: string): string {
  if (NOTE_LABELS[category]) return NOTE_LABELS[category];
  if (category.startsWith('validation-')) return `Validation (${category.replace('validation-', '')})`;
  return category.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MigrationCoverage({ projectId }: { projectId: string }) {
  const [data, setData] = useState<NormalizedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/normalized`);
        if (!res.ok) throw new Error('unavailable');
        const json = (await res.json()) as NormalizedResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError('Coverage report is available after a successful parse.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-slate-800/60" />;
  if (error || !data?.migrationReport?.coverage) {
    return (
      <Card className="p-5 text-sm text-slate-400">
        {error ?? 'No coverage report yet — run parse first.'}
      </Card>
    );
  }

  const coverage = data.migrationReport.coverage;
  const routes = data.routes ?? [];
  const vpn = data.vpn ?? null;
  const hasVpn = !!vpn && (vpn.remoteAccess.length > 0 || vpn.siteToSite.length > 0);

  return (
    <Card className="p-5 space-y-6">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-brand-300" aria-hidden />
        <h3 className="text-base font-semibold text-white">Migration coverage</h3>
      </div>

      {/* Converted counts */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {CONVERTED_LABELS.map(([key, label]) => (
          <div key={key} className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2.5">
            <div className="text-lg font-semibold tabular-nums text-white">{coverage.converted[key]}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Review notes */}
      {coverage.reviewNotes.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <ShieldAlert className="h-4 w-4 text-warning" aria-hidden />
            Needs manual review
          </div>
          <div className="flex flex-wrap gap-2">
            {coverage.reviewNotes.map((n) => (
              <Badge key={n.category} tone="warning">
                {noteLabel(n.category)} · {n.count}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* VPN notes detail */}
      {hasVpn && vpn && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <KeyRound className="h-4 w-4 text-brand-300" aria-hidden />
            VPN (review notes — recreate manually; keys never exported)
          </div>
          <ul className="space-y-1 text-sm text-slate-400">
            {vpn.remoteAccess.map((ra, i) => (
              <li key={`ra-${i}`}>
                <span className="text-slate-300">Remote access</span> — pool {ra.poolRange || ra.poolName || '—'}
                {ra.protocols.length > 0 && ` · ${ra.protocols.join(', ')}`}
                {ra.splitTunnelList && ` · split-tunnel: ${ra.splitTunnelList}`}
              </li>
            ))}
            {vpn.siteToSite.map((s, i) => (
              <li key={`s2s-${i}`}>
                <span className="text-slate-300">Site-to-site</span> — peer {s.peer || s.name}
                {s.matchAcl && ` · ACL ${s.matchAcl}`}
                {s.pskConfigured && ' · PSK configured'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Static routes preview */}
      {routes.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <RouteIcon className="h-4 w-4 text-brand-300" aria-hidden />
            Static routes ({routes.length}) — converted to Gaia
          </div>
          <ul className="space-y-1 font-mono text-xs text-slate-400">
            {routes.slice(0, 6).map((r) => (
              <li key={r.id}>
                {r.destCidr === '0.0.0.0/0' ? 'default' : r.destCidr} → {r.nextHop}
                {r.interfaceName ? ` (${r.interfaceName})` : ''}
              </li>
            ))}
            {routes.length > 6 && <li className="text-slate-500">…and {routes.length - 6} more</li>}
          </ul>
        </section>
      )}

      {/* Unsupported constructs */}
      {coverage.unsupported.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <FileWarning className="h-4 w-4 text-slate-400" aria-hidden />
            Not migrated ({coverage.unsupportedTotal} line{coverage.unsupportedTotal === 1 ? '' : 's'})
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-700">
            <table className="w-full text-left text-sm">
              <tbody>
                {coverage.unsupported.map((u) => (
                  <tr key={u.command} className="border-b border-slate-700/60 last:border-0">
                    <td className="w-32 px-3 py-2 align-top font-mono text-slate-300">{u.command}</td>
                    <td className="px-3 py-2 align-top text-slate-500">
                      <span className="text-slate-400">{u.count}×</span>
                      {u.samples[0] && <span className="ml-2 font-mono text-xs">{u.samples[0]}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            These constructs were not converted. Review them and configure the Check Point equivalents manually.
          </p>
        </section>
      )}
    </Card>
  );
}
