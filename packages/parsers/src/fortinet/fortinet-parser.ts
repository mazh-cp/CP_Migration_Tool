import type {
  ASAAstNode,
  ASAParseResult,
  ExplicitPolicyRule,
  FortinetIppoolStatement,
  FortinetVipStatement,
  FortinetVpnPhase1Statement,
  InterfaceStatement,
  NameIfStatement,
  ObjectGroupNetwork,
  ObjectGroupService,
  ObjectNetwork,
  ObjectService,
} from '../asa/ast';

type StackConfig = { type: 'config'; indent: number; path: string };
type StackEdit = { type: 'edit'; indent: number; name: string; attrs: Record<string, string> };
type StackEntry = StackConfig | StackEdit;

/** Common FortiOS predefined services referenced in policies (custom services override by name). */
const FORTI_BUILTIN: Record<
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
  LDAP_UDP: { proto: 'udp', port: 389 },
  SMB: { proto: 'tcp', port: 445 },
  RDP: { proto: 'tcp', port: 3389 },
  PING: { proto: 'icmp' },
  ICMP: { proto: 'icmp' },
};

function lineIndent(raw: string): number {
  const m = raw.match(/^(\s*)/);
  return (m?.[1] ?? '').replace(/\t/g, '    ').length;
}

function parseEditName(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return t.slice(1, -1);
  return t;
}

/** Parse space-separated tokens; double-quoted strings may contain spaces. */
export function parseSetValues(rest: string): string[] {
  const out: string[] = [];
  let i = 0;
  const r = rest.trim();
  while (i < r.length) {
    while (i < r.length && /\s/.test(r[i]!)) i++;
    if (i >= r.length) break;
    if (r[i] === '"') {
      i++;
      let s = '';
      while (i < r.length && r[i] !== '"') {
        if (r[i] === '\\' && i + 1 < r.length) i++;
        s += r[i]!;
        i++;
      }
      if (r[i] === '"') i++;
      out.push(s);
    } else {
      let j = i;
      while (j < r.length && !/\s/.test(r[j]!)) j++;
      out.push(r.slice(i, j));
      i = j;
    }
  }
  return out;
}

function firstPortSpec(spec: string): { from: number; to: number } | { port: number } | null {
  const part = spec.trim().split(/\s+/)[0];
  if (!part) return null;
  const range = part.match(/^(\d+)-(\d+)$/);
  if (range) {
    const from = parseInt(range[1]!, 10);
    const to = parseInt(range[2]!, 10);
    if (!isNaN(from) && !isNaN(to)) return { from, to };
    return null;
  }
  const p = parseInt(part, 10);
  if (!isNaN(p)) return { port: p };
  return null;
}

