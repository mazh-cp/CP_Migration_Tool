import type { NormalizedPolicyRule } from '@cisco2cp/core';

export interface FortiAnalyzerHitRow {
  policyName?: string;
  policyId?: string;
  hits: number;
}

function parseHitsJson(content: string): { rows: FortiAnalyzerHitRow[]; warnings: string[] } {
  const warnings: string[] = [];
  try {
    const data = JSON.parse(content) as { hits?: FortiAnalyzerHitRow[] };
    if (!Array.isArray(data.hits)) {
      warnings.push('FortiAnalyzer JSON: expected top-level { "hits": [ ... ] }');
      return { rows: [], warnings };
    }
    const rows = data.hits.filter(
      (h) =>
        h &&
        typeof h.hits === 'number' &&
        !isNaN(h.hits) &&
        (h.policyName != null || h.policyId != null)
    );
    return { rows, warnings };
  } catch {
    warnings.push('FortiAnalyzer: invalid JSON');
    return { rows: [], warnings };
  }
}

/** CSV: first row header with policyId or policyName (or name) + hits */
function parseHitsCsv(content: string): { rows: FortiAnalyzerHitRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    warnings.push('FortiAnalyzer CSV: need header + data rows');
    return { rows: [], warnings };
  }
  const header = lines[0]!.toLowerCase().split(',').map((c) => c.trim());
  const idIdx = header.findIndex((h) => h === 'policyid' || h === 'id');
  const nameIdx = header.findIndex((h) => h === 'policyname' || h === 'name' || h === 'rule');
  const hitsIdx = header.findIndex((h) => h === 'hits' || h === 'hitcount' || h === 'count');
  if (hitsIdx < 0 || (idIdx < 0 && nameIdx < 0)) {
    warnings.push('FortiAnalyzer CSV: need columns hits + (policyId or policyName)');
    return { rows: [], warnings };
  }
  const rows: FortiAnalyzerHitRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const hits = parseInt(cols[hitsIdx] ?? '', 10);
    if (isNaN(hits)) continue;
    const row: FortiAnalyzerHitRow = { hits };
    if (idIdx >= 0 && cols[idIdx]) row.policyId = cols[idIdx];
    if (nameIdx >= 0 && cols[nameIdx]) row.policyName = cols[nameIdx];
    if (row.policyId || row.policyName) rows.push(row);
  }
  return { rows, warnings };
}

/**
 * Merge FortiAnalyzer / log-report hit counts into normalized rules (by name or policyId).
 */
export function mergeFortiAnalyzerHits(
  rules: NormalizedPolicyRule[],
  content: string,
  filename?: string
): { rules: NormalizedPolicyRule[]; warnings: string[] } {
  const trimmed = content.trim();
  const isCsv = /\.csv$/i.test(filename ?? '') || (!trimmed.startsWith('{') && trimmed.includes(','));

  const { rows, warnings: w1 } = isCsv ? parseHitsCsv(trimmed) : parseHitsJson(trimmed);
  const warnings = [...w1];

  if (rows.length === 0) {
    warnings.push('FortiAnalyzer: no hit rows merged');
    return { rules, warnings };
  }

  const byName = new Map<string, number>();
  const byId = new Map<string, number>();
  for (const r of rows) {
    if (r.policyName) byName.set(r.policyName.toLowerCase(), r.hits);
    if (r.policyId != null) byId.set(String(r.policyId), r.hits);
  }

  let merged = 0;
  const next = rules.map((rule) => {
    let hc: number | undefined;
    if (rule.name && byName.has(rule.name.toLowerCase())) {
      hc = byName.get(rule.name.toLowerCase());
    } else if (rule.ruleId && byId.has(String(rule.ruleId))) {
      hc = byId.get(String(rule.ruleId));
    } else if (rule.name?.match(/^policy-(\d+)$/)) {
      const id = rule.name.slice(8);
      if (byId.has(id)) hc = byId.get(id);
    }
    if (hc == null) return rule;
    merged++;
    return { ...rule, hitCount: hc };
  });

  warnings.push(`FortiAnalyzer: merged hit counts for ${merged} rule(s)`);
  return { rules: next, warnings };
}
