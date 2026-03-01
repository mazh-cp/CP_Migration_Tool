import { describe, it, expect } from 'vitest';
import { parseASA } from '@cisco2cp/parsers';
import { normalizeAsa, mapObjects, mapPolicy, validate } from '@cisco2cp/core';
import { exportToJson } from './export-json';
import * as fs from 'fs';
import * as path from 'path';

const asa3510Sample = fs.readFileSync(
  path.join(process.cwd(), '../../testdata/asa/asa3510_sample.cfg'),
  'utf-8'
);

describe('Check Point export', () => {
  it('export asa3510_sample with zero missing refs', () => {
    const parsed = parseASA(asa3510Sample);
    const normalized = normalizeAsa(parsed.statements);
    const validation = validate(normalized);
    expect(validation.findings.filter((f) => f.code === 'MISSING_REF')).toHaveLength(0);

    const objDecisions = mapObjects(normalized.objects);
    const ruleDecisions = mapPolicy(normalized.rules);
    const mappingDecisions = [...objDecisions, ...ruleDecisions];

    const bundle = exportToJson({
      projectId: 'test',
      normalized,
      mappingDecisions,
    });

    expect(bundle.rules).toBeDefined();
    expect(Array.isArray(bundle.rules)).toBe(true);
    expect(bundle.rules.length).toBe(normalized.rules.length);
    for (const rule of bundle.rules as Array<{ source: string[]; destination: string[]; service: string[] }>) {
      expect(rule.source).toBeDefined();
      expect(rule.destination).toBeDefined();
      expect(rule.service).toBeDefined();
      expect(rule.source.every((s) => typeof s === 'string')).toBe(true);
      expect(rule.destination.every((d) => typeof d === 'string')).toBe(true);
      expect(rule.service.every((s) => typeof s === 'string')).toBe(true);
    }
  });
});
