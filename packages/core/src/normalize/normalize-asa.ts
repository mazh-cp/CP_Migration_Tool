import type {
  NormalizedObject,
  NormalizedPolicyRule,
  NormalizedNATRule,
  NormalizedInterface,
  NormalizedZone,
  NormalizedResult,
} from '../models/normalized';
import type {
  ASAAstNode,
  ObjectNetwork,
  ObjectGroupNetwork,
  ObjectService,
  ObjectGroupService,
  AccessListExtended,
  NatStatement,
  InterfaceStatement,
  NameIfStatement,
  ExplicitPolicyRule,
  FortinetVipStatement,
  FortinetIppoolStatement,
} from '@cisco2cp/parsers';
import { createId } from '../utils/id';
import {
  ObjectRegistry,
  ANY_NET_ID,
  ANY_SVC_ID,
  createServiceKey,
} from '../registry/ObjectRegistry';

const registry = new ObjectRegistry();

function maskToCidr(mask: string): number {
  if (mask.includes('/')) return parseInt(mask.split('/')[1] || '32', 10);
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
  return cidr;
}

export function normalizeAsa(statements: ASAAstNode[]): NormalizedResult {
  registry.clear();

  const objects: NormalizedObject[] = [];
  const rules: NormalizedPolicyRule[] = [];
  const nat: NormalizedNATRule[] = [];
  const interfaces: NormalizedInterface[] = [];
  const zones: NormalizedZone[] = [];
  const warnings: string[] = [];
  let natOrder = 0;

  for (const st of statements) {
    if (st.type === 'object-network') {
      normalizeObjectNetwork(st as ObjectNetwork);
    } else if (st.type === 'object-group-network') {
      normalizeObjectGroupNetwork(st as ObjectGroupNetwork, warnings);
    } else if (st.type === 'object-service') {
      normalizeObjectService(st as ObjectService);
    } else if (st.type === 'object-group-service') {
      normalizeObjectGroupService(st as ObjectGroupService, warnings);
    } else if (st.type === 'access-list-extended') {
      const rule = normalizeAccessList(st as AccessListExtended);
      if (rule) rules.push(rule);
    } else if (st.type === 'nat') {
      const n = normalizeNat(st as NatStatement);
      if (n) {
        n.order = natOrder++;
        nat.push(n);
      }
    } else if (st.type === 'fortinet-vip') {
      const n = normalizeFortinetVip(st as FortinetVipStatement, warnings);
      if (n) {
        n.order = natOrder++;
        nat.push(n);
      }
    } else if (st.type === 'fortinet-ippool') {
      const n = normalizeFortinetIppool(st as FortinetIppoolStatement);
      if (n) {
        n.order = natOrder++;
        nat.push(n);
      }
    } else if (st.type === 'interface') {
      const iface = normalizeInterface(st as InterfaceStatement);
      if (iface) interfaces.push(iface);
    } else if (st.type === 'nameif') {
      const zone = normalizeNameIf(st as NameIfStatement);
      if (zone) zones.push(zone);
    } else if (st.type === 'explicit-policy-rule') {
      const rule = normalizeExplicitPolicyRule(st as ExplicitPolicyRule, warnings);
      if (rule) rules.push(rule);
    }
  }

  // Objects come from registry (deterministic, deduped)
  objects.push(...registry.listAll());

  return { objects, rules, nat, interfaces, zones, warnings };
}

/** Strip `object-group NAME` / `object NAME` so registry resolves by group/object id. */
function unwrapAceNetworkRef(ref: string): string {
  const t = ref.trim();
  const og = t.match(/^object-group\s+(\S+)$/i);
  if (og?.[1]) return og[1];
  const ob = t.match(/^object\s+(\S+)$/i);
  if (ob?.[1]) return ob[1];
  return t;
}

function resolveNetworkRef(ref: string): string {
  const key = unwrapAceNetworkRef(ref);
  const id = registry.resolveByName(key);
  if (id) return id;
  // Inline host/subnet in rule - create placeholder via registry (e.g. "host 1.2.3.4" or object name not yet seen)
  // For unknown refs we must not create random IDs - create placeholder network
  const nameKey = `net:name:${key.toLowerCase().replace(/\s+/g, ' ').trim()}`;
  return registry.createOrGetNetworkObject(nameKey, {
    type: 'host',
    name: key,
    value: key.includes('.') ? key : '0.0.0.0',
  });
}

