import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parsePaloAltoXml } from './parse-paloalto-xml';

const sampleXml = readFileSync(join(process.cwd(), 'testdata/sample-panos-minimal.xml'), 'utf-8');
const deviceNetworkXml = readFileSync(join(process.cwd(), 'testdata/sample-panos-device-network.xml'), 'utf-8');

describe('parsePaloAltoXml', () => {
  it('parses sample-panos-minimal.xml into AST statements', () => {
    const { statements, warnings } = parsePaloAltoXml(sampleXml);
    expect(statements.length).toBeGreaterThan(0);
    expect(warnings.some((w) => /App-ID/i.test(w))).toBe(true);

    expect(statements.some((s) => s.type === 'object-network' && (s as { name: string }).name === 'pa-host-a')).toBe(
      true
    );
    const policies = statements.filter((s) => s.type === 'explicit-policy-rule');
    expect(policies.length).toBeGreaterThanOrEqual(2);
    const allow = policies.find((s) => (s as { name?: string }).name === 'allow-https') as {
      enabled: boolean;
    };
    expect(allow?.enabled).toBe(true);
    const deny = policies.find((s) => (s as { name?: string }).name === 'deny-all') as { enabled: boolean };
    expect(deny?.enabled).toBe(false);

    const ifaces = statements.filter((s) => s.type === 'interface') as { name: string }[];
    const ifaceNames = new Set(ifaces.map((i) => i.name));
    expect(ifaceNames.has('trust')).toBe(true);
    expect(ifaceNames.has('untrust')).toBe(true);
  });

  it('reads device-level network/interface/ethernet and direct <ip> CIDRs (running-config shape)', () => {
    const { statements } = parsePaloAltoXml(deviceNetworkXml);
    const ifaces = statements.filter((s) => s.type === 'interface') as { name: string; ipAddress?: string }[];
    const byName = Object.fromEntries(ifaces.map((i) => [i.name, i]));
    expect(byName['ethernet1/1.10']?.ipAddress).toBe('10.10.0.1');
    expect(byName['ethernet1/2']?.ipAddress).toBe('203.0.113.2');
    expect(byName['zone-mgmt']).toBeDefined();
    expect(byName['zone-untrust']).toBeDefined();
  });

  it('returns a warning for invalid XML', () => {
    const { statements, warnings } = parsePaloAltoXml('<<<');
    expect(statements.length).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
