import { describe, it, expect } from 'vitest';
import {
  parseASA,
  parseFortinetConfig,
  parseFortiManagerExport,
  scanFortinetConfigInventory,
} from '@cisco2cp/parsers';
import {
  normalizeAsa,
  validate,
  ANY_NET_ID,
  ANY_SVC_ID,
  validateReferentialIntegrity,
  buildMigrationReport,
} from '../index';
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

  it('normalizes FortiManager JSON bundle with ruleId for hit merge', () => {
    const bundle = {
      policy: [
        {
          policyid: 42,
          name: 'mgr-rule',
          status: 'enable',
          srcaddr: [{ name: 'all' }],
          dstaddr: [{ name: 'all' }],
          service: [{ name: 'ALL' }],
          action: 1,
        },
      ],
    };
    const { statements } = parseFortiManagerExport(bundle);
    const normalized = normalizeAsa(statements);
    expect(normalized.rules[0]?.ruleId).toBe('42');
    expect(normalized.rules[0]?.name).toBe('mgr-rule');
  });

  it('normalizes FortiGate config via explicit-policy-rule statements', () => {
    const confPath = path.join(process.cwd(), '../parsers/testdata/sample-fortinet.conf');
    const conf = fs.readFileSync(confPath, 'utf-8');
    const { statements } = parseFortinetConfig(conf);
    const normalized = normalizeAsa(statements);
    expect(normalized.rules.length).toBe(3);
    expect(normalized.nat.length).toBeGreaterThanOrEqual(2);
    expect(normalized.interfaces.length).toBeGreaterThanOrEqual(2);
    const allowRule = normalized.rules.find((r) => r.name === 'allow-internal-to-web');
    expect(allowRule?.action).toBe('allow');
    expect(allowRule?.sourceInterfaceNames).toEqual(['port1']);
    expect(allowRule?.destinationInterfaceNames).toEqual(['port2']);
    const disabled = normalized.rules.find((r) => r.name === 'utm-then-disabled');
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.utmProfileRefs?.['av-profile']).toBe('default');
    expect(disabled?.scheduleName).toBe('always');
    const vipNat = normalized.nat.find((n) => n.originalDst === '203.0.113.5');
    expect(vipNat?.type).toBe('static');
    expect(vipNat?.translatedDst).toBe('10.0.1.10');
    const result = validateReferentialIntegrity(normalized);
    expect(result.ok).toBe(true);
    const vr = validate(normalized);
    const inv = scanFortinetConfigInventory(conf);
    const report = buildMigrationReport(normalized, vr, {
      sourceType: 'fortinet',
      parseStatements: statements,
      fortinetSourceInventory: inv,
    });
    expect(report.version).toBe(2);
    expect(report.summary.rules).toBe(3);
    expect(report.summary.disabledRules).toBe(1);
    expect(report.fortinet.rulesWithUtmProfiles).toBeGreaterThanOrEqual(1);
    expect(report.assurance.parsedManifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.assurance.functionalTestPlan.length).toBeGreaterThanOrEqual(
      normalized.rules.length + normalized.nat.length
    );
  });

  it('normalizes FTD-style access-list advanced ACEs', () => {
    const cfg = `
object-group network G1
 network-object host 10.0.0.1
object-group network G2
 network-object host 10.0.0.2
access-list CSM_FW_ACL_ advanced permit ip object-group G1 object-group G2 rule-id 99
`;
    const parsed = parseASA(cfg);
    const normalized = normalizeAsa(parsed.statements);
    expect(normalized.rules).toHaveLength(1);
    expect(normalized.rules[0]?.name).toBe('CSM_FW_ACL_#99');
    const result = validateReferentialIntegrity(normalized);
    expect(result.ok).toBe(true);
  });
});