function resolveServiceRef(ref: string): string | undefined {
  return registry.resolveByName(ref);
}

function normalizeObjectNetwork(st: ObjectNetwork): void {
  if (st.host) {
    registry.createOrGetNetworkObject(`net:host:${st.host}`, {
      type: 'host',
      name: st.name,
      value: st.host,
      sourceLine: st.lineNumber,
    });
  } else if (st.subnet && st.subnetMask) {
    const maskNum = st.subnetMask.includes('.')
      ? maskToCidr(st.subnetMask)
      : parseInt(st.subnetMask, 10);
    const cidr = `${st.subnet}/${maskNum}`;
    registry.createOrGetNetworkObject(`net:subnet:${cidr}`, {
      type: 'network',
      name: st.name,
      value: cidr,
      sourceLine: st.lineNumber,
    });
  } else if (st.range?.from && st.range?.to) {
    registry.createOrGetNetworkObject(
      `net:range:${st.range.from}-${st.range.to}`,
      {
        type: 'range',
        name: st.name,
        values: [st.range.from, st.range.to],
        sourceLine: st.lineNumber,
      }
    );
  } else if (st.fqdn) {
    registry.createOrGetNetworkObject(`net:fqdn:${st.fqdn}`, {
      type: 'fqdn',
      name: st.name,
      value: st.fqdn,
      sourceLine: st.lineNumber,
    });
  }
}

function normalizeObjectGroupNetwork(st: ObjectGroupNetwork, warnings: string[]): void {
  const members: string[] = [];

  for (const e of st.entries) {
    if (e.type === 'object') {
      const id = registry.resolveByName(e.name);
      if (id) members.push(id);
      else warnings.push(`Object group ${st.name}: unknown object reference ${e.name}`);
    } else if (e.type === 'host' && e.host) {
      const id = registry.createOrGetNetworkObject(`net:host:${e.host}`, {
        type: 'host',
        name: e.name || e.host,
        value: e.host,
      });
      members.push(id);
    } else if (e.type === 'network' && e.subnet) {
      const cidr = e.mask
        ? `${e.subnet}/${e.mask.includes('.') ? maskToCidr(e.mask) : e.mask}`
        : e.subnet.includes('/')
          ? e.subnet
          : `${e.subnet}/32`;
      const id = registry.createOrGetNetworkObject(`net:subnet:${cidr}`, {
        type: 'network',
        name: e.name || e.subnet,
        value: cidr,
      });
      members.push(id);
    } else if (e.type === 'range' && e.from && e.to) {
      const id = registry.createOrGetNetworkObject(
        `net:range:${e.from}-${e.to}`,
        {
          type: 'range',
          name: `${e.from}-${e.to}`,
          values: [e.from, e.to],
        }
      );
      members.push(id);
    }
  }

  registry.createOrGetGroupObject(`grp:network:${st.name}`, {
    type: 'group',
    name: st.name,
    members,
    sourceLine: st.lineNumber,
  });
}

function normalizeObjectService(st: ObjectService): void {
  const key = createServiceKey(st.proto, st.port, st.portRange);
  registry.createOrGetServiceObject(key, {
    name: st.name,
    proto: st.proto,
    port: st.port,
    portRange: st.portRange,
    sourceLine: st.lineNumber,
  });
}

function normalizeObjectGroupService(st: ObjectGroupService, warnings: string[]): void {
  const members: string[] = [];
  const proto = st.entries[0]?.type === 'port-object' ? st.entries[0].proto : 'tcp';

  for (const e of st.entries) {
    if (e.type === 'service-object') {
      const id = registry.resolveByName(e.name);
      if (id) members.push(id);
      else warnings.push(`Service group ${st.name}: unknown service reference ${e.name}`);
    } else if (e.type === 'port-object') {
      const key = createServiceKey(e.proto, e.port, e.range);
      const name = e.port
        ? `${e.proto}-${e.port}`
        : `${e.proto}-${e.range?.from}-${e.range?.to}`;
      const id = registry.createOrGetServiceObject(key, {
        name,
        proto: e.proto,
        port: e.port,
        portRange: e.range,
      });
      members.push(id);
    } else if ('type' in e && e.type === 'group-object') {
      const id = registry.resolveByName((e as { name: string }).name);
      if (id) members.push(id);
    }
  }

  registry.createOrGetGroupObject(`grp:service:${st.name}`, {
    type: 'service-group',
    name: st.name,
    members,
    proto,
    sourceLine: st.lineNumber,
  });
}

