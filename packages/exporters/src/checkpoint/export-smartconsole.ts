import type { CheckPointJsonBundle } from './export-json';

function escapeCsv(val: string): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export SmartConsole-friendly CSVs from CheckPointJsonBundle.
 * GUI import format (objects, services, groups, policy, NAT).
 */
export function exportToSmartConsoleCsv(bundle: CheckPointJsonBundle): {
  objects: string;
  services: string;
  groups: string;
  policy: string;
  nat: string;
} {
  const objects = buildObjectsCsv(bundle);
  const services = buildServicesCsv(bundle);
  const groups = buildGroupsCsv(bundle);
  const policy = buildPolicyCsv(bundle);
  const nat = buildNatCsv(bundle);
  return { objects, services, groups, policy, nat };
}

function buildObjectsCsv(bundle: CheckPointJsonBundle): string {
  const rows: string[][] = [['Name', 'Type', 'IP/CIDR/Range/FQDN', 'Color', 'Comment']];
  for (const o of bundle.objects as Array<{ name: string; type?: string; ipAddress?: string; subnet?: string; subnetMask?: string; rangeFrom?: string; rangeTo?: string; comments?: string }>) {
    const type = (o.type || 'host').replace('service-', '');
    let value = o.ipAddress || o.subnet || '';
    if (o.subnet && o.subnetMask && !o.subnet.includes('/')) value = `${o.subnet}/${maskToCidr(o.subnetMask)}`;
    else if (o.rangeFrom && o.rangeTo) value = `${o.rangeFrom}-${o.rangeTo}`;
    rows.push([o.name, type, value, '', o.comments ?? '']);
  }
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
}

function maskToCidr(mask: string): number {
  if (mask.includes('/')) return parseInt(mask.split('/')[1] || '32', 10);
  const n = parseInt(mask, 10);
  if (!isNaN(n) && n >= 0 && n <= 32) return n;
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

function buildServicesCsv(bundle: CheckPointJsonBundle): string {
  const rows: string[][] = [['Name', 'Protocol', 'Port/Range', 'Comment']];
  for (const s of bundle.services as Array<{ name: string; type?: string; port?: number; portFrom?: number; portTo?: number }>) {
    const proto = (s.type || '').replace('service-', '').toUpperCase() || 'TCP';
    const port = s.port ? String(s.port) : (s.portFrom && s.portTo ? `${s.portFrom}-${s.portTo}` : '');
    rows.push([s.name, proto, port, '']);
  }
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
}

function buildGroupsCsv(bundle: CheckPointJsonBundle): string {
  const rows: string[][] = [['GroupName', 'GroupType', 'MemberName', 'Comment']];
  const svcNames = new Set((bundle.services as Array<{ name: string }>).map((s) => s.name));
  for (const g of bundle.groups as Array<{ name: string; members?: string[]; type?: string }>) {
    const gtype = 'network'; // Default; service groups inferred by member type
    for (const m of g.members || []) {
      const memberType = svcNames.has(m) ? 'service' : 'network';
      rows.push([g.name, memberType, m, '']);
    }
  }
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
}

function buildPolicyCsv(bundle: CheckPointJsonBundle): string {
  const rows: string[][] = [
    ['Rule#', 'Name', 'Source', 'Destination', 'Services', 'Action', 'Track', 'Comment', 'IngressInterface', 'Section'],
  ];
  let idx = 1;
  for (const r of bundle.rules as Array<{ name?: string; source?: string[]; destination?: string[]; service?: string[]; action?: string }>) {
    const src = (r.source || []).join(';');
    const dst = (r.destination || []).join(';');
    const svc = (r.service || []).join(';');
    rows.push([
      String(idx++),
      r.name ?? '',
      src || 'Any',
      dst || 'Any',
      svc || 'Any',
      r.action ?? 'Accept',
      'Log',
      '',
      '',
      '',
    ]);
  }
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
}

function buildNatCsv(bundle: CheckPointJsonBundle): string {
  const rows: string[][] = [
    ['Rule#', 'Type', 'OriginalSrc', 'OriginalDst', 'OriginalSvc', 'TranslatedSrc', 'TranslatedDst', 'Comment'],
  ];
  let idx = 1;
  for (const n of bundle.nat as Array<{
    type?: string;
    originalSource?: string;
    originalDestination?: string;
    originalService?: string;
    translatedSource?: string;
    translatedDestination?: string;
  }>) {
    rows.push([
      String(idx++),
      n.type ?? 'static',
      n.originalSource ?? '',
      n.originalDestination ?? '',
      n.originalService ?? '',
      n.translatedSource ?? '',
      n.translatedDestination ?? '',
      '',
    ]);
  }
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
}
