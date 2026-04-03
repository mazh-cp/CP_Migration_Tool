/**
 * FortiManager CMDB / JSON-RPC export → same AST shape as FortiGate CLI (normalizeAsa).
 * Accepts bundled JSON from API pulls or saved files (multiple shapes).
 */
import type {
  ASAAstNode,
  ASAParseResult,
  ExplicitPolicyRule,
  ObjectGroupNetwork,
  ObjectGroupService,
  ObjectNetwork,
  ObjectService,
} from '../asa/ast';
import { extractPossibleInternetServiceNames, parseSetValues } from './fortinet-parser';

const BUILTIN: Record<
  string,
  { proto: 'tcp' | 'udp' | 'icmp'; port?: number; portRange?: { from: number; to: number } }
> = {
  ALL: { proto: 'tcp' },
  ANY: { proto: 'tcp' },
  HTTP: { proto: 'tcp', port: 80 },
  HTTPS: { proto: 'tcp', port: 443 },
  DNS: { proto: 'udp', port: 53 },
  SSH: { proto: 'tcp', port: 22 },
  TELNET: { proto: 'tcp', port: 23 },
  FTP: { proto: 'tcp', port: 21 },
  SMTP: { proto: 'tcp', port: 25 },
  NTP: { proto: 'udp', port: 123 },
  SNMP: { proto: 'udp', port: 161 },
  LDAP: { proto: 'tcp', port: 389 },
  SMB: { proto: 'tcp', port: 445 },
  RDP: { proto: 'tcp', port: 3389 },
  PING: { proto: 'icmp' },
  ICMP: { proto: 'icmp' },
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Extract display names from FMG refs: [{name:"x"}], ["x"], "x", or q_origin_key. */
function refNames(val: unknown): string[] {
  if (val == null) return [];
  if (typeof val === 'string') return val.trim() ? [val.trim()] : [];
  if (Array.isArray(val)) {
    const out: string[] = [];
    for (const item of val) {
      if (typeof item === 'string' && item.trim()) out.push(item.trim());
      else if (isRecord(item)) {
        const n = item.name ?? item.q_origin_key;
        if (typeof n === 'string' && n.trim()) out.push(n.trim());
      }
    }
    return out;
  }
  if (isRecord(val)) {
    const n = val.name ?? val.q_origin_key;
    if (typeof n === 'string' && n.trim()) return [n.trim()];
  }
  return [];
}

function parseSubnetField(subnet: unknown): { ip: string; mask: string } | null {
  if (typeof subnet === 'string') {
    const parts = parseSetValues(subnet);
    if (parts.length >= 2) return { ip: parts[0]!, mask: parts[1]! };
    if (parts.length === 1 && parts[0]!.includes('/')) {
      const [ip, m] = parts[0]!.split('/');
      if (ip && m) return { ip, mask: m };
    }
  }
  if (Array.isArray(subnet) && subnet.length >= 2) {
    return { ip: String(subnet[0]), mask: String(subnet[1]) };
  }
  return null;
}

function collectPolicyObjects(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) {
    if (Array.isArray(raw.results)) return raw.results;
    if (Array.isArray(raw.result)) return raw.result;
    const policy = raw.policy;
    if (isRecord(policy)) return Object.values(policy);
    const vals = Object.values(raw);
    if (vals.length > 0 && vals.every((v) => isRecord(v))) {
      return vals;
    }
    return vals.flatMap((v) => (Array.isArray(v) ? v : []));
  }
  return [];
}

function mapAction(
  action: unknown,
  warnings: string[],
  ctx: string
): ExplicitPolicyRule['action'] {
  if (action === 1 || action === '1' || action === 'accept') return 'permit';
  if (action === 0 || action === '0' || action === 'deny') return 'deny';
  if (action === 'ipsec' || action === 'sslvpn') return 'reject';
  const s = String(action ?? '').toLowerCase();
  if (s === 'accept') return 'permit';
  if (s === 'deny') return 'deny';
  warnings.push(`FortiManager policy ${ctx}: unknown action "${String(action)}", using deny`);
  return 'deny';
}

