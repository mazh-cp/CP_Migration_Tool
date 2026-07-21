import type {
  ASAAstNode,
  ASAParseResult,
  ObjectNetwork,
  ObjectGroupNetwork,
  ObjectService,
  ObjectGroupService,
  AccessListExtended,
  NatStatement,
  InterfaceStatement,
  NameIfStatement,
  IpLocalPoolStatement,
  GroupPolicyStatement,
  TunnelGroupStatement,
  CryptoMapStatement,
  RouteStatement,
  DynamicRoutingStatement,
  HaStatement,
  InspectionStatement,
} from './ast';

export function parseASA(content: string): ASAParseResult {
  const warnings: string[] = [];
  const statements: ASAAstNode[] = [];
  const lines = content.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('!')) {
      i++;
      continue;
    }

    try {
      const result = parseLine(lines, i, trimmed);
      if (result.statement) {
        statements.push(result.statement);
      }
      if (result.consumed > 0) {
        i += result.consumed;
      } else {
        i++;
      }
    } catch (err) {
      warnings.push(`Line ${i + 1}: Unsupported or parse error - ${trimmed.substring(0, 60)}...`);
      i++;
    }
  }

  return { statements, warnings };
}

interface ParseLineResult {
  statement?: ASAAstNode;
  consumed: number;
}

