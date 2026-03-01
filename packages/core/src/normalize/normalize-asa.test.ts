import { describe, it, expect } from 'vitest';
import { parseASA } from '@cisco2cp/parsers';
import { normalizeAsa, validate, ANY_NET_ID, ANY_SVC_ID, validateReferentialIntegrity } from '../index';
import * as fs from 'fs';
import * as path from 'path';

const asa3510Sample = fs.readFileSync(
  path.join(process.cwd(), '../../testdata/asa/asa3510_sample.cfg'),
  'utf-8'
);

describe('ASA normalization - referential integrity', () => {
  it('no missing references for asa3510_sample.cfg', () => {
    const parsed = parseASA(asa3510Sample);
    const normalized = normalizeAsa(parsed.statements);
    const validation = validate(normalized);
    const missingRefs = validation.findings.filter((f) => f.code === 'MISSING_REF');
    expect(missingRefs).toHaveLength(0);
  });

  it('Any never generates new object UUID - uses builtin constants', () => {
    const parsed = parseASA(asa3510Sample);
    const normalized = normalizeAsa(parsed.statements);
    const objectIds = new Set(normalized.objects.map((o) => o.id));
    for (const rule of normalized.rules) {
      for (const ref of [...rule.sourceRefs, ...rule.destinationRefs, ...rule.serviceRefs]) {
        if (ref === ANY_NET_ID || ref === ANY_SVC_ID) {
          expect(ref).toMatch(/^__ANY_(NETWORK|SERVICE)__$/);
        } else {
          expect(objectIds.has(ref)).toBe(true);
        }
      }
    }
  });

  it('inline tcp/udp services become exported objects or builtin Any', () => {
    const parsed = parseASA(asa3510Sample);
    const normalized = normalizeAsa(parsed.statements);
    const ruleWithTcp80 = normalized.rules.find((r) =>
      r.serviceRefs.some((s) => s !== ANY_SVC_ID)
    );
    expect(ruleWithTcp80).toBeDefined();
    const serviceObjects = normalized.objects.filter(
      (o) => o.type === 'service' || o.type === 'service-group'
    );
    expect(serviceObjects.length).toBeGreaterThan(0);
  });

  it('group strategy preserve produces group object with members', () => {
    const parsed = parseASA(asa3510Sample);
    const normalized = normalizeAsa(parsed.statements);
    const grpServers = normalized.objects.find((o) => o.name === 'GRP-SERVERS');
    const grpWeb = normalized.objects.find((o) => o.name === 'GRP-WEB');
    expect(grpServers).toBeDefined();
    expect(grpServers?.type).toBe('group');
    expect(grpServers?.members?.length).toBeGreaterThan(0);
    expect(grpWeb).toBeDefined();
    expect(grpWeb?.type).toBe('service-group');
    expect(grpWeb?.members?.length).toBeGreaterThan(0);
  });

  it('snapshot: object and rule counts are stable', () => {
    const parsed = parseASA(asa3510Sample);
    const normalized = normalizeAsa(parsed.statements);
    expect(normalized.objects.length).toBeGreaterThanOrEqual(8);
    expect(normalized.rules.length).toBe(3);
  });

  it('validateReferentialIntegrity passes with zero missing', () => {
    const parsed = parseASA(asa3510Sample);
    const normalized = normalizeAsa(parsed.statements);
    const result = validateReferentialIntegrity(normalized);
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});
