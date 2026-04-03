/**
 * Pre-parse census for FortiManager JSON bundles (object counts before AST emission).
 */

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function collectList(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) {
    if (Array.isArray(raw.results)) return raw.results;
    if (Array.isArray(raw.result)) return raw.result;
    const policy = raw.policy;
    if (isRecord(policy)) return Object.values(policy);
    const vals = Object.values(raw);
    if (vals.length > 0 && vals.every((v) => isRecord(v))) return vals;
    return vals.flatMap((v) => (Array.isArray(v) ? v : []));
  }
  return [];
}

export interface FortiManagerSourceInventory {
  addressCount: number;
  addrgrpCount: number;
  serviceCustomCount: number;
  serviceGroupCount: number;
  policyCount: number;
  rawJsonKeys: string[];
}

export function scanFortiManagerJsonInventory(content: string): FortiManagerSourceInventory | null {
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
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
    root.addrgrp ??
    root['firewall/addrgrp'] ??
    (isRecord(root.obj) ? (root.obj as Record<string, unknown>)['firewall/addrgrp'] : undefined);

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

  return {
    addressCount: collectList(addrSrc).filter(isRecord).length,
    addrgrpCount: collectList(grpSrc).filter(isRecord).length,
    serviceCustomCount: collectList(svcSrc).filter(isRecord).length,
    serviceGroupCount: collectList(svcGrpSrc).filter(isRecord).length,
    policyCount: collectList(polSrc).filter(isRecord).length,
    rawJsonKeys: Object.keys(root).sort(),
  };
}