function parseLine(lines: string[], startIdx: number, line: string): ParseLineResult {
  const parts = line.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd === 'object' && parts[1]?.toLowerCase() === 'network') {
    const { obj, consumed } = parseObjectNetwork(lines, startIdx);
    if (obj) return { statement: obj, consumed };
  }
  if (cmd === 'object' && parts[1]?.toLowerCase() === 'service') {
    const { obj, consumed } = parseObjectService(lines, startIdx);
    if (obj) return { statement: obj, consumed };
  }
  if (cmd === 'object-group' && parts[1]?.toLowerCase() === 'network') {
    const { obj, consumed } = parseObjectGroupNetwork(lines, startIdx);
    if (obj) return { statement: obj, consumed };
  }
  if (cmd === 'object-group' && parts[1]?.toLowerCase() === 'service') {
    const { obj, consumed } = parseObjectGroupService(lines, startIdx);
    if (obj) return { statement: obj, consumed };
  }
  if (cmd === 'access-list' && parts[2]?.toLowerCase() === 'remark') {
    return { consumed: 1 };
  }
  if (cmd === 'access-list' && parts[2]?.toLowerCase() === 'extended') {
    const obj = parseAccessListExtended(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
  }
  if (cmd === 'access-list' && parts[2]?.toLowerCase() === 'advanced') {
    const obj = parseAccessListAdvanced(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
    return { consumed: 1 };
  }
  if (cmd === 'nat') {
    const obj = parseNat(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
  }
  if (cmd === 'interface') {
    const obj = parseInterface(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
  }
  if (cmd === 'nameif') {
    const obj = parseNameIf(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
  }
  if (cmd === 'ip' && parts[1]?.toLowerCase() === 'local' && parts[2]?.toLowerCase() === 'pool') {
    const obj = parseIpLocalPool(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
  }
  if (cmd === 'group-policy') {
    return parseGroupPolicy(lines, startIdx);
  }
  if (cmd === 'tunnel-group') {
    return parseTunnelGroup(lines, startIdx);
  }
  if (cmd === 'crypto' && parts[1]?.toLowerCase() === 'map') {
    const obj = parseCryptoMap(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
    return { consumed: 1 };
  }
  if (cmd === 'route') {
    const obj = parseRoute(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
  }
  if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'route') {
    const obj = parseIpv6Route(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
  }
  if (cmd === 'router') {
    return parseDynamicRouting(lines, startIdx);
  }
  if (cmd === 'failover') {
    return {
      statement: {
        type: 'ha-config',
        detail: maskSecretTokens(line),
        raw: maskSecretTokens(line),
        lineNumber: startIdx + 1,
      } as HaStatement,
      consumed: 1,
    };
  }
  if (cmd === 'policy-map') {
    return parsePolicyMapInspection(lines, startIdx);
  }
  if (cmd === 'threat-detection') {
    return {
      statement: {
        type: 'inspection',
        source: 'threat-detection',
        inspects: [line.trim()],
        raw: line,
        lineNumber: startIdx + 1,
      } as InspectionStatement,
      consumed: 1,
    };
  }

  throw new Error('Unsupported');
}

/**
 * Capture `inspect <proto>` lines from a policy-map block as inspection review
 * notes. The block is consumed either way; a statement is emitted only when at
 * least one inspect line is present (police / set-connection-only maps are noise).
 */
function parsePolicyMapInspection(lines: string[], startIdx: number): ParseLineResult {
  const first = lines[startIdx];
  const m = first.match(/policy-map\s+(?:type\s+\S+\s+)?(\S+)/i);
  const bodyCount = countIndentedBlockLines(lines, startIdx);
  if (!m) return { consumed: 1 + bodyCount };

  const inspects: string[] = [];
  for (let i = startIdx + 1; i <= startIdx + bodyCount; i++) {
    const t = lines[i].trim();
    const im = t.match(/^inspect\s+(\S+)/i);
    if (im) inspects.push(im[1].toLowerCase());
  }
  if (inspects.length === 0) return { consumed: 1 + bodyCount };
  return {
    statement: {
      type: 'inspection',
      source: 'policy-map',
      name: m[1],
      inspects,
      raw: first,
      lineNumber: startIdx + 1,
    } as InspectionStatement,
    consumed: 1 + bodyCount,
  };
}

function parseRoute(line: string, ln: number): RouteStatement | null {
  // route IFNAME dest mask nexthop [metric] [track N]
  const m = line.match(/route\s+(\S+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)(?:\s+(\d+))?/i);
  if (!m) return null;
  return {
    type: 'route',
    ifName: m[1],
    dest: m[2],
    mask: m[3],
    nextHop: m[4],
    metric: m[5] ? parseInt(m[5], 10) : undefined,
    raw: line,
    lineNumber: ln,
  };
}

function parseIpv6Route(line: string, ln: number): RouteStatement | null {
  // ipv6 route IFNAME dest/prefix nexthop [metric]
  const m = line.match(/ipv6\s+route\s+(\S+)\s+([0-9a-f:]+\/\d{1,3})\s+([0-9a-f:]+)(?:\s+(\d+))?/i);
  if (!m) return null;
  // dest already carries the prefix; mask field stores the prefix length.
  const [dest, prefix] = m[2].split('/');
  return {
    type: 'route',
    ifName: m[1],
    dest,
    mask: prefix ?? '128',
    nextHop: m[3],
    metric: m[4] ? parseInt(m[4], 10) : undefined,
    raw: line,
    lineNumber: ln,
  };
}

/**
 * Mask credential tokens (BGP neighbor passwords, OSPF authentication /
 * message-digest keys, failover keys) before capture — the secret value is
 * never stored, mirroring the tunnel-group `pskConfigured` approach. Kept
 * local because @cisco2cp/core (which owns redactSecrets) depends on this
 * package.
 */
function maskSecretTokens(line: string): string {
  return line
    .replace(/\b(pass(?:word|wd)(?:\s+\d+)?\s+)\S+/gi, '$1***')
    .replace(/\b(authentication-key(?:\s+\d+)?\s+)\S+/gi, '$1***')
    .replace(/\b(message-digest-key\s+\d+\s+md5\s+)\S+/gi, '$1***')
    // `pre-shared-key [0|8] X` — covers ASA failover-link IPsec (`failover ipsec
    // pre-shared-key …`) and tunnel-group ikev1/ikev2 forms.
    .replace(/\b(pre-shared-key(?:\s+[08])?\s+)\S+/gi, '$1***')
    // `failover key [hexadecimal|0|8] X` — level digit must not be mistaken for the key.
    .replace(/\b(failover\s+key\s+(?:hexadecimal\s+|[08]\s+)?)\S+/gi, '$1***');
}

function parseDynamicRouting(lines: string[], startIdx: number): ParseLineResult {
  const first = lines[startIdx];
  const m = first.match(/router\s+(ospf|bgp|eigrp|rip)\s*(\S+)?/i);
  if (!m) return { consumed: 1 };
  const obj: DynamicRoutingStatement = {
    type: 'dynamic-routing',
    protocol: m[1].toLowerCase() as DynamicRoutingStatement['protocol'],
    processOrAs: m[2],
    details: [],
    raw: first,
    lineNumber: startIdx + 1,
  };
  const bodyCount = countIndentedBlockLines(lines, startIdx);
  for (let i = startIdx + 1; i <= startIdx + bodyCount; i++) {
    const t = lines[i].trim();
    if (/^(network|neighbor|router-id|redistribute|area|passive-interface|autonomous-system)\b/i.test(t)) {
      obj.details.push(maskSecretTokens(t));
    }
  }
  return { statement: obj, consumed: 1 + bodyCount };
}

/** Number of following lines that are indented attributes of a block command. */
function countIndentedBlockLines(lines: string[], startIdx: number): number {
  let i = startIdx + 1;
  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === '') break;
    // ASA indents sub-commands under group-policy / tunnel-group.
    if (!/^\s/.test(raw)) break;
    i++;
  }
  return i - (startIdx + 1);
}

function parseIpLocalPool(line: string, ln: number): IpLocalPoolStatement | null {
  const m = line.match(/ip\s+local\s+pool\s+(\S+)\s+(\S+)(?:\s+mask\s+(\S+))?/i);
  if (!m) return null;
  return { type: 'ip-local-pool', name: m[1], range: m[2], mask: m[3], raw: line, lineNumber: ln };
}

function parseGroupPolicy(lines: string[], startIdx: number): ParseLineResult {
  const first = lines[startIdx];
  const m = first.match(/group-policy\s+(\S+)\s+(internal|attributes|external)/i);
  if (!m) return { consumed: 1 };
  const obj: GroupPolicyStatement = {
    type: 'group-policy',
    name: m[1],
    raw: first,
    lineNumber: startIdx + 1,
  };
  const bodyCount = countIndentedBlockLines(lines, startIdx);
  for (let i = startIdx + 1; i <= startIdx + bodyCount; i++) {
    const t = lines[i].trim();
    if (/^vpn-tunnel-protocol\s+/i.test(t)) {
      obj.vpnTunnelProtocol = t.replace(/^vpn-tunnel-protocol\s+/i, '').split(/\s+/);
    } else if (/^split-tunnel-network-list\s+/i.test(t)) {
      const v = t.match(/value\s+(\S+)/i);
      if (v) obj.splitTunnelList = v[1];
    }
  }
  return { statement: obj, consumed: 1 + bodyCount };
}

function parseTunnelGroup(lines: string[], startIdx: number): ParseLineResult {
  const first = lines[startIdx];
  const nameMatch = first.match(/tunnel-group\s+(\S+)\s+/i);
  if (!nameMatch) return { consumed: 1 };
  const name = nameMatch[1];

  const typeMatch = first.match(/tunnel-group\s+\S+\s+type\s+(remote-access|ipsec-l2l)/i);
  // The `type` line has no indented body; attributes live in separate blocks.
  if (typeMatch) {
    return {
      statement: {
        type: 'tunnel-group',
        name,
        tunnelType: typeMatch[1].toLowerCase().includes('remote') ? 'remote-access' : 'ipsec-l2l',
        raw: first,
        lineNumber: startIdx + 1,
      },
      consumed: 1,
    };
  }

  // `tunnel-group NAME general-attributes | ipsec-attributes | webvpn-attributes` block.
  const attrMatch = first.match(/tunnel-group\s+\S+\s+(general-attributes|ipsec-attributes|webvpn-attributes)/i);
  if (!attrMatch) return { consumed: 1 };
  const bodyCount = countIndentedBlockLines(lines, startIdx);
  const obj: TunnelGroupStatement = { type: 'tunnel-group', name, raw: first, lineNumber: startIdx + 1 };
  let hasField = false;
  for (let i = startIdx + 1; i <= startIdx + bodyCount; i++) {
    const t = lines[i].trim();
    if (/^address-pool\s+/i.test(t)) {
      obj.addressPool = t.replace(/^address-pool\s+/i, '').trim();
      hasField = true;
    } else if (/^default-group-policy\s+/i.test(t)) {
      obj.defaultGroupPolicy = t.replace(/^default-group-policy\s+/i, '').trim();
      hasField = true;
    } else if (/pre-shared-key|ikev1 pre-shared-key|ikev2 (local|remote)-authentication pre-shared-key/i.test(t)) {
      obj.pskConfigured = true;
      hasField = true;
    }
  }
  // Emit a fragment only if it carried a field we care about; still consume the block.
  return hasField ? { statement: obj, consumed: 1 + bodyCount } : { consumed: 1 + bodyCount };
}

function parseCryptoMap(line: string, ln: number): CryptoMapStatement | null {
  const seqMatch = line.match(/crypto\s+map\s+(\S+)\s+(\d+)\s+match\s+address\s+(\S+)/i);
  if (seqMatch)
    return { type: 'crypto-map', name: seqMatch[1], seq: parseInt(seqMatch[2], 10), matchAcl: seqMatch[3], raw: line, lineNumber: ln };
  const peerMatch = line.match(/crypto\s+map\s+(\S+)\s+(\d+)\s+set\s+peer\s+(\S+)/i);
  if (peerMatch)
    return { type: 'crypto-map', name: peerMatch[1], seq: parseInt(peerMatch[2], 10), peer: peerMatch[3], raw: line, lineNumber: ln };
  const ifaceMatch = line.match(/crypto\s+map\s+(\S+)\s+interface\s+(\S+)/i);
  if (ifaceMatch)
    return { type: 'crypto-map', name: ifaceMatch[1], seq: 0, ifaceName: ifaceMatch[2], raw: line, lineNumber: ln };
  return null;
}

function parseObjectNetwork(lines: string[], startIdx: number): { obj: ObjectNetwork | null; consumed: number } {
  const line = lines[startIdx];
  const m = line.match(/object\s+network\s+(\S+)(?:\s+(?:host|subnet|range|fqdn)\s+.+)?/i);
  if (!m) return { obj: null, consumed: 1 };
  const name = m[1];
  const obj: ObjectNetwork = { type: 'object-network', name, raw: line, lineNumber: startIdx + 1 };

  // Same-line: object network NAME host/subnet/range/fqdn ...
  const sameLine = line.match(/object\s+network\s+\S+\s+(?:host\s+(\S+)|subnet\s+(\S+)\s+(\S+)|range\s+(\S+)\s+(\S+)|fqdn\s+(.+))/i);
  if (sameLine) {
    if (sameLine[1]) obj.host = sameLine[1];
    else if (sameLine[2] && sameLine[3]) { obj.subnet = sameLine[2]; obj.subnetMask = sameLine[3]; }
    else if (sameLine[4] && sameLine[5]) obj.range = { from: sameLine[4], to: sameLine[5] };
    else if (sameLine[6]) obj.fqdn = sameLine[6].trim();
    return { obj, consumed: 1 };
  }

  // Multi-line: next line has " host X" or " subnet X Y" etc.
  const nextLine = lines[startIdx + 1]?.trim() || '';
  const nextMatch = nextLine.match(/^(host|subnet|range|fqdn)\s+(.+)/i);
  if (nextMatch) {
    const [, kw, rest] = nextMatch;
    if (kw?.toLowerCase() === 'host') obj.host = rest.trim().split(/\s+/)[0];
    else if (kw?.toLowerCase() === 'subnet') {
      const p = rest.trim().split(/\s+/);
      if (p[0]) obj.subnet = p[0];
      if (p[1]) obj.subnetMask = p[1];
    } else if (kw?.toLowerCase() === 'range') {
      const p = rest.trim().split(/\s+/);
      if (p[0] && p[1]) obj.range = { from: p[0], to: p[1] };
    } else if (kw?.toLowerCase() === 'fqdn') obj.fqdn = rest.trim();
    return { obj, consumed: 2 };
  }
  return { obj, consumed: 1 };
}

function parseObjectService(lines: string[], startIdx: number): { obj: ObjectService | null; consumed: number } {
  const line = lines[startIdx];
  const nameMatch = line.match(/object\s+service\s+(\S+)/i);
  if (!nameMatch) return { obj: null, consumed: 1 };
  const name = nameMatch[1];

  // Same-line: object service NAME service-object tcp eq 80
  const sameLine = line.match(/object\s+service\s+\S+\s+(?:service-object\s+)?(tcp|udp|icmp)\s+(?:destination\s+)?(?:eq\s+)?(\d+)(?:\s+(\d+))?/i);
  if (sameLine) {
    const proto = sameLine[1].toLowerCase() as 'tcp' | 'udp' | 'icmp';
    const port1 = parseInt(sameLine[2], 10);
    const port2 = sameLine[3] ? parseInt(sameLine[3], 10) : undefined;
    return {
      obj: {
        type: 'object-service',
        name,
        proto,
        port: port2 ? undefined : port1,
        portRange: port2 ? { from: port1, to: port2 } : undefined,
        raw: line,
        lineNumber: startIdx + 1,
      },
      consumed: 1,
    };
  }

  // Multi-line: next line " service tcp destination eq 80"
  const nextLine = lines[startIdx + 1]?.trim() || '';
  const nextMatch = nextLine.match(/(?:service-object\s+)?(tcp|udp|icmp)\s+(?:destination\s+)?(?:eq\s+)?(\d+)(?:\s+(\d+))?/i);
  if (nextMatch) {
    const proto = nextMatch[1].toLowerCase() as 'tcp' | 'udp' | 'icmp';
    const port1 = parseInt(nextMatch[2], 10);
    const port2 = nextMatch[3] ? parseInt(nextMatch[3], 10) : undefined;
    return {
      obj: {
        type: 'object-service',
        name,
        proto,
        port: port2 ? undefined : port1,
        portRange: port2 ? { from: port1, to: port2 } : undefined,
        raw: line + '\n' + nextLine,
        lineNumber: startIdx + 1,
      },
      consumed: 2,
    };
  }
  return { obj: null, consumed: 1 };
}

function parseObjectGroupNetwork(lines: string[], startIdx: number): {
  obj: ObjectGroupNetwork | null;
  consumed: number;
} {
  const first = lines[startIdx];
  const m = first.match(/object-group\s+network\s+(\S+)/i);
  if (!m) return { obj: null, consumed: 1 };

  const entries: ObjectGroupNetwork['entries'] = [];
  let i = startIdx + 1;

  while (i < lines.length) {
    const l = lines[i].trim();
    if (!l || l.startsWith('!') || l.startsWith('object-group') || l.startsWith('object ')) break;

    const p = l.split(/\s+/);
    if (p[0] === 'network-object') {
      if (p[1] === 'host' && p[2]) {
        entries.push({ type: 'host', host: p[2], name: p[3] });
      } else if (p[1] === 'object' && p[2]) {
        entries.push({ type: 'object', name: p[2] });
      } else if (p[1] && p[2]) {
        entries.push({ type: 'network', subnet: p[1], mask: p[2] });
      }
    } else if (p[0] === 'group-object' && p[1]) {
      entries.push({ type: 'object', name: p[1] });
    } else if (p[0] === 'range' && p[1] && p[2]) {
      entries.push({ type: 'range', from: p[1], to: p[2] });
    } else {
      break;
    }
    i++;
  }

  return {
    obj: { type: 'object-group-network', name: m[1], entries, raw: first, lineNumber: startIdx + 1 },
    consumed: i - startIdx,
  };
}

function parseObjectGroupService(lines: string[], startIdx: number): {
  obj: ObjectGroupService | null;
  consumed: number;
} {
  const first = lines[startIdx];
  const m = first.match(/object-group\s+service\s+(\S+)(?:\s+(tcp|udp))?/i);
  if (!m) return { obj: null, consumed: 1 };

  const entries: ObjectGroupService['entries'] = [];
  let i = startIdx + 1;

  while (i < lines.length) {
    const l = lines[i].trim();
    if (!l || l.startsWith('!') || l.startsWith('object-group') || l.startsWith('object ')) break;

    const p = l.split(/\s+/);
    if (p[0] === 'port-object') {
      const groupProto = (m[2]?.toLowerCase() || 'tcp') as 'tcp' | 'udp';
      let proto: 'tcp' | 'udp' = groupProto;
      let port: number | undefined;
      let range: { from: number; to: number } | undefined;
      if (p[1] === 'eq' && p[2]) {
        port = parseInt(p[2], 10);
      } else if (p[1] === 'range' && p[2] && p[3]) {
        range = { from: parseInt(p[2], 10), to: parseInt(p[3], 10) };
      } else if ((p[1]?.toLowerCase() === 'tcp' || p[1]?.toLowerCase() === 'udp') && p[2] === 'eq' && p[3]) {
        proto = p[1].toLowerCase() as 'tcp' | 'udp';
        port = parseInt(p[3], 10);
      } else if ((p[1]?.toLowerCase() === 'tcp' || p[1]?.toLowerCase() === 'udp') && p[2] === 'range' && p[3] && p[4]) {
        proto = p[1].toLowerCase() as 'tcp' | 'udp';
        range = { from: parseInt(p[3], 10), to: parseInt(p[4], 10) };
      }
      if (port != null || range) {
        entries.push({ type: 'port-object', proto, port, range });
      }
    } else if (p[0] === 'service-object' && p[1]) {
      entries.push({ type: 'service-object', name: p[1] });
    } else if (p[0] === 'group-object' && p[1]) {
      entries.push({ type: 'group-object', name: p[1] });
    } else {
      break;
    }
    i++;
  }

  return {
    obj: { type: 'object-group-service', name: m[1], entries, raw: first, lineNumber: startIdx + 1 },
    consumed: i - startIdx,
  };
}

function parseAccessListExtended(line: string, ln: number): AccessListExtended | null {
  const m = line.match(
    /access-list\s+(\S+)\s+extended\s+(permit|deny)\s+(\S+)\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(eq|gt|lt|neq|range)\s+(\S+)(?:\s+(\S+))?)?\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(eq|gt|lt|neq|range)\s+(\S+)(?:\s+(\S+))?)?/i
  );
  if (!m) return null;

  const action = m[2].toLowerCase() as 'permit' | 'deny';
  const proto = m[3];
  const src = m[4];
  const srcWildcard = m[5];
  const dst = m[10] || m[8];
  const dstWildcard = m[11] || m[9];

  // Extract destination port (eq 80, range 80 443) - last port spec in line is typically dst
  let dstPort: string | undefined;
  const rangeMatches = [...line.matchAll(/range\s+(\d+)\s+(\d+)/gi)];
  const eqMatches = [...line.matchAll(/(?:eq|gt|lt|neq)\s+(\d+)/gi)];
  if (rangeMatches.length > 0) {
    const last = rangeMatches[rangeMatches.length - 1];
    dstPort = `${last[1]}-${last[2]}`;
  } else if (eqMatches.length > 0) {
    dstPort = eqMatches[eqMatches.length - 1][1];
  }

  return {
    type: 'access-list-extended',
    name: m[1],
    action,
    proto,
    src,
    srcWildcard,
    dst,
    dstWildcard,
    dstPort,
    raw: line,
    lineNumber: ln,
  };
}

/**
 * FTD / FMC-managed devices often emit `access-list ... advanced ...` instead of `extended`.
 * Produces the same AST shape as extended ACEs where possible.
 */
function parseAccessListAdvanced(line: string, ln: number): AccessListExtended | null {
  let work = line.trim();
  work = work.replace(/\s+rule-id\s+\d+.*$/i, '').replace(/\s+event-log\b.*$/i, '').trim();

  const head = work.match(/^access-list\s+(\S+)\s+advanced\s+(permit|deny|trust)\s+(\S+)\s+(.+)$/i);
  if (!head) return null;

  const aclName = head[1];
  const actionVerb = head[2].toLowerCase();
  const action: AccessListExtended['action'] = actionVerb === 'deny' ? 'deny' : 'permit';
  const proto = head[3];
  let rest = head[4].trim();
  if (!rest) return null;

  const ruleIdMatch = line.match(/\brule-id\s+(\d+)/i);
  const ruleName = ruleIdMatch ? `${aclName}#${ruleIdMatch[1]}` : `${aclName}#L${ln}`;

  let dstPort: string | undefined;
  const rangeMatches = [...line.matchAll(/\brange\s+(\S+)\s+(\S+)/gi)];
  const eqMatches = [...line.matchAll(/\b(?:eq|gt|lt|neq)\s+(\S+)/gi)];
  if (rangeMatches.length > 0) {
    const last = rangeMatches[rangeMatches.length - 1];
    dstPort = `${last[1]}-${last[2]}`;
  } else if (eqMatches.length > 0) {
    dstPort = eqMatches[eqMatches.length - 1][1];
  }

  const stripPortClauses = (s: string) =>
    s
      .replace(/\s+(?:eq|gt|lt|neq)\s+\S+/gi, '')
      .replace(/\s+range\s+\S+\s+\S+/gi, '')
      .trim();

  const body = stripPortClauses(rest);
  let src = 'any';
  let dst = 'any';

  const ifcParts = body.split(/\s+ifc\s+/i);
  if (ifcParts.length >= 3) {
    src = `ifc ${ifcParts[1]?.trim() || ''}`.trim();
    dst = `ifc ${ifcParts[2]?.trim() || ''}`.trim();
  } else if (ifcParts.length === 2) {
    const left = ifcParts[0].trim();
    const right = ifcParts[1].trim();
    src = left.length > 0 ? left : 'any';
    dst = `ifc ${right}`;
  } else {
    const og2 = body.match(/^object-group\s+(\S+)\s+object-group\s+(\S+)$/i);
    if (og2) {
      src = `object-group ${og2[1]}`;
      dst = `object-group ${og2[2]}`;
    } else if (/^any\s+any$/i.test(body)) {
      src = 'any';
      dst = 'any';
    } else {
      const ob2 = body.match(/^object\s+(\S+)\s+object\s+(\S+)$/i);
      if (ob2) {
        src = `object ${ob2[1]}`;
        dst = `object ${ob2[2]}`;
      } else {
        src = body.length > 0 ? body : 'any';
        dst = 'any';
      }
    }
  }

  return {
    type: 'access-list-extended',
    name: ruleName,
    action,
    proto,
    src,
    dst,
    dstPort,
    raw: line,
    lineNumber: ln,
  };
}

function parseNat(line: string, ln: number): NatStatement | null {
  const m = line.match(
    /nat\s+\((\S+)\)\s+\((\S+)\)\s+(\d+)\s+(?:(\d+)\s+)?(\S+)\s+(\S+)(?:\s+static\s+(\S+)(?:\s+(\S+))?)?/i
  );
  if (!m) {
    const m2 = line.match(/nat\s+\((\S+)\)\s+(\S+)\s+(\S+)\s+interface/i);
    if (m2) {
      return {
        type: 'nat',
        insideInterface: m2[1],
        src: m2[2],
        pat: true,
        raw: line,
        lineNumber: ln,
      };
    }
    return null;
  }
  return {
    type: 'nat',
    insideInterface: m[1],
    outsideInterface: m[2],
    src: m[5],
    dst: m[6],
    static: line.toLowerCase().includes('static'),
    translatedSrc: m[7],
    translatedDst: m[8],
    raw: line,
    lineNumber: ln,
  };
}

function parseInterface(line: string, ln: number): InterfaceStatement | null {
  const m = line.match(/interface\s+(\S+)(?:\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+))?(?:\s+(\d+))?/i);
  if (!m) return null;
  const name = m[1];
  const obj: InterfaceStatement = { type: 'interface', name, raw: line, lineNumber: ln };
  if (m[2]) obj.ipAddress = m[2];
  if (m[3]) obj.mask = m[3];
  if (m[4]) obj.securityLevel = parseInt(m[4], 10);
  return obj;
}

function parseNameIf(line: string, ln: number): NameIfStatement | null {
  const m = line.match(/nameif\s+(\S+)/i);
  if (!m) return null;
  return { type: 'nameif', interfaceName: '', zoneName: m[1], raw: line, lineNumber: ln };
}
