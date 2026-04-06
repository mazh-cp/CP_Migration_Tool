import type {
  ASAAstNode,
  ExplicitPolicyRule,
  ObjectGroupNetwork,
  ObjectGroupService,
  ObjectNetwork,
  ObjectService,
} from '@cisco2cp/parsers';

/** Check Point R8x-style migration JSON (external tool / review). */
export interface CheckPointR8xMigrationJson {
  version: '1.0';
  objects: {
    hosts: Record<string, unknown>[];
    networks: Record<string, unknown>[];
    'address-ranges': Record<string, unknown>[];
    groups: Record<string, unknown>[];
    'services-tcp': Record<string, unknown>[];
    'services-udp': Record<string, unknown>[];
    'service-groups': Record<string, unknown>[];
  };
  'access-policy': { name: string; 'access-rules': Record<string, unknown>[] };
  'nat-policy': { name: string; 'nat-rules': Record<string, unknown>[] };
  warnings: string[];
  metadata: {
    exportedAt: string;
    sourceVsys: string;
    panosVersion: string;
    ruleCount: number;
    objectCount: number;
    warningCount: number;
  };
}

function pushNetworkObjects(on: ObjectNetwork, hosts: unknown[], networks: unknown[], ranges: unknown[], warnings: string[]) {
  if (on.host) {
    hosts.push({
      type: 'host',
      name: on.name,
      'ipv4-address': on.host,
      comments: '',
    });
    return;
  }
  if (on.subnet && on.subnetMask) {
    const p = parseInt(on.subnetMask, 10);
    if (!Number.isNaN(p) && on.subnet.includes(':')) {
      warnings.push(`IPv6 network object "${on.name}" skipped — verify on Check Point.`);
      return;
    }
    if (p === 32) {
      hosts.push({ type: 'host', name: on.name, 'ipv4-address': on.subnet, comments: '' });
    } else {
      networks.push({
        type: 'network',
        name: on.name,
        subnet4: on.subnet,
        'mask-length4': p,
        comments: '',
      });
    }
    return;
  }
  if (on.range) {
    ranges.push({
      type: 'address-range',
      name: on.name,
      'ipv4-address-first': on.range.from,
      'ipv4-address-last': on.range.to,
      comments: '',
    });
    return;
  }
  if (on.fqdn) {
    hosts.push({ type: 'domain', name: on.name, fqdn: on.fqdn, comments: '' });
  }
}

function mapExplicitRule(r: ExplicitPolicyRule, index: number, warnings: string[]) {
  const name = r.name || `Rule_${index + 1}`;
  let comments = '';
  const apps = r.possibleInternetServiceNames || [];
  if (apps.length && !apps.every((a) => a.toLowerCase() === 'any')) {
    warnings.push(`[REVIEW App-ID] rule "${name}": ${apps.join(', ')}`);
    comments = `[REVIEW App-ID] `;
  }
  if (r.utmProfileRefs && Object.keys(r.utmProfileRefs).length) {
    warnings.push(`Rule "${name}": profile refs require manual Check Point setup.`);
  }

  const src = r.sourceNames.map((a) => (a.toLowerCase() === 'all' || a.toLowerCase() === 'any' ? 'Any' : a));
  const dst = r.destinationNames.map((a) => (a.toLowerCase() === 'all' || a.toLowerCase() === 'any' ? 'Any' : a));
  const services = r.serviceNames.map((s) => {
    const x = s.toLowerCase();
    if (x === 'any' || x === 'all' || x === 'application-default') return 'Any';
    return s;
  });

  const action = r.action === 'permit' ? 'Accept' : 'Drop';
  const track = r.log && r.log !== 'none' ? 'Log' : 'None';

  return {
    name,
    enabled: r.enabled,
    source: src,
    destination: dst,
    services,
    action,
    track: { type: track },
    comments: comments.trimEnd(),
    'src-zones': r.sourceInterfaceNames,
    'dst-zones': r.destinationInterfaceNames,
  };
}