function resolveServiceFromAccessList(st: AccessListExtended): string[] {
  const p = (st.proto || 'ip').toLowerCase();
  if (p === 'ip') return [ANY_SVC_ID];

  const portSpec = st.dstPort || st.srcPort;
  if (!portSpec) return [ANY_SVC_ID];

  const str = String(portSpec);
  const rangeMatch = str.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[1], 10);
    const to = parseInt(rangeMatch[2], 10);
    if (!isNaN(from) && !isNaN(to)) {
      const key = createServiceKey(p, undefined, { from, to });
      const id = registry.createOrGetServiceObject(key, {
        name: `${p}-${from}-${to}`,
        proto: p as 'tcp' | 'udp',
        portRange: { from, to },
      });
      return [id];
    }
  }
  const port = parseInt(str, 10);
  if (!isNaN(port)) {
    const key = createServiceKey(p, port);
    const id = registry.createOrGetServiceObject(key, {
      name: `${p}-${port}`,
      proto: p as 'tcp' | 'udp',
      port,
    });
    return [id];
  }
  return [ANY_SVC_ID];
}

function normalizeExplicitPolicyRule(
  st: ExplicitPolicyRule,
  warnings: string[]
): NormalizedPolicyRule | null {
  const srcRefs = resolveExplicitNetList(st.sourceNames, warnings, 'source');
  const dstRefs = resolveExplicitNetList(st.destinationNames, warnings, 'destination');
  const serviceRefs = resolveExplicitServiceList(st.serviceNames, warnings);

  const commentParts: string[] = [];
  if (st.utmProfileRefs && Object.keys(st.utmProfileRefs).length > 0) {
    commentParts.push(
      `Forti UTM: ${Object.entries(st.utmProfileRefs)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')}`
    );
  }
  if (!st.enabled) {
    commentParts.push('Imported disabled (FortiOS status)');
  }
  if (st.policyNatEnabled) {
    commentParts.push(
      st.policyNatPoolName
        ? `Forti policy NAT; pool: ${st.policyNatPoolName}`
        : 'Forti policy NAT enabled'
    );
  }
  if (st.identityGroupNames?.length || st.identityUserNames?.length) {
    commentParts.push(
      `Forti identity: groups=${(st.identityGroupNames ?? []).join(',') || '—'}; users=${(st.identityUserNames ?? []).join(',') || '—'}`
    );
  }
  if (st.possibleInternetServiceNames?.length) {
    commentParts.push(`Possible ISDB refs: ${st.possibleInternetServiceNames.join(', ')}`);
  }

  return {
    id: createId(),
    name: st.name,
    ruleId: st.ruleId,
    enabled: st.enabled,
    sourceRefs: srcRefs,
    destinationRefs: dstRefs,
    serviceRefs,
    action: st.action === 'permit' ? 'allow' : st.action === 'reject' ? 'reject' : 'deny',
    log: st.log,
    scheduleName: st.scheduleName,
    sourceInterfaceNames:
      st.sourceInterfaceNames && st.sourceInterfaceNames.length > 0
        ? st.sourceInterfaceNames
        : undefined,
    destinationInterfaceNames:
      st.destinationInterfaceNames && st.destinationInterfaceNames.length > 0
        ? st.destinationInterfaceNames
        : undefined,
    utmProfileRefs:
      st.utmProfileRefs && Object.keys(st.utmProfileRefs).length > 0 ? st.utmProfileRefs : undefined,
    policyNatEnabled: st.policyNatEnabled,
    policyNatPoolName: st.policyNatPoolName,
    identityGroupNames:
      st.identityGroupNames && st.identityGroupNames.length > 0 ? st.identityGroupNames : undefined,
    identityUserNames:
      st.identityUserNames && st.identityUserNames.length > 0 ? st.identityUserNames : undefined,
    possibleInternetServiceNames:
      st.possibleInternetServiceNames && st.possibleInternetServiceNames.length > 0
        ? st.possibleInternetServiceNames
        : undefined,
    comments: commentParts.length > 0 ? commentParts.join(' | ') : undefined,
    sourceLines: st.lineNumber ? [st.lineNumber] : undefined,
  };
}

