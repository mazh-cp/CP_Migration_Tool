import type {
  ASAAstNode,
  InterfaceStatement,
  ObjectGroupNetwork,
  ObjectGroupService,
  ObjectNetwork,
  ObjectService,
  ExplicitPolicyRule,
} from '../asa/ast';
import type { ASAParseResult } from '../asa/ast';
import { preparePaloAltoInput } from './input-normalize';
import { parsePaloAltoSetConfig } from './parse-paloalto-set';
import {
  ensureArray,
  entryName,
  extractConfigRoot,
  memberTexts,
  parsePanosXmlString,
} from './xml';

function panMemberList(container: Record<string, unknown> | undefined, key: string): string[] {
  if (!container) return [];
  const block = container[key] as Record<string, unknown> | undefined;
  if (!block) return [];
  return memberTexts(block.member);
}

function addressEntryToObjectNetwork(name: string, body: Record<string, unknown>): ObjectNetwork | null {
  const ipnm = body['ip-netmask'];
  if (typeof ipnm === 'string' && ipnm.includes('/')) {
    const [addr, pref] = ipnm.split('/');
    const p = parseInt(pref || '32', 10);
    if (p === 32 && addr) return { type: 'object-network', name, host: addr };
    if (addr && !Number.isNaN(p)) {
      return { type: 'object-network', name, subnet: addr, subnetMask: String(p) };
    }
  }
  const range = body['ip-range'] as Record<string, unknown> | undefined;
  if (range) {
    const from = typeof range['from'] === 'string' ? range['from'] : undefined;
    const to = typeof range['to'] === 'string' ? range['to'] : undefined;
    if (from && to) return { type: 'object-network', name, range: { from, to } };
  }
  const fqdn = body.fqdn;
  if (typeof fqdn === 'string' && fqdn.trim()) {
    return { type: 'object-network', name, fqdn: fqdn.trim() };
  }
  return null;
}

type VsysContext = {
  vsysName: string;
  /** vsys-scoped config (zones, addresses, rulebase, …). */
  root: Record<string, unknown>;
  /** Parent device entry when present — running-config puts `network` here, not under vsys. */
  device?: Record<string, unknown>;
};

function collectVsysContexts(config: Record<string, unknown>): VsysContext[] {
  const devices = config.devices as Record<string, unknown> | undefined;
  if (!devices) return [{ vsysName: 'vsys1', root: config }];

  const out: VsysContext[] = [];
  for (const dev of ensureArray(devices.entry as Record<string, unknown>[] | undefined)) {
    const vsysBlock = dev.vsys as Record<string, unknown> | undefined;
    if (!vsysBlock) continue;
    for (const vs of ensureArray(vsysBlock.entry as Record<string, unknown>[] | undefined)) {
      const vn = entryName(vs) || 'vsys1';
      out.push({ vsysName: vn, root: vs, device: dev });
    }
  }
  return out.length > 0 ? out : [{ vsysName: 'vsys1', root: config }];
}

function parseTcpUdpService(name: string, body: Record<string, unknown>): ObjectService | null {
  const proto = body.protocol as Record<string, unknown> | undefined;
  if (!proto) return null;
  const tcp = proto.tcp as Record<string, unknown> | undefined;
  const udp = proto.udp as Record<string, unknown> | undefined;
  if (tcp) {
    const port = tcp.port;
    const p =
      typeof port === 'string'
        ? parseInt(port, 10)
        : typeof port === 'number'
          ? port
          : NaN;
    if (!Number.isNaN(p)) return { type: 'object-service', name, proto: 'tcp', port: p };
    return { type: 'object-service', name, proto: 'tcp', port: 0 };
  }
  if (udp) {
    const port = udp.port;
    const p =
      typeof port === 'string'
        ? parseInt(port, 10)
        : typeof port === 'number'
          ? port
          : NaN;
    if (!Number.isNaN(p)) return { type: 'object-service', name, proto: 'udp', port: p };
    return { type: 'object-service', name, proto: 'udp', port: 0 };
  }
  return null;
}

