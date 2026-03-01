import type { ASAParseResult, ASAAstNode } from '../asa/ast';

interface FTDAccessRule {
  name?: string;
  action?: string;
  enabled?: boolean;
  sourceNetworks?: { objects?: Array<{ name?: string; value?: string }> };
  destinationNetworks?: { objects?: Array<{ name?: string; value?: string }> };
  destinationPorts?: { objects?: Array<{ name?: string; value?: string; port?: string }> };
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

export function parseFtdJson(input: string | object): FTDParseResult {
  const warnings: string[] = [];
  const statements: ASAAstNode[] = [];

  let data: Record<string, unknown>;
  try {
    data = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return { statements: [], warnings: ['Invalid JSON'] };
  }

  const items = data.items || data;
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
        const src = rule.sourceNetworks?.objects?.[0]?.value || 'any';
        const dst = rule.destinationNetworks?.objects?.[0]?.value || 'any';
        const portObj = rule.destinationPorts?.objects?.[0];
        const port = (portObj && 'port' in portObj ? portObj.port : undefined) || 'any';
        statements.push({
          type: 'access-list-extended',
          name: (rule.name as string) || 'acl',
          action: action === 'allow' || action === 'permit' ? 'permit' : 'deny',
          proto: 'ip',
          src,
          dst,
          raw: JSON.stringify(rule),
          lineNumber: 0,
        } as ASAAstNode);
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
