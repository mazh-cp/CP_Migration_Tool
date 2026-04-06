import type {
  ASAAstNode,
  ExplicitPolicyRule,
  ObjectGroupNetwork,
  ObjectGroupService,
  ObjectNetwork,
} from '../asa/ast';
import type { ASAParseResult } from '../asa/ast';

type RuleAgg = {
  from: string[];
  to: string[];
  source: string[];
  destination: string[];
  application: string[];
  service: string[];
  action?: string;
  disabled?: boolean;
};

type AddrParts = { ipNetmask?: string; fqdn?: string; range?: { from: string; to: string } };

function qualify(scope: string, name: string): string {
  if (scope === 'default' || !scope) return name;
  return `${scope}/${name}`;
}

function parseScopedLine(line: string): { scope: string; rest: string } | null {
  const trimmed = line.replace(/^set\s+/i, '').trim();
  if (!trimmed) return null;
  let rest = trimmed;
  let scope = 'default';
  const dg = rest.match(/^device-group\s+(\S+)\s+(.+)$/i);
  if (dg) {
    scope = `dg:${dg[1]}`;
    rest = dg[2].trim();
  } else {
    const vs = rest.match(/^vsys\s+(\S+)\s+(.+)$/i);
    if (vs) {
      scope = `vsys:${vs[1]}`;
      rest = vs[2].trim();
    } else if (/^shared\s+/i.test(rest)) {
      scope = 'shared';
      rest = rest.replace(/^shared\s+/i, '').trim();
    }
  }
  return { scope, rest };
}

