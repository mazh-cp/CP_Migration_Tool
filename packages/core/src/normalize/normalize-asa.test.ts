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

describe('ASA routing + nested groups + coverage (Phase 0/1)', () => {
  it('normalizes static routes and captures dynamic routing as notes', () => {
    const cfg = [
      'route outside 0.0.0.0 0.0.0.0 203.0.113.1 1',
      'route inside 10.20.0.0 255.255.0.0 10.0.0.254',
      'router ospf 1',
      ' network 10.0.0.0 255.0.0.0 area 0',
      ' router-id 10.0.0.1',
    ].join('\n');
    const normalized = normalizeAsa(parseASA(cfg).statements);
    expect(normalized.routes).toHaveLength(2);
    const def = normalized.routes?.find((r) => r.destCidr === '0.0.0.0/0');
    expect(def?.nextHop).toBe('203.0.113.1');
    expect(normalized.routes?.some((r) => r.destCidr === '10.20.0.0/16')).toBe(true);
    expect(normalized.dynamicRouting?.[0]?.protocol).toBe('ospf');
    expect(normalized.dynamicRouting?.[0]?.details.some((d) => d.startsWith('network'))).toBe(true);
  });

  it('resolves forward-referenced and nested object-groups (order-independent)', () => {
    // OUTER references INNER before INNER is defined.
    const cfg = [
      'object-group network OUTER',
      ' group-object INNER',
      ' network-object host 192.168.1.1',
      'object-group network INNER',
      ' network-object host 10.0.0.1',
    ].join('\n');
    const normalized = normalizeAsa(parseASA(cfg).statements);
    const outer = normalized.objects.find((o) => o.name === 'OUTER');
    const inner = normalized.objects.find((o) => o.name === 'INNER');
    expect(outer?.members).toContain(inner?.id);
    // No "unknown object reference" warning for the forward reference.
    expect(normalized.warnings.some((w) => /unknown object reference INNER/i.test(w))).toBe(false);
  });

  it('coverage report groups unsupported lines and counts converted entities', () => {
    const cfg = [
      'object network HOST-A',
      ' host 192.168.1.10',
      'route outside 0.0.0.0 0.0.0.0 203.0.113.1',
      'logging enable',
      'snmp-server host inside 10.0.0.5',
      'mtu outside 1500',
    ].join('\n');
    const parsed = parseASA(cfg);
    const normalized = normalizeAsa(parsed.statements);
    normalized.warnings = [...parsed.warnings, ...normalized.warnings];
    const report = buildMigrationReport(normalized, validate(normalized), { sourceType: 'asa' });
    expect(report.coverage.converted.routes).toBe(1);
    expect(report.coverage.unsupportedTotal).toBeGreaterThanOrEqual(3);
    const commands = report.coverage.unsupported.map((u) => u.command);
    expect(commands).toContain('logging');
    expect(commands).toContain('snmp-server');
    expect(commands).toContain('mtu');
  });

  it('captures HA and inspection as review notes in normalized result and report', () => {
    const cfg = [
      'failover',
      'failover lan unit primary',
      'policy-map global_policy',
      ' class inspection_default',
      '  inspect dns',
      '  inspect ftp',
      'threat-detection basic-threat',
    ].join('\n');
    const normalized = normalizeAsa(parseASA(cfg).statements);
    expect(normalized.ha?.details).toHaveLength(2);
    expect(normalized.inspection?.policyMaps[0]?.inspects).toEqual(['dns', 'ftp']);
    expect(normalized.inspection?.threatDetection).toHaveLength(1);

    const report = buildMigrationReport(normalized, validate(normalized), { sourceType: 'asa' });
    const categories = report.manualReview.map((m) => m.category);
    expect(categories).toContain('high-availability');
    expect(categories).toContain('inspection');
    // Coverage badges roll up from manualReview.
    const noteCategories = report.coverage.reviewNotes.map((n) => n.category);
    expect(noteCategories).toContain('high-availability');
    expect(noteCategories).toContain('inspection');
  });

  it('handles IPv6: routes, prefix-style objects, and any6 in ACLs', () => {
    const cfg = [
      'ipv6 route outside 2001:db8:abcd::/48 2001:db8::1',
      'object network NET6',
      ' subnet 2001:db8:1::/64',
      'object network HOST6',
      ' host 2001:db8::10',
      'access-list V6 extended permit tcp any6 host 2001:db8::10 eq 443',
    ].join('\n');
    const normalized = normalizeAsa(parseASA(cfg).statements);

    expect(normalized.routes?.[0]?.destCidr).toBe('2001:db8:abcd::/48');
    expect(normalized.routes?.[0]?.nextHop).toBe('2001:db8::1');

    const net6 = normalized.objects.find((o) => o.name === 'NET6');
    expect(net6?.value).toBe('2001:db8:1::/64');
    const host6 = normalized.objects.find((o) => o.name === 'HOST6');
    expect(host6?.value).toBe('2001:db8::10');

    // any6 maps to the builtin ANY, not a placeholder object
    expect(normalized.rules[0]?.sourceRefs).toEqual([ANY_NET_ID]);
    expect(normalized.objects.some((o) => o.name.toLowerCase() === 'any6')).toBe(false);
  });

  it('merges PAN IKE gateways into site-to-site notes', () => {
    const statements = [
      { type: 'pan-ike-gateway', name: 'gw-hq', peer: '198.51.100.99', pskConfigured: true },
    ];
    const normalized = normalizeAsa(statements as never);
    expect(normalized.vpn?.siteToSite[0]?.peer).toBe('198.51.100.99');
    expect(normalized.vpn?.siteToSite[0]?.pskConfigured).toBe(true);
  });

  it('merges FortiGate phase1-interface VPN into site-to-site notes', () => {
    const cfg = `
config vpn ipsec phase1-interface
    edit "to-hq"
        set remote-gw 198.51.100.7
        set psksecret ENC AbCdEf==
    next
end
`;
    const normalized = normalizeAsa(parseFortinetConfig(cfg).statements);
    expect(normalized.vpn?.siteToSite).toHaveLength(1);
    expect(normalized.vpn?.siteToSite[0]?.peer).toBe('198.51.100.7');
    expect(normalized.vpn?.siteToSite[0]?.pskConfigured).toBe(true);
    expect(JSON.stringify(normalized.vpn)).not.toContain('AbCdEf');
  });

  it('coverage samples mask credentials found in unsupported config lines', () => {
    const cfg = ['username admin password SuperSecret99', 'enable password 7 08221D5C0A1654'].join(
      '\n'
    );
    const parsed = parseASA(cfg);
    const normalized = normalizeAsa(parsed.statements);
    normalized.warnings = [...parsed.warnings, ...normalized.warnings];
    const report = buildMigrationReport(normalized, validate(normalized), { sourceType: 'asa' });
    const serialized = JSON.stringify(report.coverage.unsupported);
    expect(serialized).not.toContain('SuperSecret99');
    expect(serialized).not.toContain('08221D5C0A1654');
    expect(serialized).toContain('***');
  });
});