function mapLog(logtraffic: unknown): ExplicitPolicyRule['log'] {
  const s = String(logtraffic ?? 'disable').toLowerCase();
  if (s === 'all' || s === 'utm') return 'log';
  if (s === 'disable') return 'none';
  return 'log';
}

function extractUtmFromPolicy(p: Record<string, unknown>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    const lk = k.toLowerCase();
    const isUtm =
      lk.endsWith('-profile') ||
      lk === 'application-list' ||
      lk === 'ips-sensor' ||
      lk === 'utm-status';
    if (!isUtm) continue;
    const names = refNames(v);
    if (names[0]) out[k] = names[0]!;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function addressToObjectNetwork(obj: Record<string, unknown>, line: number, warnings: string[]): ObjectNetwork | null {
  const name = String(obj.name ?? obj.q_origin_key ?? '').trim();
  if (!name) return null;
  const type = String(obj.type ?? 'ipmask').toLowerCase();
  const st: ObjectNetwork = { type: 'object-network', name, lineNumber: line };

  if (type === 'fqdn' || obj.fqdn) {
    const fqdn = typeof obj.fqdn === 'string' ? obj.fqdn : '';
    if (fqdn) {
      st.fqdn = fqdn;
      return st;
    }
    return null;
  }
  if (type === 'iprange' || (obj['start-ip'] && obj['end-ip'])) {
    const from = String(obj['start-ip'] ?? '').trim();
    const to = String(obj['end-ip'] ?? '').trim();
    if (from && to) {
      st.range = { from, to };
      return st;
    }
    return null;
  }
  const sub = parseSubnetField(obj.subnet);
  if (sub) {
    st.subnet = sub.ip;
    st.subnetMask = sub.mask;
    return st;
  }
  warnings.push(`FortiManager address "${name}": skipped (unsupported shape)`);
  return null;
}

function serviceToObjectService(obj: Record<string, unknown>, line: number, warnings: string[]): ObjectService | null {
  const name = String(obj.name ?? obj.q_origin_key ?? '').trim();
  if (!name) return null;
  const protoRaw = String(obj.protocol ?? 'TCP/UDP/SCTP').toUpperCase();
  let p: 'tcp' | 'udp' | 'icmp' = 'tcp';
  if (protoRaw.includes('UDP') && !protoRaw.includes('TCP')) p = 'udp';
  else if (protoRaw.includes('ICMP')) p = 'icmp';

  const tcp = obj['tcp-portrange'];
  const udp = obj['udp-portrange'];
  const portLine = (p === 'udp' ? udp : tcp) ?? tcp ?? udp;
  const portStr = typeof portLine === 'string' ? portLine : String(portLine ?? '');

  if (p === 'icmp' || !portStr) {
    return { type: 'object-service', name, proto: p, lineNumber: line };
  }
  const part = portStr.trim().split(/\s+/)[0] ?? '';
  const range = part.match(/^(\d+)-(\d+)$/);
  if (range) {
    const from = parseInt(range[1]!, 10);
    const to = parseInt(range[2]!, 10);
    if (!isNaN(from) && !isNaN(to)) {
      return { type: 'object-service', name, proto: p, portRange: { from, to }, lineNumber: line };
    }
  }
  const port = parseInt(part, 10);
  if (!isNaN(port)) {
    return { type: 'object-service', name, proto: p, port, lineNumber: line };
  }
  warnings.push(`FortiManager service "${name}": could not parse ports`);
  return { type: 'object-service', name, proto: p, lineNumber: line };
}

function injectBuiltins(statements: ASAAstNode[], defined: Set<string>, referenced: Set<string>): void {
  const toAdd: ObjectService[] = [];
  for (const key of referenced) {
    const upper = key.toUpperCase();
    const builtin = BUILTIN[upper];
    if (!builtin) continue;
    if (defined.has(key)) continue;
    if (upper === 'ALL' || upper === 'ANY') continue;
    toAdd.push({
      type: 'object-service',
      name: upper,
      proto: builtin.proto,
      port: builtin.port,
      portRange: builtin.portRange,
    });
    defined.add(key);
  }
  statements.unshift(...toAdd);
}

export interface FortiManagerBundleInput {
  /** Raw policy list or CMDB subtree */
  policy?: unknown;
  address?: unknown;
  addrgrp?: unknown;
  addresses?: unknown;
  /** firewall/address style */
  'firewall/address'?: unknown;
  'firewall/addrgrp'?: unknown;
  'firewall/service/custom'?: unknown;
  'firewall/service/group'?: unknown;
  serviceCustom?: unknown;
  serviceGroup?: unknown;
  /** Full JSON-RPC style wrapper */
  result?: unknown;
  [key: string]: unknown;
}

/**
 * Parse FortiManager export: bundled object from live API helper or hand-built JSON.
 */
export function parseFortiManagerExport(input: string | FortiManagerBundleInput | Record<string, unknown>): ASAParseResult {
  const warnings: string[] = [];
  let root: Record<string, unknown>;
  try {
    root = typeof input === 'string' ? (JSON.parse(input) as Record<string, unknown>) : (input as Record<string, unknown>);
  } catch {
    return { statements: [], warnings: ['Invalid JSON for FortiManager import'] };
  }

  if (isRecord(root.result) && !root.policy && !root.address) {
    root = root.result as Record<string, unknown>;
  }

  const addrSrc =
    root.address ??
    root.addresses ??
    root['firewall/address'] ??
    (isRecord(root.obj) ? (root.obj as Record<string, unknown>)['firewall/address'] : undefined);

  const grpSrc =
    root.addrgrp ?? root['firewall/addrgrp'] ?? (isRecord(root.obj) ? (root.obj as Record<string, unknown>)['firewall/addrgrp'] : undefined);

  const svcSrc =
    root.serviceCustom ??
    root['firewall/service/custom'] ??
    (isRecord(root.obj) ? (root.obj as Record<string, unknown>)['firewall/service/custom'] : undefined);

  const svcGrpSrc =
    root.serviceGroup ??
    root['firewall/service/group'] ??
    (isRecord(root.obj) ? (root.obj as Record<string, unknown>)['firewall/service/group'] : undefined);

  const polSrc =
    root.policy ??
    root.policies ??
    (isRecord(root.pkg) ? (root.pkg as Record<string, unknown>).policy : undefined) ??
    (isRecord(root.firewall) ? (root.firewall as Record<string, unknown>).policy : undefined);

  const statements: ASAAstNode[] = [];
  const definedServiceNames = new Set<string>();
  const referencedPolicyServices = new Set<string>();

  const addressList = collectPolicyObjects(addrSrc);
  let line = 1;
  for (const a of addressList) {
    if (!isRecord(a)) continue;
    const st = addressToObjectNetwork(a, line++, warnings);
    if (st) statements.push(st);
  }

  const grpList = collectPolicyObjects(grpSrc);
  for (const g of grpList) {
    if (!isRecord(g)) continue;
    const name = String(g.name ?? g.q_origin_key ?? '').trim();
    const members = refNames(g.member);
    if (!name || members.length === 0) continue;
    const entries: ObjectGroupNetwork['entries'] = members.map((m) => ({ type: 'object' as const, name: m }));
    statements.push({ type: 'object-group-network', name, entries, lineNumber: line++ });
  }

  const svcList = collectPolicyObjects(svcSrc);
  for (const s of svcList) {
    if (!isRecord(s)) continue;
    const st = serviceToObjectService(s, line++, warnings);
    if (st) {
      definedServiceNames.add(normalizeKey(st.name));
      statements.push(st);
    }
  }

  const svcGrpList = collectPolicyObjects(svcGrpSrc);
  for (const g of svcGrpList) {
    if (!isRecord(g)) continue;
    const name = String(g.name ?? g.q_origin_key ?? '').trim();
    const members = refNames(g.member);
    if (!name || members.length === 0) continue;
    const entries: ObjectGroupService['entries'] = members.map((m) => ({
      type: 'service-object' as const,
      name: m,
    }));
    definedServiceNames.add(normalizeKey(name));
    statements.push({ type: 'object-group-service', name, entries, lineNumber: line++ });
  }

  const policies = collectPolicyObjects(polSrc);
  let pi = 0;
  for (const p of policies) {
    if (!isRecord(p)) continue;
    pi++;
    const policyid = p.policyid ?? p['policy-id'] ?? pi;
    const ruleId = String(policyid);
    const nameRaw = p.name ?? p['policy-name'];
    const name =
      typeof nameRaw === 'string' && nameRaw.trim()
        ? nameRaw.trim()
        : `policy-${ruleId}`;

    const status = String(p.status ?? 'enable').toLowerCase();
    const enabled = status === 'enable';

    const srcaddr = refNames(p.srcaddr);
    const dstaddr = refNames(p.dstaddr);
    const services = refNames(p.service);
    for (const s of services) referencedPolicyServices.add(normalizeKey(s));

    const srcintf = refNames(p.srcintf);
    const dstintf = refNames(p.dstintf);

    const sourceNames = srcaddr.length > 0 ? srcaddr : ['all'];
    const destinationNames = dstaddr.length > 0 ? dstaddr : ['all'];

    if (!srcaddr.length && srcintf.length) {
      warnings.push(
        `FortiManager policy "${name}": no srcaddr; interfaces ${srcintf.join(', ')} — source as Any`
      );
    }
    if (!dstaddr.length && dstintf.length) {
      warnings.push(
        `FortiManager policy "${name}": no dstaddr; interfaces ${dstintf.join(', ')} — destination as Any`
      );
    }

    const scheduleRaw = p.schedule ?? p['schedule-name'];
    let scheduleName: string | undefined;
    if (typeof scheduleRaw === 'string' && scheduleRaw.trim()) {
      scheduleName = scheduleRaw.trim();
    } else {
      const sn = refNames(scheduleRaw);
      if (sn[0]) scheduleName = sn[0];
    }

    const natRaw = String(p.nat ?? '').toLowerCase();
    const natEn = p.nat === 1 || p.nat === '1' || natRaw === 'enable';
    let policyNatPoolName: string | undefined;
    if (natEn) {
      const pn = refNames(p.poolname ?? p.ippool);
      if (pn[0]) policyNatPoolName = pn[0];
    }

    const identityGroupNames = refNames(p.groups);
    const identityUserNames = refNames(p.users);
    const possibleInternetServiceNames = extractPossibleInternetServiceNames([
      ...sourceNames,
      ...destinationNames,
    ]);

    const explicit: ExplicitPolicyRule = {
      type: 'explicit-policy-rule',
      name,
      ruleId,
      enabled,
      sourceNames,
      destinationNames,
      serviceNames: services.length > 0 ? services : ['ALL'],
      action: mapAction(p.action, warnings, name),
      log: mapLog(p.logtraffic),
      lineNumber: line++,
      scheduleName,
      sourceInterfaceNames: srcintf.length > 0 ? srcintf : undefined,
      destinationInterfaceNames: dstintf.length > 0 ? dstintf : undefined,
      utmProfileRefs: extractUtmFromPolicy(p),
      policyNatEnabled: natEn || undefined,
      policyNatPoolName,
      identityGroupNames: identityGroupNames.length > 0 ? identityGroupNames : undefined,
      identityUserNames: identityUserNames.length > 0 ? identityUserNames : undefined,
      possibleInternetServiceNames:
        possibleInternetServiceNames.length > 0 ? possibleInternetServiceNames : undefined,
    };
    statements.push(explicit);
  }

  if (policies.length === 0) {
    warnings.push(
      'FortiManager import: no firewall policies found. Expected keys like policy, pkg.policy, or firewall.policy in JSON.'
    );
  }

  injectBuiltins(statements, definedServiceNames, referencedPolicyServices);
  return { statements, warnings };
}
