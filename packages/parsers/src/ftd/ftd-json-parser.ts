import type { ASAParseResult, ASAAstNode } from '../asa/ast';

interface FTDAccessRule {
  name?: string;
  action?: string;
  enabled?: boolean;
  sourceNetworks?: { objects?: Array<FTDNamedValueObject> };
  destinationNetworks?: { objects?: Array<FTDNamedValueObject> };
  sourceZones?: { objects?: Array<FTDNamedValueObject> };
  destinationZones?: { objects?: Array<FTDNamedValueObject> };
  destinationPorts?: {
    objects?: Array<FTDNamedValueObject & { port?: string; protocol?: string }>;
    literals?: Array<{ type?: string; port?: string; protocol?: string }>;
  };
  applications?: {
    applications?: Array<{ name?: string }>;
    applicationFilters?: Array<{ name?: string }>;
  };
}

interface FTDNamedValueObject {
  name?: string;
  value?: string;
  id?: string;
  type?: string;
}

interface FTDObject {
  name?: string;
  type?: string;
  value?: string;
  subType?: string;
  port?: string;
  protocol?: string;
}

export interface FTDParseResult {
  statements: ASAAstNode[];
  warnings: string[];
}

const DEFAULT_MAX_RULE_EXPANSIONS = 500;

export function parseFtdJson(input: string | object): FTDParseResult {
  const warnings: string[] = [];
  const statements: ASAAstNode[] = [];

  let data: unknown;
  try {
    data = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return { statements: [], warnings: ['Invalid JSON'] };
  }

  const items =
    Array.isArray(data)
      ? data
      : isObjectRecord(data) && 'items' in data
        ? (data.items as unknown)
        : data;
  const arr = Array.isArray(items) ? items : [items];

  for (const item of arr) {
    try {
      const obj = item as Record<string, unknown>;
      const type = (obj.type || obj.kind || '').toString().toLowerCase();

      if (type.includes('network') || type.includes('host')) {
        const name = (obj.name as string) || 'unnamed';
        const value = obj.value as string;
        if (value && value.includes('-')) {
          const [from, to] = value.split('-').map((s: string) => s.trim());
          statements.push({
            type: 'object-network',
            name,
            range: { from, to },
            lineNumber: 0,
          } as ASAAstNode);
        } else if (value && value.includes('/')) {
          const [subnet, mask] = value.split('/');
          statements.push({
            type: 'object-network',
            name,
            subnet,
            subnetMask: cidrToMask(parseInt(mask, 10)),
            lineNumber: 0,
          } as ASAAstNode);
        } else if (value) {
          statements.push({
            type: 'object-network',
            name,
            host: value,
            lineNumber: 0,
          } as ASAAstNode);
        }
      } else if (type.includes('access') || type.includes('rule')) {
        const rule = obj as unknown as FTDAccessRule;
        const action = (rule.action || 'permit').toString().toLowerCase();
        const sources = toSourceDestinations(rule.sourceNetworks?.objects);
        const destinations = toSourceDestinations(rule.destinationNetworks?.objects);
        const ports = toDestinationPorts(rule.destinationPorts);
        const proto = toProtocol(rule.destinationPorts);
        const options = toRuleOptions(rule);
        const expansionTotal = sources.length * destinations.length * ports.length;
        const expansionLimit = DEFAULT_MAX_RULE_EXPANSIONS;
        if (expansionTotal > expansionLimit) {
          warnings.push(
            `Rule "${(rule.name as string) || 'acl'}" expansion capped at ${expansionLimit} of ${expansionTotal} combinations`
          );
        }
        let emitted = 0;
        for (const src of sources) {
          for (const dst of destinations) {
            for (const port of ports) {
              if (emitted >= expansionLimit) break;
              statements.push({
                type: 'access-list-extended',
                name: (rule.name as string) || 'acl',
                action: action === 'allow' || action === 'permit' ? 'permit' : 'deny',
                proto,
                src,
                dst,
                dstPort: port === 'any' ? undefined : port,
                options: options.length > 0 ? options : undefined,
                raw: JSON.stringify(rule),
                lineNumber: 0,
              } as ASAAstNode);
              emitted++;
            }
            if (emitted >= expansionLimit) break;
          }
          if (emitted >= expansionLimit) break;
        }
      }
    } catch {
      warnings.push('Skipped unsupported FTD object');
    }
  }

  return { statements, warnings };
}

function cidrToMask(cidr: number): string {
  const m = (0xffffffff << (32 - cidr)) >>> 0;
  return [(m >>> 24) & 0xff, (m >>> 16) & 0xff, (m >>> 8) & 0xff, m & 0xff].join('.');
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toSourceDestinations(objects?: FTDNamedValueObject[]): string[] {
  if (!objects || objects.length === 0) return ['any'];
  const values = objects
    .map((o) => o.value || o.name || o.id || '')
    .filter((v) => v.length > 0);
  return values.length > 0 ? values : ['any'];
}

function toDestinationPorts(
  destinationPorts?: FTDAccessRule['destinationPorts']
): string[] {
  const literalPorts =
    destinationPorts?.literals
      ?.map((l) => l.port || '')
      .filter((p) => p.length > 0) ?? [];

  const objectPorts =
    destinationPorts?.objects
      ?.map((o) => o.port || o.value || o.name || '')
      .filter((p) => p.length > 0) ?? [];

  const all = [...literalPorts, ...objectPorts];
  if (all.length === 0) return ['any'];
  return Array.from(new Set(all));
}

function toProtocol(destinationPorts?: FTDAccessRule['destinationPorts']): string {
  const literalProtocol = destinationPorts?.literals?.[0]?.protocol;
  const objectProtocol = destinationPorts?.objects?.[0]?.protocol;
  const proto = literalProtocol || objectProtocol;
  if (proto === '6' || proto?.toLowerCase() === 'tcp') return 'tcp';
  if (proto === '17' || proto?.toLowerCase() === 'udp') return 'udp';
  if (proto === '1' || proto?.toLowerCase() === 'icmp') return 'icmp';
  return 'ip';
}

function toRuleOptions(rule: FTDAccessRule): string[] {
  const options: string[] = [];
  const srcZone = (rule.sourceZones?.objects?.map((z) => z.name).filter(Boolean) as string[]) ?? [];
  const dstZone =
    (rule.destinationZones?.objects?.map((z) => z.name).filter(Boolean) as string[]) ?? [];
  const apps = (rule.applications?.applications?.map((a) => a.name).filter(Boolean) as string[]) ?? [];
  const appFilters =
    (rule.applications?.applicationFilters?.map((a) => a.name).filter(Boolean) as string[]) ?? [];

  if (srcZone.length > 0) options.push(`src-zones:${srcZone.join('|')}`);
  if (dstZone.length > 0) options.push(`dst-zones:${dstZone.join('|')}`);
  if (apps.length > 0) options.push(`apps:${apps.join('|')}`);
  if (appFilters.length > 0) options.push(`app-filters:${appFilters.join('|')}`);

  return options;
}