export function parseFortinetConfig(content: string): ASAParseResult {
  const warnings: string[] = [];
  const statements: ASAAstNode[] = [];
  const definedServiceNames = new Set<string>();
  const referencedPolicyServices = new Set<string>();

  const lines = content.split(/\r?\n/);
  const stack: StackEntry[] = [];

  function topConfigPath(): string | undefined {
    for (let k = stack.length - 1; k >= 0; k--) {
      const e = stack[k]!;
      if (e.type === 'config') return e.path;
    }
    return undefined;
  }

  /** Inner `config` with no `edit` yet must not receive `set` lines (they belong to that subsection, not the outer edit). */
  function topEditForSet(): StackEdit | undefined {
    for (let k = stack.length - 1; k >= 0; k--) {
      const e = stack[k]!;
      if (e.type === 'edit') return e;
      if (e.type === 'config') return undefined;
    }
    return undefined;
  }

  function handleEdit(ed: StackEdit, cfgPath: string, lineNumber: number): void {
    if (cfgPath === 'firewall address') {
      const st = buildFirewallAddress(ed, lineNumber, warnings);
      if (st) statements.push(st);
      return;
    }
    if (cfgPath === 'firewall address6') {
      const st = buildFirewallAddress6(ed, lineNumber, warnings);
      if (st) statements.push(st);
      return;
    }
    if (cfgPath === 'firewall addrgrp' || cfgPath === 'firewall addrgrp6') {
      const st = buildAddrGrp(ed, lineNumber, warnings);
      if (st) statements.push(st);
      return;
    }
    if (cfgPath === 'firewall service custom') {
      const st = buildServiceCustom(ed, lineNumber, warnings);
      if (st) {
        definedServiceNames.add(normalizeKey(st.name));
        statements.push(st);
      }
      return;
    }
    if (cfgPath === 'firewall service group') {
      const st = buildServiceGroup(ed, lineNumber, warnings);
      if (st) {
        definedServiceNames.add(normalizeKey(st.name));
        statements.push(st);
      }
      return;
    }
    if (cfgPath === 'firewall policy' || cfgPath === 'firewall policy6') {
      const st = buildPolicy(ed, lineNumber, warnings, referencedPolicyServices);
      if (st) statements.push(st);
      return;
    }
    if (cfgPath === 'firewall vip') {
      const st = buildFortinetVip(ed, lineNumber);
      if (st) statements.push(st);
      return;
    }
    if (cfgPath === 'firewall ippool') {
      const st = buildFortinetIppool(ed, lineNumber, warnings);
      if (st) statements.push(st);
      return;
    }
    if (cfgPath === 'system interface') {
      const st = buildSystemInterface(ed, lineNumber);
      if (st) statements.push(st);
      return;
    }
    if (cfgPath === 'vpn ipsec phase1-interface' || cfgPath === 'vpn ipsec phase1') {
      // Only structural fields are copied out; the psksecret VALUE stays in the
      // discarded attrs map — pskConfigured is a presence flag.
      const st: FortinetVpnPhase1Statement = {
        type: 'fortinet-vpn-phase1',
        name: ed.name,
        remoteGw: ed.attrs['remote-gw'],
        iface: ed.attrs['interface'],
        proposal: ed.attrs['proposal'],
        pskConfigured: 'psksecret' in ed.attrs,
        lineNumber,
      };
      statements.push(st);
      return;
    }
  }

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!;
    const trim = raw.trim();
    if (!trim || trim.startsWith('#')) continue;

    if (trim.startsWith('config vdom')) {
      warnings.push(
        'VDOM configuration detected. Only the first vdom block is fully supported; verify rules in multi-VDOM exports.'
      );
    }

    if (trim.startsWith('config ')) {
      const path = trim.slice(7).trim();
      stack.push({ type: 'config', indent: lineIndent(raw), path });
      continue;
    }

    if (trim.startsWith('edit ')) {
      const name = parseEditName(trim.slice(5));
      stack.push({ type: 'edit', indent: lineIndent(raw), name, attrs: {} });
      continue;
    }

    if (trim.startsWith('set ')) {
      const rest = trim.slice(4);
      const sp = rest.indexOf(' ');
      const key = sp === -1 ? rest : rest.slice(0, sp);
      const val = sp === -1 ? '' : rest.slice(sp + 1).trim();
      const ed = topEditForSet();
      if (ed) ed.attrs[key] = val;
      continue;
    }

    if (trim === 'next') {
      const popped = stack.pop();
      if (popped?.type === 'edit') {
        const cfgPath = topConfigPath();
        if (cfgPath) handleEdit(popped, cfgPath, li + 1);
      }
      continue;
    }

    if (trim === 'end') {
      while (stack.length > 0 && stack[stack.length - 1]!.type === 'edit') {
        warnings.push(`Line ${li + 1}: implicit close of unterminated "edit" before "end"`);
        stack.pop();
      }
      const popped = stack.pop();
      if (popped?.type !== 'config') {
        if (popped) stack.push(popped);
        warnings.push(`Line ${li + 1}: "end" without matching "config"`);
      }
      continue;
    }
  }

  if (stack.length > 0) {
    warnings.push(`Config ended with ${stack.length} unclosed block(s); partial parse`);
  }

  injectBuiltinServices(statements, definedServiceNames, referencedPolicyServices);
  emitInterfaceZones(statements);

  return { statements, warnings };
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildFirewallAddress(
  ed: StackEdit,
  lineNumber: number,
  warnings: string[]
): ObjectNetwork | null {
  const name = ed.name;
  const type = (ed.attrs.type || 'ipmask').toLowerCase();
  const st: ObjectNetwork = { type: 'object-network', name, lineNumber };

  if (type === 'fqdn' || ed.attrs.fqdn) {
    const fqdn = ed.attrs.fqdn ? parseSetValues(ed.attrs.fqdn)[0] : '';
    if (fqdn) {
      st.fqdn = fqdn;
      return st;
    }
    warnings.push(`Address "${name}": fqdn type but no fqdn set`);
    return null;
  }

  if (type === 'iprange' || (ed.attrs['start-ip'] && ed.attrs['end-ip'])) {
    const from = ed.attrs['start-ip']?.trim();
    const to = ed.attrs['end-ip']?.trim();
    if (from && to) {
      st.range = { from, to };
      return st;
    }
    warnings.push(`Address "${name}": iprange missing start-ip/end-ip`);
    return null;
  }

  const subnetLine = ed.attrs.subnet;
  if (subnetLine) {
    const parts = parseSetValues(subnetLine);
    if (parts.length >= 2) {
      st.subnet = parts[0]!;
      st.subnetMask = parts[1]!;
      return st;
    }
    if (parts.length === 1 && parts[0]!.includes('/')) {
      const [ip, mask] = parts[0]!.split('/');
      st.subnet = ip!;
      st.subnetMask = mask!;
      return st;
    }
  }

  if (ed.attrs['subnet-segment'] || ed.attrs['wildcard'] || type === 'wildcard') {
    warnings.push(`Address "${name}": wildcard/segment type not mapped; skipped`);
    return null;
  }

  warnings.push(`Address "${name}": unsupported or incomplete definition`);
  return null;
}