function mapPanAction(action: string | undefined): ExplicitPolicyRule['action'] {
  const a = (action || '').toLowerCase();
  if (a === 'allow') return 'permit';
  if (a === 'reset-client' || a === 'reset-server' || a === 'reset-both') return 'reject';
  return 'deny';
}

function normalizeListForCore(names: string[]): string[] {
  return names.map((n) => (n.toLowerCase() === 'any' ? 'all' : n));
}

function mapPolicyRef(vsys: string, m: string, multiVsys: boolean): string {
  if (m.toLowerCase() === 'any') return 'all';
  return multiVsys ? `${vsys}/${m}` : m;
}

/** Parse `<ip><entry name="a.b.c.d/nn"/>` style blocks (used under `layer3` and directly on ethernet subifs). */
function firstCidrFromIpBlock(ipBlock: Record<string, unknown> | undefined): { ip?: string; mask?: string } {
  if (!ipBlock?.entry) return {};
  for (const e of ensureArray(ipBlock.entry as Record<string, unknown>[])) {
    const cidr = entryName(e);
    if (cidr && cidr.includes('/')) {
      const [addr, pref] = cidr.split('/');
      if (addr && pref !== undefined && /^[\d.]+$/.test(addr)) {
        return { ip: addr, mask: pref };
      }
    }
  }
  return {};
}

/** First static IPv4 CIDR under `layer3` (some exports). */
function firstIpFromLayer3(layer3: Record<string, unknown> | undefined): { ip?: string; mask?: string } {
  if (!layer3 || typeof layer3 !== 'object') return {};
  return firstCidrFromIpBlock(layer3.ip as Record<string, unknown> | undefined);
}

/** Ethernet / tunnel / loopback entry: IP may be under `layer3` or directly under `ip` (subinterface style). */
function firstIpFromPanInterfaceEntry(ent: Record<string, unknown>): { ip?: string; mask?: string } {
  const fromL3 = firstIpFromLayer3(ent.layer3 as Record<string, unknown> | undefined);
  if (fromL3.ip) return fromL3;
  return firstCidrFromIpBlock(ent.ip as Record<string, unknown> | undefined);
}

const PAN_INTERFACE_TYPE_KEYS = [
  'ethernet',
  'aggregate-ethernet',
  'tunnel',
  'loopback',
  'vlan',
] as const;

/** Running-config uses `network/interface/ethernet/entry`, not always `network/interface/entry`. */
function* iteratePanNetworkInterfaceEntries(net: Record<string, unknown> | undefined): Generator<Record<string, unknown>> {
  if (!net || typeof net !== 'object') return;
  const ifaceRoot = net.interface as Record<string, unknown> | undefined;
  if (!ifaceRoot) return;
  if (ifaceRoot.entry) {
    for (const ent of ensureArray(ifaceRoot.entry as Record<string, unknown>[])) {
      yield ent;
    }
  }
  for (const key of PAN_INTERFACE_TYPE_KEYS) {
    const block = ifaceRoot[key] as Record<string, unknown> | undefined;
    if (block?.entry) {
      for (const ent of ensureArray(block.entry as Record<string, unknown>[])) {
        yield ent;
      }
    }
  }
}

/**
 * Parse Palo Alto Networks exports into AST nodes consumable by {@link normalizeAsa}.
 * Accepts: full XML (GUI/API/Panorama), base64 ZIP bundles, raw ZIP bytes as a string, or set-format CLI.
 */
export function parsePaloAltoXml(content: string): ASAParseResult {
  const prep = preparePaloAltoInput(content);
  if (prep.kind === 'none') {
    return { statements: [], warnings: prep.notes };
  }
  if (prep.kind === 'set') {
    const r = parsePaloAltoSetConfig(prep.text);
    return { statements: r.statements, warnings: [...prep.notes, ...r.warnings] };
  }
  return parsePaloAltoXmlDocument(prep.xml, prep.notes);
}

