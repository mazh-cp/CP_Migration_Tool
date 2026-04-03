import { createHash } from 'crypto';
import type { ASAAstNode } from '@cisco2cp/parsers';
import {
  FORTINET_INVENTORY_TO_PARSED_TYPES,
  type FortinetSourceInventory,
  type FortiManagerSourceInventory,
} from '@cisco2cp/parsers';
import type { NormalizedResult } from './models/normalized';
import { ANY_NET_ID, ANY_SVC_ID } from './registry/ObjectRegistry';

export interface InventoryMismatch {
  category: string;
  sourceConfigPath: string;
  sourceEdits: number;
  parsedCount: number;
  delta: number;
  note?: string;
}

export interface FunctionalTestCase {
  id: string;
  kind: 'policy-allow' | 'policy-deny' | 'policy-reject' | 'nat-static' | 'nat-hide' | 'nat-other';
  description: string;
  ruleId?: string;
  natRuleId?: string;
  expected: 'permit' | 'deny';
}

export interface MigrationAssurance {
  sourceInventoryHash: string;
  parsedManifestHash: string;
  inventoryFullyAligned: boolean;
  inventoryMismatches: InventoryMismatch[];
  coveragePercentByCategory: Record<string, number>;
  overallCoveragePercent: number;
  orphanObjects: Array<{ id: string; name: string; type: string }>;
  singleUseObjects: Array<{ id: string; name: string; type: string; referenceCount: number }>;
  functionalTestPlan: FunctionalTestCase[];
}

const BUILTIN_REF = new Set([ANY_NET_ID, ANY_SVC_ID]);

export function countFortinetParseStatements(statements: ASAAstNode[]): {
  byType: Record<string, number>;
  customServiceStatementCount: number;
} {
  const byType: Record<string, number> = {};
  let customServiceStatementCount = 0;
  for (const s of statements) {
    byType[s.type] = (byType[s.type] || 0) + 1;
    if (s.type === 'object-service') {
      const line = (s as { lineNumber?: number }).lineNumber;
      if (line != null) customServiceStatementCount++;
    }
  }
  return { byType, customServiceStatementCount };
}

