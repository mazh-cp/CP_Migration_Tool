'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Network, Save } from 'lucide-react';

interface NormalizedInterface {
  id: string;
  name: string;
  ip?: string;
  mask?: string;
  securityLevel?: number;
  zoneId?: string;
}

interface InterfaceMapping {
  asaInterfaceId: string;
  cpInterfaceName: string;
  cpIpOverride?: string;
  cpMaskOverride?: string;
}

const CP_INTERFACE_PRESETS = ['MGMT', 'eth0', 'eth1', 'eth2', 'eth3', 'eth4', 'eth5'];

function maskToCidr(mask?: string): number {
  if (!mask) return 24;
  if (mask.includes('/')) return parseInt(mask.split('/')[1] || '24', 10);
  const parts = mask.split('.').map(Number);
  let cidr = 0;
  for (const p of parts) {
    if (p === 255) cidr += 8;
    else if (p > 0) {
      let m = p;
      while (m) {
        cidr += m & 1;
        m >>= 1;
      }
      break;
    }
  }
  return cidr || 24;
}

export default function MapInterfacesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [interfaces, setInterfaces] = useState<NormalizedInterface[]>([]);
  const [mappings, setMappings] = useState<Record<string, InterfaceMapping>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/normalized`).then((r) => (r.ok ? r.json() : { interfaces: [] })),
      fetch(`/api/projects/${projectId}/interface-mappings`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([norm, mappingList]) => {
      setInterfaces(norm.interfaces || []);
      const map: Record<string, InterfaceMapping> = {};
      for (const m of mappingList as InterfaceMapping[]) {
        map[m.asaInterfaceId] = m;
      }
      setMappings(map);
    });
  }, [projectId]);

  function updateMapping(asaId: string, updates: Partial<Omit<InterfaceMapping, 'asaInterfaceId'>>) {
    setMappings((prev) => {
      const current = prev[asaId];
      return {
        ...prev,
        [asaId]: {
          asaInterfaceId: asaId,
          cpInterfaceName: current?.cpInterfaceName ?? asaId,
          cpIpOverride: current?.cpIpOverride,
          cpMaskOverride: current?.cpMaskOverride,
          ...updates,
        },
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const payload = Object.values(mappings).filter(
        (m) => m.cpInterfaceName?.trim() && m.cpInterfaceName !== 'eth_custom'
      );
      await fetch(`/api/projects/${projectId}/interface-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/projects" className="hover:text-cyan-400">Projects</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Map Interfaces</span>
      </nav>
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Network className="w-5 h-5" />
        Interface Mapping
      </h2>
      <p className="text-slate-400 mb-6">
        Map Cisco ASA interfaces to Check Point firewall interfaces. Assign MGMT, eth0, eth1, etc. to match your
        target Check Point topology.
      </p>

      {interfaces.length === 0 ? (
        <div className="p-8 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-400 text-center">
          No interfaces found in source config. Import and parse an ASA config first.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {interfaces.map((iface) => (
              <div
                key={iface.id}
                className="p-4 rounded-xl border border-slate-600 bg-slate-800/50 hover:border-cyan-500/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-cyan-500" />
                  <span className="font-mono font-medium text-cyan-300">{iface.name}</span>
                </div>
                <div className="space-y-1 text-sm text-slate-400 mb-4">
                  <div>
                    IP: {iface.ip || '(not set)'}
                    {iface.mask && ` /${maskToCidr(iface.mask)}`}
                  </div>
                  {iface.securityLevel != null && (
                    <div>Security level: {iface.securityLevel}</div>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Map to Check Point</label>
                    <select
                      value={
                        mappings[iface.id]?.cpInterfaceName &&
                        CP_INTERFACE_PRESETS.includes(mappings[iface.id].cpInterfaceName)
                          ? mappings[iface.id].cpInterfaceName
                          : mappings[iface.id]?.cpInterfaceName
                            ? '__custom__'
                            : ''
                      }
                      onChange={(e) =>
                        updateMapping(iface.id, {
                          cpInterfaceName:
                            e.target.value === '__custom__' ? 'eth_custom' : e.target.value || iface.name,
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">Select interface</option>
                      {CP_INTERFACE_PRESETS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                      <option value="__custom__">Custom name</option>
                    </select>
                  </div>
                  {(mappings[iface.id]?.cpInterfaceName === 'eth_custom' ||
                    (mappings[iface.id]?.cpInterfaceName &&
                      !CP_INTERFACE_PRESETS.includes(mappings[iface.id].cpInterfaceName!))) && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Custom interface name</label>
                      <input
                        type="text"
                        value={mappings[iface.id]?.cpInterfaceName === 'eth_custom' ? '' : (mappings[iface.id]?.cpInterfaceName ?? '')}
                        onChange={(e) => updateMapping(iface.id, { cpInterfaceName: e.target.value.trim() || 'eth_custom' })}
                        placeholder="e.g. eth10, wan1"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">IP override</label>
                      <input
                        type="text"
                        value={mappings[iface.id]?.cpIpOverride ?? ''}
                        onChange={(e) => updateMapping(iface.id, { cpIpOverride: e.target.value || undefined })}
                        placeholder={iface.ip || 'optional'}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Mask override</label>
                      <input
                        type="text"
                        value={mappings[iface.id]?.cpMaskOverride ?? ''}
                        onChange={(e) => updateMapping(iface.id, { cpMaskOverride: e.target.value || undefined })}
                        placeholder={iface.mask ? `/${maskToCidr(iface.mask)}` : 'optional'}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save mappings'}
            </button>
            <Link
              href={`/projects/${projectId}/map/objects`}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg"
            >
              Next: Map Objects
            </Link>
            <Link href={`/projects/${projectId}/parse`} className="px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600">
              Back
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