function parseBracketList(s: string): string[] {
  const t = s.trim();
  if (t.startsWith('[') && t.endsWith(']')) {
    return t
      .slice(1, -1)
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return t ? [t] : [];
}

/**
 * Best-effort parser for PAN-OS **set**-format configuration (e.g. `show config running` as set commands).
 * Not all CLI permutations are covered; prefer full **XML export** when possible.
 */
export function parsePaloAltoSetConfig(text: string): ASAParseResult {
  const warnings: string[] = [];
  const statements: ASAAstNode[] = [];

  const addresses = new Map<string, AddrParts>();
  const addrGroups = new Map<string, Set<string>>();
  const services = new Map<string, { proto: 'tcp' | 'udp'; port: number }>();
  const svcGroups = new Map<string, Set<string>>();
  const rules = new Map<string, RuleAgg>();

  const ruleKey = (scope: string, name: string) => `${scope}\0${name}`;

  const getRule = (scope: string, name: string): RuleAgg => {
    const k = ruleKey(scope, name);
    let r = rules.get(k);
    if (!r) {
      r = { from: [], to: [], source: [], destination: [], application: [], service: [] };
      rules.set(k, r);
    }
    return r;
  };

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (!/^set\s+/i.test(line)) continue;

    const scoped = parseScopedLine(line);
    if (!scoped) continue;
    const { scope, rest } = scoped;

    let m = rest.match(/^address\s+(\S+)\s+(.+)$/i);
    if (m) {
      const name = qualify(scope, m[1]);
      const tail = m[2].trim();
      const parts = addresses.get(name) ?? {};
      const im = tail.match(/^ip-netmask\s+(\S+)/i);
      if (im) parts.ipNetmask = im[1];
      const fq = tail.match(/^fqdn\s+(\S+)/i);
      if (fq) parts.fqdn = fq[1];
      const ir = tail.match(/^ip-range\s+(\S+)\s+(\S+)/i);
      if (ir) parts.range = { from: ir[1], to: ir[2] };
      addresses.set(name, parts);
      continue;
    }

    m = rest.match(/^address-group\s+(\S+)\s+static\s+member\s+(.+)$/i);
    if (m) {
      const gname = qualify(scope, m[1]);
      const mem = parseBracketList(m[2]).map((x) => qualify(scope, x));
      let set = addrGroups.get(gname);
      if (!set) {
        set = new Set();
        addrGroups.set(gname, set);
      }
      for (const x of mem) set.add(x);
      continue;
    }

    m = rest.match(/^service\s+(\S+)\s+protocol\s+tcp\s+port\s+(\d+)/i);
    if (m) {
      services.set(qualify(scope, m[1]), { proto: 'tcp', port: parseInt(m[2], 10) });
      continue;
    }
    m = rest.match(/^service\s+(\S+)\s+protocol\s+udp\s+port\s+(\d+)/i);
    if (m) {
      services.set(qualify(scope, m[1]), { proto: 'udp', port: parseInt(m[2], 10) });
      continue;
    }

    m = rest.match(/^service-group\s+(\S+)\s+members\s+(.+)$/i);
    if (m) {
      const gname = qualify(scope, m[1]);
      const mem = parseBracketList(m[2]).map((x) => qualify(scope, x));
      let set = svcGroups.get(gname);
      if (!set) {
        set = new Set();
        svcGroups.set(gname, set);
      }
      for (const x of mem) set.add(x);
      continue;
    }

    m = rest.match(/^rulebase security rules\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i);
    if (m) {
      const ruleName = m[1];
      const key = m[2].toLowerCase();
      const val = (m[3] || '').trim();
      const r = getRule(scope, ruleName);
      if (key === 'from') {
        for (const z of parseBracketList(val)) r.from.push(z);
      } else if (key === 'to') {
        for (const z of parseBracketList(val)) r.to.push(z);
      } else if (key === 'source') {
        for (const z of parseBracketList(val)) r.source.push(qualify(scope, z));
      } else if (key === 'destination') {
        for (const z of parseBracketList(val)) r.destination.push(qualify(scope, z));
      } else if (key === 'application') {
        for (const z of parseBracketList(val)) r.application.push(z);
      } else if (key === 'service') {
        for (const z of parseBracketList(val)) r.service.push(qualify(scope, z));
      } else if (key === 'action') {
        r.action = val.split(/\s+/)[0]?.toLowerCase();
      } else if (key === 'disabled') {
        r.disabled = val.toLowerCase() === 'yes';
      }
    }
  }

  for (const [name, parts] of addresses) {
    let on: ObjectNetwork | null = null;
    if (parts.ipNetmask) {
      const ipnm = parts.ipNetmask;
      if (ipnm.includes('/')) {
        const [addr, pref] = ipnm.split('/');
        const p = parseInt(pref || '32', 10);
        if (p === 32 && addr) on = { type: 'object-network', name, host: addr };
        else if (addr && !Number.isNaN(p)) on = { type: 'object-network', name, subnet: addr, subnetMask: String(p) };
      } else {
        on = { type: 'object-network', name, host: ipnm };
      }
    } else if (parts.fqdn) {
      on = { type: 'object-network', name, fqdn: parts.fqdn };
    } else if (parts.range) {
      on = { type: 'object-network', name, range: parts.range };
    }
    if (on) statements.push(on);
    else if (parts.ipNetmask || parts.fqdn || parts.range) {
      warnings.push(`Palo Alto set-format address "${name}": could not map; skipped.`);
    }
  }

  for (const [gname, set] of addrGroups) {
    const mems = [...set];
    if (mems.length === 0) {
      warnings.push(`Palo Alto set-format address-group "${gname}": no members; skipped.`);
      continue;
    }
    const entries: ObjectGroupNetwork['entries'] = mems.map((x) => ({ type: 'object', name: x }));
    statements.push({ type: 'object-group-network', name: gname, entries });
  }

  for (const [name, s] of services) {
    statements.push({ type: 'object-service', name, proto: s.proto, port: s.port });
  }

  for (const [gname, set] of svcGroups) {
    const mems = [...set];
    if (mems.length === 0) continue;
    const entries: ObjectGroupService['entries'] = mems.map((x) => ({ type: 'service-object', name: x }));
    statements.push({ type: 'object-group-service', name: gname, entries });
  }

  const mapAction = (a: string | undefined): ExplicitPolicyRule['action'] => {
    const x = (a || '').toLowerCase();
    if (x === 'allow') return 'permit';
    if (x === 'reset-client' || x === 'reset-server' || x === 'reset-both') return 'reject';
    return 'deny';
  };

  const normList = (xs: string[]) => xs.map((n) => (n.toLowerCase() === 'any' ? 'all' : n));

  for (const [k, r] of rules) {
    const [sc, ruleName] = k.split('\0');
    const qn = sc === 'default' ? ruleName : `${sc}/${ruleName}`;
    const src = normList(r.source.length ? r.source : ['any']);
    const dst = normList(r.destination.length ? r.destination : ['any']);
    const apps = r.application.length ? r.application : ['any'];
    const rawSvc = r.service;
    const onlyAppDefault =
      rawSvc.length > 0 && rawSvc.every((s) => s.split('/').pop()!.toLowerCase() === 'application-default');
    const svcs = onlyAppDefault
      ? (['all'] as string[])
      : normList(rawSvc.length ? rawSvc : ['application-default']);

    const explicit: ExplicitPolicyRule = {
      type: 'explicit-policy-rule',
      name: qn,
      ruleId: qn,
      enabled: !r.disabled,
      sourceNames: src,
      destinationNames: dst,
      serviceNames: svcs.length ? svcs : ['all'],
      action: mapAction(r.action),
      log: 'none',
      sourceInterfaceNames: r.from.length ? r.from : undefined,
      destinationInterfaceNames: r.to.length ? r.to : undefined,
      possibleInternetServiceNames:
        apps.length && !apps.every((a) => a.toLowerCase() === 'any') ? apps : undefined,
    };
    statements.push(explicit);

    if (apps.some((a) => a.toLowerCase() !== 'any' && a.toLowerCase() !== 'none')) {
      warnings.push(
        `Palo Alto set-format rule "${qn}": App-ID (${apps.join(', ')}) — verify Check Point Application Control mapping.`
      );
    }
  }

  if (statements.length === 0) {
    warnings.push(
      'Palo Alto set-format: no address, service, or security rules parsed — check vsys/device-group prefixes and syntax.'
    );
  } else {
    warnings.push(
      'Palo Alto set-format coverage is best-effort; validate against an XML export for completeness (NAT, profiles, groups).'
    );
  }

  return { statements, warnings };
}