/** `config firewall address6`: ipprefix (`set ip6 X::/64`) or ip6 range. */
function buildFirewallAddress6(
  ed: StackEdit,
  lineNumber: number,
  warnings: string[]
): ObjectNetwork | null {
  const name = ed.name;
  const st: ObjectNetwork = { type: 'object-network', name, lineNumber };

  const ip6 = ed.attrs.ip6 ? parseSetValues(ed.attrs.ip6)[0] : undefined;
  if (ip6) {
    if (ip6.endsWith('/128')) {
      st.host = ip6.slice(0, -4);
      return st;
    }
    // Single-token IPv6 CIDR; normalization treats prefix-joined subnets natively.
    st.subnet = ip6;
    return st;
  }
  const from = ed.attrs['start-ip']?.trim();
  const to = ed.attrs['end-ip']?.trim();
  if (from && to) {
    st.range = { from, to };
    return st;
  }
  warnings.push(`Address6 "${name}": no ip6/range recognized; skipped`);
  return null;
}

function buildAddrGrp(
  ed: StackEdit,
  lineNumber: number,
  warnings: string[]
): ObjectGroupNetwork | null {
  const memberStr = ed.attrs.member;
  if (!memberStr) {
    warnings.push(`Addrgrp "${ed.name}": no member`);
    return null;
  }
  const members = parseSetValues(memberStr);
  const entries: ObjectGroupNetwork['entries'] = members.map((m) => ({
    type: 'object' as const,
    name: m,
  }));
  return { type: 'object-group-network', name: ed.name, entries, lineNumber };
}

function buildServiceCustom(
  ed: StackEdit,
  lineNumber: number,
  warnings: string[]
): ObjectService | null {
  const name = ed.name;
  const proto = (ed.attrs.protocol || 'TCP/UDP/SCTP').toUpperCase();
  let p: 'tcp' | 'udp' | 'icmp' = 'tcp';
  if (proto.includes('UDP') && !proto.includes('TCP')) p = 'udp';
  else if (proto.includes('ICMP')) p = 'icmp';

  const tcp = ed.attrs['tcp-portrange'];
  const udp = ed.attrs['udp-portrange'];
  const portLine = p === 'udp' ? udp || tcp : tcp || udp;

  if (p === 'icmp' || !portLine) {
    const st: ObjectService = {
      type: 'object-service',
      name,
      proto: p,
      lineNumber,
    };
    return st;
  }

  const spec = firstPortSpec(portLine);
  if (!spec) {
    warnings.push(`Service "${name}": could not parse port range "${portLine}"`);
    return { type: 'object-service', name, proto: p, lineNumber };
  }
  if ('port' in spec) {
    return { type: 'object-service', name, proto: p, port: spec.port, lineNumber };
  }
  return {
    type: 'object-service',
    name,
    proto: p,
    portRange: { from: spec.from, to: spec.to },
    lineNumber,
  };
}

function buildServiceGroup(
  ed: StackEdit,
  lineNumber: number,
  warnings: string[]
): ObjectGroupService | null {
  const memberStr = ed.attrs.member;
  if (!memberStr) {
    warnings.push(`Service group "${ed.name}": no member`);
    return null;
  }
  const members = parseSetValues(memberStr);
  const entries: ObjectGroupService['entries'] = members.map((m) => ({
    type: 'service-object' as const,
    name: m,
  }));
  return { type: 'object-group-service', name: ed.name, entries, lineNumber };
}

