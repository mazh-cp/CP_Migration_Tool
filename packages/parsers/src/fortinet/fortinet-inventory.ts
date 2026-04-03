/**
 * Pre-parse census of FortiGate CLI config: counts `edit` completions per `config` path
 * (before semantic parsing) for inventory-vs-parsed reconciliation.
 */

type InvStackConfig = { type: 'config'; path: string };
type InvStackEdit = { type: 'edit' };
type InvStackEntry = InvStackConfig | InvStackEdit;

function lineIndent(raw: string): number {
  const m = raw.match(/^(\s*)/);
  return (m?.[1] ?? '').replace(/\t/g, '    ').length;
}

function topConfigPath(stack: InvStackEntry[]): string | undefined {
  for (let k = stack.length - 1; k >= 0; k--) {
    const e = stack[k]!;
    if (e.type === 'config') return e.path;
  }
  return undefined;
}

export interface FortinetSourceInventory {
  configVersion?: string;
  /** Number of `config vdom` lines (multi-VDOM exports). */
  vdomConfigLines: number;
  /** Completed `edit` … `next` counts per FortiOS config path (e.g. `firewall address`). */
  configEditCounts: Record<string, number>;
  lineCount: number;
  /** Distinct config paths seen (any depth). */
  configPathsSeen: string[];
}

/**
 * Walk the raw config and tally `edit` blocks closed with `next`, keyed by innermost enclosing `config` path.
 * Mirrors the main parser stack discipline for `end` / unterminated edits.
 */
export function scanFortinetConfigInventory(content: string): FortinetSourceInventory {
  const lines = content.split(/\r?\n/);
  const stack: InvStackEntry[] = [];
  const counts: Record<string, number> = {};
  const pathsSeen = new Set<string>();
  let configVersion: string | undefined;
  let vdomConfigLines = 0;

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!;
    const trim = raw.trim();

    if (trim.startsWith('#')) {
      if (/config-version/i.test(trim)) {
        const m = trim.match(/config-version[=:\s#]+(.+)/i);
        if (m?.[1]) configVersion = m[1]!.trim();
      }
      continue;
    }
    if (!trim) continue;

    if (trim.startsWith('config vdom')) {
      vdomConfigLines++;
    }

    if (trim.startsWith('config ')) {
      const path = trim.slice(7).trim();
      pathsSeen.add(path);
      stack.push({ type: 'config', path });
      continue;
    }

    if (trim.startsWith('edit ')) {
      stack.push({ type: 'edit' });
      continue;
    }

    if (trim === 'next') {
      const popped = stack.pop();
      if (popped?.type === 'edit') {
        const p = topConfigPath(stack);
        if (p) counts[p] = (counts[p] || 0) + 1;
      }
      continue;
    }

    if (trim === 'end') {
      while (stack.length > 0 && stack[stack.length - 1]!.type === 'edit') {
        stack.pop();
      }
      const popped = stack.pop();
      if (popped?.type !== 'config') {
        if (popped) stack.push(popped);
      }
      continue;
    }
  }

  return {
    configVersion,
    vdomConfigLines,
    configEditCounts: counts,
    lineCount: lines.length,
    configPathsSeen: [...pathsSeen].sort(),
  };
}

/** Map Forti `config` paths to AST statement types produced by parseFortinetConfig. */
export const FORTINET_INVENTORY_TO_PARSED_TYPES: Record<string, string[]> = {
  'firewall address': ['object-network'],
  'firewall addrgrp': ['object-group-network'],
  'firewall service custom': ['object-service'],
  'firewall service group': ['object-group-service'],
  'firewall policy': ['explicit-policy-rule'],
  'firewall vip': ['fortinet-vip'],
  'firewall ippool': ['fortinet-ippool'],
  'system interface': ['interface'],
};