function resolveExplicitNetList(
  names: string[],
  warnings: string[],
  role: string
): string[] {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    warnings.push(`Policy ${role}: empty address list; using Any`);
    return [ANY_NET_ID];
  }
  if (trimmed.some((n) => n.toLowerCase() === 'all')) {
    return [ANY_NET_ID];
  }
  return trimmed.map((n) => resolveNetworkRef(n));
}

function resolveExplicitServiceList(names: string[], warnings: string[]): string[] {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    warnings.push('Policy: empty service list; using Any');
    return [ANY_SVC_ID];
  }
  if (trimmed.some((n) => n.toLowerCase() === 'all')) {
    return [ANY_SVC_ID];
  }
  const ids: string[] = [];
  for (const n of trimmed) {
    const id = resolveServiceRef(n);
    if (id) ids.push(id);
    else {
      warnings.push(`Policy: unknown service "${n}"; using Any`);
      ids.push(ANY_SVC_ID);
    }
  }
  return ids;
}

function normalizeAccessList(st: AccessListExtended): NormalizedPolicyRule | null {
  const id = createId();
  const srcKey = st.src?.trim() || '';
  const dstKey = st.dst?.trim() || '';
  const srcRefs =
    !srcKey || srcKey.toLowerCase() === 'any'
      ? [ANY_NET_ID]
      : [resolveNetworkRef(srcKey)];
  const dstRefs =
    !dstKey || dstKey.toLowerCase() === 'any'
      ? [ANY_NET_ID]
      : [resolveNetworkRef(dstKey)];
  const serviceRefs = resolveServiceFromAccessList(st);

  return {
    id,
    name: st.name,
    enabled: true,
    sourceRefs: srcRefs,
    destinationRefs: dstRefs,
    serviceRefs,
    action: st.action === 'permit' ? 'allow' : 'deny',
    log: 'log',
    sourceLines: st.lineNumber ? [st.lineNumber] : undefined,
  };
}

function normalizeNat(st: NatStatement): NormalizedNATRule | null {
  const id = createId();
  const type = st.static ? 'static' : st.pat ? 'pat' : 'dynamic';
  return {
    id,
    type,
    originalSrc: st.src,
    translatedSrc: st.translatedSrc,
    translatedDst: st.translatedDst,
    interfaceRef: st.insideInterface,
    order: 0,
    sourceLines: st.lineNumber ? [st.lineNumber] : undefined,
  };
}

function normalizeFortinetVip(st: FortinetVipStatement, warnings: string[]): NormalizedNATRule | null {
  const extip = st.extip?.trim();
  const mappedip = st.mappedip?.trim();
  if (!extip && !mappedip) {
    warnings.push(`Forti VIP "${st.name}": missing extip/mappedip; skipped`);
    return null;
  }
  const extp = st.extport?.trim();
  const mapp = st.mappedport?.trim();
  let originalSvc: string | undefined;
  let translatedSvc: string | undefined;
  if (extp) {
    const n = parseInt(extp, 10);
    originalSvc = !isNaN(n) ? `tcp/${n}` : extp;
  }
  if (mapp) {
    const n = parseInt(mapp, 10);
    translatedSvc = !isNaN(n) ? `tcp/${n}` : mapp;
  }
  return {
    id: createId(),
    type: 'static',
    originalDst: extip || undefined,
    translatedDst: mappedip || undefined,
    originalSvc,
    translatedSvc,
    interfaceRef: st.extintf?.trim() || undefined,
    order: 0,
    sourceLines: st.lineNumber ? [st.lineNumber] : undefined,
  };
}

function normalizeFortinetIppool(st: FortinetIppoolStatement): NormalizedNATRule | null {
  const start = st.startip?.trim();
  const end = st.endip?.trim();
  if (!start || !end) return null;
  const poolLabel = start === end ? start : `${start}-${end}`;
  return {
    id: createId(),
    type: 'hide',
    translatedSrc: poolLabel,
    order: 0,
    sourceLines: st.lineNumber ? [st.lineNumber] : undefined,
  };
}

function normalizeInterface(st: InterfaceStatement): NormalizedInterface | null {
  const id = createId();
  return {
    id,
    name: st.name,
    ip: st.ipAddress,
    mask: st.mask,
    securityLevel: st.securityLevel,
  };
}

function normalizeNameIf(st: NameIfStatement): NormalizedZone | null {
  const id = createId();
  return { id, name: st.zoneName };
}