/** Parse already-extracted PAN-OS XML text (single document). */
export function parsePaloAltoXmlDocument(content: string, prepNotes: string[] = []): ASAParseResult {
  const warnings: string[] = [...prepNotes];
  const statements: ASAAstNode[] = [];

  let parsed: unknown;
  try {
    parsed = parsePanosXmlString(content);
  } catch (e) {
    return {
      statements: [],
      warnings: [...prepNotes, `Palo Alto XML parse error: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const config = extractConfigRoot(parsed);
  if (!config) {
    return {
      statements: [],
      warnings: [
        ...prepNotes,
        'Palo Alto: no <config> root found (expected exported config, API response, or result/config wrapper).',
      ],
    };
  }

  const contexts = collectVsysContexts(config);
  if (contexts.length > 1) {
    warnings.push(
      `Palo Alto: ${contexts.length} vsys contexts merged; object/rule names are prefixed with vsys when needed to avoid collisions.`
    );
  }

  const qualify = (vsys: string, name: string) =>
    contexts.length > 1 ? `${vsys}/${name}` : name;
  const qualifyRef = (vsys: string, ref: string) =>
    contexts.length > 1 ? `${vsys}/${ref}` : ref;

  for (const { vsysName, root, device } of contexts) {
    const multi = contexts.length > 1;
    const emittedIface = new Set<string>();

    const addPanInterface = (shortName: string, ip?: string, mask?: string) => {
      if (!shortName || shortName.toLowerCase() === 'any') return;
      const qn = multi ? `${vsysName}/${shortName}` : shortName;
      if (emittedIface.has(qn)) return;
      emittedIface.add(qn);
      const st: InterfaceStatement = { type: 'interface', name: qn };
      if (ip) st.ipAddress = ip;
      if (mask) st.mask = mask;
      statements.push(st);
    };

    const zoneBlock = root.zone as Record<string, unknown> | undefined;
    if (zoneBlock?.entry) {
      for (const ent of ensureArray(zoneBlock.entry as Record<string, unknown>[])) {
        const nm = entryName(ent);
        if (nm) addPanInterface(nm);
      }
    }

    const net =
      (root.network as Record<string, unknown> | undefined) ??
      (device?.network as Record<string, unknown> | undefined);
    for (const ent of iteratePanNetworkInterfaceEntries(net)) {
      const nm = entryName(ent);
      if (!nm) continue;
      const { ip, mask } = firstIpFromPanInterfaceEntry(ent);
      addPanInterface(nm, ip, mask);
    }

    const addressBlock = root.address as Record<string, unknown> | undefined;
    if (addressBlock?.entry) {
      for (const ent of ensureArray(addressBlock.entry as Record<string, unknown>[])) {
        const nm = entryName(ent);
        if (!nm) continue;
        const qn = qualify(vsysName, nm);
        const body = { ...ent };
        delete body['@_name'];
        const on = addressEntryToObjectNetwork(qn, body);
        if (on) statements.push(on);
        else warnings.push(`Palo Alto address "${nm}" (${vsysName}): unsupported type; skipped.`);
      }
    }

    const agBlock = root['address-group'] as Record<string, unknown> | undefined;
    if (agBlock?.entry) {
      for (const ent of ensureArray(agBlock.entry as Record<string, unknown>[])) {
        const nm = entryName(ent);
        if (!nm) continue;
        const qn = qualify(vsysName, nm);
        const staticB = ent.static as Record<string, unknown> | undefined;
        const mems = memberTexts(staticB?.member);
        if (mems.length === 0) {
          warnings.push(`Palo Alto address-group "${nm}": no static members; skipped.`);
          continue;
        }
        const entries: ObjectGroupNetwork['entries'] = mems.map((m) => ({
          type: 'object' as const,
          name: qualifyRef(vsysName, m),
        }));
        statements.push({ type: 'object-group-network', name: qn, entries });
      }
    }

    const svcBlock = root.service as Record<string, unknown> | undefined;
    if (svcBlock?.entry) {
      for (const ent of ensureArray(svcBlock.entry as Record<string, unknown>[])) {
        const nm = entryName(ent);
        if (!nm) continue;
        const qn = qualify(vsysName, nm);
        const body = { ...ent };
        delete body['@_name'];
        const os = parseTcpUdpService(qn, body);
        if (os) statements.push(os);
        else warnings.push(`Palo Alto service "${nm}": non TCP/UDP or complex protocol; skipped.`);
      }
    }

    const sgBlock = root['service-group'] as Record<string, unknown> | undefined;
    if (sgBlock?.entry) {
      for (const ent of ensureArray(sgBlock.entry as Record<string, unknown>[])) {
        const nm = entryName(ent);
        if (!nm) continue;
        const qn = qualify(vsysName, nm);
        const mems = memberTexts((ent.members as Record<string, unknown> | undefined)?.member);
        if (mems.length === 0) {
          warnings.push(`Palo Alto service-group "${nm}": no members; skipped.`);
          continue;
        }
        const entries: ObjectGroupService['entries'] = mems.map((m) => ({
          type: 'service-object' as const,
          name: qualifyRef(vsysName, m),
        }));
        statements.push({ type: 'object-group-service', name: qn, entries });
      }
    }

    const rulebase = root.rulebase as Record<string, unknown> | undefined;
    const security = rulebase?.security as Record<string, unknown> | undefined;
    const rules = security?.rules as Record<string, unknown> | undefined;
    if (rules?.entry) {
      for (const ent of ensureArray(rules.entry as Record<string, unknown>[])) {
        const nm = entryName(ent);
        if (!nm) continue;
        const qn = qualify(vsysName, nm);
        const disabled = (ent.disabled as string | undefined)?.toLowerCase() === 'yes';
        const action = mapPanAction(typeof ent.action === 'string' ? ent.action : undefined);

        const rawSrc = panMemberList(ent, 'source');
        const rawDst = panMemberList(ent, 'destination');
        const src = normalizeListForCore(rawSrc.map((m) => mapPolicyRef(vsysName, m, multi)));
        const dst = normalizeListForCore(rawDst.map((m) => mapPolicyRef(vsysName, m, multi)));
        const apps = panMemberList(ent, 'application');
        const rawSvc = panMemberList(ent, 'service');
        const onlyAppDefault =
          rawSvc.length > 0 &&
          rawSvc.every((s) => s.toLowerCase() === 'application-default');
        let svcs = onlyAppDefault
          ? (['all'] as string[])
          : normalizeListForCore(rawSvc.map((m) => mapPolicyRef(vsysName, m, multi)));

        const fromZones = panMemberList(ent, 'from');
        const toZones = panMemberList(ent, 'to');
        for (const z of fromZones) addPanInterface(z);
        for (const z of toZones) addPanInterface(z);

        const utm: Record<string, string> = {};
        const ps = ent['profile-setting'] as Record<string, unknown> | undefined;
        if (ps && typeof ps === 'object') {
          for (const k of Object.keys(ps)) {
            if (k === '@_name') continue;
            const v = ps[k];
            if (typeof v === 'string') utm[k] = v;
            else if (v && typeof v === 'object' && 'member' in (v as object)) {
              const t = memberTexts((v as Record<string, unknown>).member);
              if (t.length) utm[k] = t.join(',');
            }
          }
        }

        const explicit: ExplicitPolicyRule = {
          type: 'explicit-policy-rule',
          name: qn,
          ruleId: qn,
          enabled: !disabled,
          sourceNames: src,
          destinationNames: dst,
          serviceNames: svcs.length ? svcs : ['all'],
          action,
          log: 'none',
          sourceInterfaceNames: fromZones.length ? fromZones : undefined,
          destinationInterfaceNames: toZones.length ? toZones : undefined,
          utmProfileRefs: Object.keys(utm).length ? utm : undefined,
          possibleInternetServiceNames:
            apps.length && !apps.every((a) => a.toLowerCase() === 'any') ? apps : undefined,
        };
        statements.push(explicit);

        if (apps.some((a) => a.toLowerCase() !== 'any' && a.toLowerCase() !== 'none')) {
          warnings.push(
            `Palo Alto rule "${qn}": App-ID applications present (${apps.join(', ')}) — verify Check Point Application Control mapping.`
          );
        }
      }
    }
  }

  if (statements.length === 0) {
    warnings.push(
      'Palo Alto: no address, service, or security rules extracted — check XML structure (vsys / shared).'
    );
  }

  return { statements, warnings };
}
