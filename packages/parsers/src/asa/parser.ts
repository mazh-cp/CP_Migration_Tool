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
  if (cmd === 'access-list' && parts[2]?.toLowerCase() === 'extended') {
    const obj = parseAccessListExtended(line, startIdx + 1);
    if (obj) return { statement: obj, consumed: 1 };
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

  throw new Error('Unsupported');
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