/** Dotted non-IP names that may be Forti ISDB / internet-service objects (not in `firewall address`). */
export function extractPossibleInternetServiceNames(names: string[]): string[] {
  const ISDB_LIKE = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z][A-Za-z0-9_-]*)+$/;
  const out: string[] = [];
  for (const n of names) {
    const t = n.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (lower === 'all') continue;
    if (/^\d/.test(t)) continue;
    if (t.includes('/')) continue;
    if (ISDB_LIKE.test(t)) out.push(t);
  }
  return [...new Set(out)];
}

function extractUtmProfiles(attrs: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, raw] of Object.entries(attrs)) {
    if (!raw) continue;
    const lk = k.toLowerCase();
    const isUtm =
      lk.endsWith('-profile') ||
      lk === 'application-list' ||
      lk === 'ips-sensor' ||
      lk === 'utm-status';
    if (!isUtm) continue;
    const vals = parseSetValues(raw);
    if (vals[0]) out[k] = vals[0]!;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildFortinetVip(ed: StackEdit, lineNumber: number): FortinetVipStatement | null {
  const st: FortinetVipStatement = {
    type: 'fortinet-vip',
    name: ed.name,
    lineNumber,
  };
  if (ed.attrs.extip) st.extip = parseSetValues(ed.attrs.extip)[0];
  if (ed.attrs.mappedip) st.mappedip = parseSetValues(ed.attrs.mappedip)[0];
  if (ed.attrs.extintf) st.extintf = parseSetValues(ed.attrs.extintf)[0];
  if (ed.attrs.extport) st.extport = ed.attrs.extport.trim();
  if (ed.attrs.mappedport) st.mappedport = ed.attrs.mappedport.trim();
  return st;
}

function buildFortinetIppool(
  ed: StackEdit,
  lineNumber: number,
  warnings: string[]
): FortinetIppoolStatement | null {
  const startRaw = ed.attrs.startip || ed.attrs['start-ip'];
  const endRaw = ed.attrs.endip || ed.attrs['end-ip'];
  if (!startRaw || !endRaw) {
    warnings.push(`IP pool "${ed.name}": missing startip/endip; skipped`);
    return null;
  }
  const startip = parseSetValues(startRaw)[0];
  const endip = parseSetValues(endRaw)[0];
  if (!startip || !endip) return null;
  return { type: 'fortinet-ippool', name: ed.name, startip, endip, lineNumber };
}

function buildPolicy(
  ed: StackEdit,
  lineNumber: number,
  warnings: string[],
  referencedPolicyServices: Set<string>
): ExplicitPolicyRule | null {
  const status = (ed.attrs.status || 'enable').toLowerCase();
  const enabled = status === 'enable';

  const actionRaw = (ed.attrs.action || 'deny').toLowerCase();
  let action: ExplicitPolicyRule['action'] = 'deny';
  if (actionRaw === 'accept') action = 'permit';
  else if (actionRaw === 'deny') action = 'deny';
  else if (actionRaw === 'ipsec' || actionRaw === 'sslvpn') action = 'reject';
  else {
    warnings.push(`Policy ${ed.name}: action "${actionRaw}" normalized as deny`);
  }

  const logRaw = (ed.attrs.logtraffic || 'disable').toLowerCase();
  const log: ExplicitPolicyRule['log'] =
    logRaw === 'all' || logRaw === 'utm' ? 'log' : logRaw === 'disable' ? 'none' : 'log';

  const srcintf = ed.attrs.srcintf ? parseSetValues(ed.attrs.srcintf) : [];
  const dstintf = ed.attrs.dstintf ? parseSetValues(ed.attrs.dstintf) : [];
  const srcaddr = ed.attrs.srcaddr ? parseSetValues(ed.attrs.srcaddr) : [];
  const dstaddr = ed.attrs.dstaddr ? parseSetValues(ed.attrs.dstaddr) : [];
  const services = ed.attrs.service ? parseSetValues(ed.attrs.service) : [];

  for (const s of services) referencedPolicyServices.add(normalizeKey(s));

  const name =
    ed.attrs.name?.replace(/^"|"$/g, '') ||
    (ed.name.match(/^\d+$/) ? `policy-${ed.name}` : ed.name);

  const scheduleName = ed.attrs.schedule ? parseSetValues(ed.attrs.schedule)[0] : undefined;
  const natRaw = (ed.attrs.nat || '').trim().toLowerCase();
  const policyNatEnabled = natRaw === 'enable';
  let policyNatPoolName: string | undefined;
  if (policyNatEnabled && ed.attrs.poolname) {
    const p = parseSetValues(ed.attrs.poolname);
    if (p[0]) policyNatPoolName = p[0];
  }

  const sourceNames = srcaddr.length > 0 ? srcaddr : ['all'];
  const destinationNames = dstaddr.length > 0 ? dstaddr : ['all'];

  const identityGroupNames = ed.attrs.groups ? parseSetValues(ed.attrs.groups) : [];
  const identityUserNames = ed.attrs.users ? parseSetValues(ed.attrs.users) : [];
  const possibleInternetServiceNames = extractPossibleInternetServiceNames([...srcaddr, ...dstaddr]);

  if (!srcaddr.length && srcintf.length) {
    warnings.push(
      `Policy "${name}": no srcaddr (interfaces: ${srcintf.join(', ')}); source normalized as Any.`
    );
  }
  if (!dstaddr.length && dstintf.length) {
    warnings.push(
      `Policy "${name}": no dstaddr (interfaces: ${dstintf.join(', ')}); destination normalized as Any.`
    );
  }

  const st: ExplicitPolicyRule = {
    type: 'explicit-policy-rule',
    name,
    ruleId: ed.name.match(/^\d+$/) ? ed.name : undefined,
    enabled,
    sourceNames,
    destinationNames,
    serviceNames: services.length > 0 ? services : ['ALL'],
    action,
    log,
    lineNumber,
    scheduleName,
    sourceInterfaceNames: srcintf.length > 0 ? srcintf : undefined,
    destinationInterfaceNames: dstintf.length > 0 ? dstintf : undefined,
    utmProfileRefs: extractUtmProfiles(ed.attrs),
    policyNatEnabled: policyNatEnabled || undefined,
    policyNatPoolName,
    identityGroupNames: identityGroupNames.length > 0 ? identityGroupNames : undefined,
    identityUserNames: identityUserNames.length > 0 ? identityUserNames : undefined,
    possibleInternetServiceNames:
      possibleInternetServiceNames.length > 0 ? possibleInternetServiceNames : undefined,
  };

  return st;
}

function buildSystemInterface(ed: StackEdit, lineNumber: number): InterfaceStatement | null {
  const name = ed.name;
  const ipLine = ed.attrs.ip;
  if (!ipLine) {
    return { type: 'interface', name, lineNumber };
  }
  const parts = parseSetValues(ipLine);
  if (parts.length >= 2) {
    return {
      type: 'interface',
      name,
      ipAddress: parts[0],
      mask: parts[1],
      lineNumber,
    };
  }
  return { type: 'interface', name, lineNumber };
}

function injectBuiltinServices(
  statements: ASAAstNode[],
  defined: Set<string>,
  referenced: Set<string>
): void {
  const toAdd: ObjectService[] = [];
  for (const key of referenced) {
    const upper = key.toUpperCase();
    const builtin = FORTI_BUILTIN[upper];
    if (!builtin) continue;
    if (defined.has(key)) continue;
    if (upper === 'ALL' || upper === 'ANY') continue;

    const st: ObjectService = {
      type: 'object-service',
      name: upper,
      proto: builtin.proto,
      port: builtin.port,
      portRange: builtin.portRange,
    };
    toAdd.push(st);
    defined.add(key);
  }
  statements.unshift(...toAdd);
}

/** Link interface name to a zone of the same name so mapping UI has zone context. */
function emitInterfaceZones(statements: ASAAstNode[]): void {
  const ifaceNames = new Set<string>();
  for (const st of statements) {
    if (st.type === 'interface') ifaceNames.add((st as InterfaceStatement).name);
  }
  const existingZones = new Set(
    statements
      .filter((s) => s.type === 'nameif')
      .map((s) => (s as NameIfStatement).zoneName.toLowerCase())
  );
  for (const name of ifaceNames) {
    if (existingZones.has(name.toLowerCase())) continue;
    const z: NameIfStatement = {
      type: 'nameif',
      interfaceName: name,
      zoneName: name,
    };
    statements.push(z);
  }
}