export function hashFortinetSourceInventory(inv: FortinetSourceInventory): string {
  const parts: string[] = [
    `cv:${inv.configVersion ?? ''}`,
    `vdom:${inv.vdomConfigLines}`,
    `lines:${inv.lineCount}`,
  ];
  for (const p of Object.keys(inv.configEditCounts).sort()) {
    parts.push(`${p}:${inv.configEditCounts[p]}`);
  }
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

export function hashFmgSourceInventory(inv: FortiManagerSourceInventory): string {
  const payload = `addr:${inv.addressCount}|grp:${inv.addrgrpCount}|sc:${inv.serviceCustomCount}|sg:${inv.serviceGroupCount}|pol:${inv.policyCount}|keys:${inv.rawJsonKeys.join(',')}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function hashParsedStatementManifest(
  byType: Record<string, number>,
  customServiceStatementCount: number
): string {
  const parts: string[] = [];
  for (const t of Object.keys(byType).sort()) {
    parts.push(`${t}:${byType[t]}`);
  }
  parts.push(`custom-service-stmts:${customServiceStatementCount}`);
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

export function hashNormalizedSummary(data: NormalizedResult): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        objects: data.objects.length,
        rules: data.rules.length,
        nat: data.nat.length,
        interfaces: data.interfaces.length,
        zones: data.zones.length,
      }),
      'utf8'
    )
    .digest('hex');
}

export function compareFortinetInventoryToParsed(
  inv: FortinetSourceInventory,
  byType: Record<string, number>,
  customServiceStatementCount: number
): InventoryMismatch[] {
  const out: InventoryMismatch[] = [];
  for (const [path, astTypes] of Object.entries(FORTINET_INVENTORY_TO_PARSED_TYPES)) {
    const sourceEdits = inv.configEditCounts[path] ?? 0;
    let parsed = 0;
    if (path === 'firewall service custom') {
      parsed = customServiceStatementCount;
    } else {
      for (const t of astTypes) {
        parsed += byType[t] ?? 0;
      }
    }
    if (sourceEdits !== parsed) {
      const note =
        path === 'firewall address'
          ? 'Skipped addresses (e.g. wildcard) do not emit objects; some delta may be expected.'
          : path === 'firewall service custom'
            ? 'Counts only custom services with line numbers; synthetic builtins are excluded.'
            : undefined;
      out.push({
        category: path,
        sourceConfigPath: path,
        sourceEdits,
        parsedCount: parsed,
        delta: parsed - sourceEdits,
        note,
      });
    }
  }
  return out;
}

export function compareFortiManagerInventoryToParsed(
  inv: FortiManagerSourceInventory,
  byType: Record<string, number>,
  customServiceStatementCount: number
): InventoryMismatch[] {
  const rows: InventoryMismatch[] = [];
  const checks: Array<[string, string, number, number]> = [
    ['fmg:address', 'address', inv.addressCount, byType['object-network'] ?? 0],
    ['fmg:addrgrp', 'addrgrp', inv.addrgrpCount, byType['object-group-network'] ?? 0],
    [
      'fmg:serviceCustom',
      'service custom',
      inv.serviceCustomCount,
      customServiceStatementCount,
    ],
    [
      'fmg:serviceGroup',
      'service group',
      inv.serviceGroupCount,
      byType['object-group-service'] ?? 0,
    ],
    ['fmg:policy', 'policy', inv.policyCount, byType['explicit-policy-rule'] ?? 0],
  ];
  for (const [category, path, sourceEdits, parsed] of checks) {
    if (sourceEdits !== parsed) {
      rows.push({
        category,
        sourceConfigPath: path,
        sourceEdits,
        parsedCount: parsed,
        delta: parsed - sourceEdits,
        note:
          category === 'fmg:serviceCustom'
            ? 'Custom service count uses line-number heuristic to exclude injected builtins.'
            : undefined,
      });
    }
  }
  return rows;
}

function computeFortinetCoverage(
  inv: FortinetSourceInventory,
  byType: Record<string, number>,
  customServiceStatementCount: number
): { byCategory: Record<string, number>; overall: number } {
  const byCategory: Record<string, number> = {};
  const vals: number[] = [];
  for (const path of Object.keys(FORTINET_INVENTORY_TO_PARSED_TYPES)) {
    const src = inv.configEditCounts[path] ?? 0;
    let parsed = 0;
    if (path === 'firewall service custom') {
      parsed = customServiceStatementCount;
    } else {
      for (const t of FORTINET_INVENTORY_TO_PARSED_TYPES[path]!) {
        parsed += byType[t] ?? 0;
      }
    }
    const pct = src <= 0 ? 100 : Math.min(100, Math.round((parsed / src) * 100));
    byCategory[path] = pct;
    if (src > 0) vals.push(pct);
  }
  const overall = vals.length === 0 ? 100 : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  return { byCategory, overall };
}

function computeFmgCoverage(
  inv: FortiManagerSourceInventory,
  byType: Record<string, number>,
  customServiceStatementCount: number
): { byCategory: Record<string, number>; overall: number } {
  const byCategory: Record<string, number> = {};
  const vals: number[] = [];
  const rows: Array<[string, number, number]> = [
    ['fmg:address', inv.addressCount, byType['object-network'] ?? 0],
    ['fmg:addrgrp', inv.addrgrpCount, byType['object-group-network'] ?? 0],
    ['fmg:serviceCustom', inv.serviceCustomCount, customServiceStatementCount],
    ['fmg:serviceGroup', inv.serviceGroupCount, byType['object-group-service'] ?? 0],
    ['fmg:policy', inv.policyCount, byType['explicit-policy-rule'] ?? 0],
  ];
  for (const [cat, src, parsed] of rows) {
    const pct = src <= 0 ? 100 : Math.min(100, Math.round((parsed / src) * 100));
    byCategory[cat] = pct;
    if (src > 0) vals.push(pct);
  }
  const overall = vals.length === 0 ? 100 : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  return { byCategory, overall };
}

function collectReferenceCounts(data: NormalizedResult): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string | undefined) => {
    if (!id) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  for (const r of data.rules) {
    for (const id of r.sourceRefs) bump(id);
    for (const id of r.destinationRefs) bump(id);
    for (const id of r.serviceRefs) bump(id);
  }
  return counts;
}

export function findOrphanObjects(
  data: NormalizedResult
): Array<{ id: string; name: string; type: string }> {
  const counts = collectReferenceCounts(data);
  const orphans: Array<{ id: string; name: string; type: string }> = [];
  for (const o of data.objects) {
    if (BUILTIN_REF.has(o.id)) continue;
    if ((counts.get(o.id) ?? 0) === 0) {
      orphans.push({ id: o.id, name: o.name, type: o.type });
    }
  }
  return orphans;
}

export function findSingleUseObjects(
  data: NormalizedResult
): Array<{ id: string; name: string; type: string; referenceCount: number }> {
  const counts = collectReferenceCounts(data);
  const out: Array<{ id: string; name: string; type: string; referenceCount: number }> = [];
  for (const o of data.objects) {
    if (BUILTIN_REF.has(o.id)) continue;
    const c = counts.get(o.id) ?? 0;
    if (c === 1) {
      out.push({ id: o.id, name: o.name, type: o.type, referenceCount: 1 });
    }
  }
  return out;
}

export function buildFunctionalTestPlan(data: NormalizedResult): FunctionalTestCase[] {
  const cases: FunctionalTestCase[] = [];
  let seq = 0;
  for (const r of data.rules) {
    const expected: 'permit' | 'deny' = r.action === 'allow' ? 'permit' : 'deny';
    const kind: FunctionalTestCase['kind'] =
      r.action === 'allow'
        ? 'policy-allow'
        : r.action === 'reject'
          ? 'policy-reject'
          : 'policy-deny';
    cases.push({
      id: `TC-POL-${++seq}`,
      kind,
      description: `After cutover, traffic matching policy "${r.name ?? r.ruleId ?? r.id}" should be ${expected.toUpperCase()} (was ${r.action} on FortiGate).`,
      ruleId: r.id,
      expected,
    });
  }
  for (const n of data.nat) {
    if (n.type === 'static' && (n.originalDst || n.translatedDst)) {
      cases.push({
        id: `TC-NAT-${++seq}`,
        kind: 'nat-static',
        description: `Verify DNAT/static: original dest ${n.originalDst ?? '?'}${n.originalSvc ? `:${n.originalSvc}` : ''} reaches ${n.translatedDst ?? '?'}`,
        natRuleId: n.id,
        expected: 'permit',
      });
    } else if (n.type === 'hide' || n.type === 'pat') {
      cases.push({
        id: `TC-NAT-${++seq}`,
        kind: 'nat-hide',
        description: `Verify source NAT (${n.type}): translated source ${n.translatedSrc ?? '?'}`,
        natRuleId: n.id,
        expected: 'permit',
      });
    } else {
      cases.push({
        id: `TC-NAT-${++seq}`,
        kind: 'nat-other',
        description: `Verify NAT rule type ${n.type} (manual validation).`,
        natRuleId: n.id,
        expected: 'permit',
      });
    }
  }
  return cases;
}

export interface BuildMigrationAssuranceOptions {
  fortinetInv?: FortinetSourceInventory;
  fmgInv?: FortiManagerSourceInventory | null;
}

/**
 * Full migration assurance: inventory reconciliation (Forti CLI / FMG JSON), orphan/single-use objects,
 * hashes, coverage %, and a functional test-case outline for post-cutover validation.
 */
export function buildMigrationAssurance(
  data: NormalizedResult,
  statements: ASAAstNode[] | undefined,
  opts?: BuildMigrationAssuranceOptions
): MigrationAssurance {
  const orphanObjects = findOrphanObjects(data);
  const singleUseObjects = findSingleUseObjects(data);
  const functionalTestPlan = buildFunctionalTestPlan(data);

  if (!statements?.length) {
    const h = hashNormalizedSummary(data);
    return {
      sourceInventoryHash: h,
      parsedManifestHash: h,
      inventoryFullyAligned: true,
      inventoryMismatches: [],
      coveragePercentByCategory: {},
      overallCoveragePercent: 100,
      orphanObjects,
      singleUseObjects,
      functionalTestPlan,
    };
  }

  const { byType, customServiceStatementCount } = countFortinetParseStatements(statements);
  const parsedManifestHash = hashParsedStatementManifest(byType, customServiceStatementCount);

  let sourceInventoryHash: string;
  let inventoryMismatches: InventoryMismatch[] = [];
  let coveragePercentByCategory: Record<string, number> = {};
  let overallCoveragePercent = 100;

  if (opts?.fortinetInv) {
    sourceInventoryHash = hashFortinetSourceInventory(opts.fortinetInv);
    inventoryMismatches = compareFortinetInventoryToParsed(
      opts.fortinetInv,
      byType,
      customServiceStatementCount
    );
    const cov = computeFortinetCoverage(opts.fortinetInv, byType, customServiceStatementCount);
    coveragePercentByCategory = cov.byCategory;
    overallCoveragePercent = cov.overall;
  } else if (opts?.fmgInv) {
    sourceInventoryHash = hashFmgSourceInventory(opts.fmgInv);
    inventoryMismatches = compareFortiManagerInventoryToParsed(
      opts.fmgInv,
      byType,
      customServiceStatementCount
    );
    const cov = computeFmgCoverage(opts.fmgInv, byType, customServiceStatementCount);
    coveragePercentByCategory = cov.byCategory;
    overallCoveragePercent = cov.overall;
  } else {
    sourceInventoryHash = hashNormalizedSummary(data);
    inventoryMismatches = [];
    coveragePercentByCategory = {};
    overallCoveragePercent = 100;
  }

  return {
    sourceInventoryHash,
    parsedManifestHash,
    inventoryFullyAligned: inventoryMismatches.length === 0,
    inventoryMismatches,
    coveragePercentByCategory,
    overallCoveragePercent,
    orphanObjects,
    singleUseObjects,
    functionalTestPlan,
  };
}