/**
 * Build R8x migration JSON from parser AST (same shape as {@link parsePaloAltoXml} / FortiGate path).
 * NAT rules are omitted unless present as dedicated AST types in the future.
 */
export function buildR8xMigrationFromStatements(
  statements: ASAAstNode[],
  parseWarnings: string[] = [],
  meta: { sourceVsys?: string; panosVersion?: string } = {}
): CheckPointR8xMigrationJson {
  const warnings = [...parseWarnings];
  const hosts: unknown[] = [];
  const networks: unknown[] = [];
  const ranges: unknown[] = [];
  const groups: unknown[] = [];
  const tcp: unknown[] = [];
  const udp: unknown[] = [];
  const serviceGroups: unknown[] = [];
  const accessRules: unknown[] = [];

  for (const s of statements) {
    if (s.type === 'object-network') {
      pushNetworkObjects(s as ObjectNetwork, hosts, networks, ranges, warnings);
    } else if (s.type === 'object-group-network') {
      const g = s as ObjectGroupNetwork;
      groups.push({
        type: 'group',
        name: g.name,
        members: g.entries.filter((e) => e.type === 'object').map((e) => (e as { name: string }).name),
        comments: '',
      });
    } else if (s.type === 'object-service') {
      const os = s as ObjectService;
      if (os.proto === 'icmp') {
        warnings.push(`ICMP service "${os.name}" skipped in R8x export — map manually.`);
        continue;
      }
      const port = os.port != null ? String(os.port) : '';
      const row = {
        type: os.proto === 'tcp' ? 'service-tcp' : 'service-udp',
        name: os.name,
        port,
        'source-port': '',
        comments: '',
      };
      if (os.proto === 'tcp') tcp.push(row);
      else udp.push(row);
    } else if (s.type === 'object-group-service') {
      const g = s as ObjectGroupService;
      serviceGroups.push({
        type: 'service-group',
        name: g.name,
        members: g.entries.filter((e) => e.type === 'service-object').map((e) => (e as { name: string }).name),
        comments: '',
      });
    } else if (s.type === 'explicit-policy-rule') {
      accessRules.push(mapExplicitRule(s as ExplicitPolicyRule, accessRules.length, warnings));
    }
  }

  const objectCount =
    hosts.length + networks.length + ranges.length + groups.length + tcp.length + udp.length + serviceGroups.length;

  return {
    version: '1.0',
    objects: {
      hosts: hosts as Record<string, unknown>[],
      networks: networks as Record<string, unknown>[],
      'address-ranges': ranges as Record<string, unknown>[],
      groups: groups as Record<string, unknown>[],
      'services-tcp': tcp as Record<string, unknown>[],
      'services-udp': udp as Record<string, unknown>[],
      'service-groups': serviceGroups as Record<string, unknown>[],
    },
    'access-policy': {
      name: 'Imported_PaloAlto_Policy',
      'access-rules': accessRules as Record<string, unknown>[],
    },
    'nat-policy': {
      name: 'Imported_PaloAlto_NAT',
      'nat-rules': [],
    },
    warnings,
    metadata: {
      exportedAt: new Date().toISOString(),
      sourceVsys: meta.sourceVsys ?? '',
      panosVersion: meta.panosVersion ?? '',
      ruleCount: accessRules.length,
      objectCount,
      warningCount: warnings.length,
    },
  };
}

export function getR8xMigrationSummary(r8x: CheckPointR8xMigrationJson) {
  return {
    hosts: r8x.objects.hosts.length,
    networks: r8x.objects.networks.length,
    ranges: r8x.objects['address-ranges'].length,
    groups: r8x.objects.groups.length,
    tcpServices: r8x.objects['services-tcp'].length,
    udpServices: r8x.objects['services-udp'].length,
    serviceGroups: r8x.objects['service-groups'].length,
    accessRules: r8x['access-policy']['access-rules'].length,
    natRules: r8x['nat-policy']['nat-rules'].length,
    warnings: r8x.warnings.length,
  };
}
