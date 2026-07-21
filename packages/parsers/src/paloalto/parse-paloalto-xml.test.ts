import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parsePaloAltoXml } from './parse-paloalto-xml';

const sampleXml = readFileSync(join(process.cwd(), 'testdata/sample-panos-minimal.xml'), 'utf-8');
const deviceNetworkXml = readFileSync(join(process.cwd(), 'testdata/sample-panos-device-network.xml'), 'utf-8');
const panoramaTemplateXml = readFileSync(join(process.cwd(), 'testdata/sample-panos-panorama-template.xml'), 'utf-8');
const panoramaDeviceGroupXml = readFileSync(join(process.cwd(), 'testdata/sample-panos-device-group-only.xml'), 'utf-8');

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

  it('extracts vsys under Panorama template/config/devices (zones + device network)', () => {
    const { statements, warnings } = parsePaloAltoXml(panoramaTemplateXml);
    const ifaces = statements.filter((s) => s.type === 'interface') as { name: string; ipAddress?: string }[];
    const byName = Object.fromEntries(ifaces.map((i) => [i.name, i]));
    // Single vsys context: names are not prefixed (prefixes apply when multiple contexts merge).
    expect(byName['Trust']).toBeDefined();
    expect(byName['Untrust']).toBeDefined();
    expect(byName['ethernet1/1']?.ipAddress).toBe('10.0.1.1');
    expect(warnings.some((w) => /vsys contexts merged/i.test(w))).toBe(false);
    expect(statements.some((s) => s.type === 'explicit-policy-rule')).toBe(true);
  });

  it('extracts addresses, services, and pre/post-rulebase rules from Panorama device-group', () => {
    const { statements, warnings } = parsePaloAltoXml(panoramaDeviceGroupXml);
    expect(
      statements.some((s) => s.type === 'object-network' && (s as { name: string }).name === 'DG-1/obj-web')
    ).toBe(true);
    expect(
      statements.some((s) => s.type === 'object-service' && (s as { name: string }).name === 'DG-1/tcp-443')
    ).toBe(true);
    const rules = statements.filter((s) => s.type === 'explicit-policy-rule') as { name: string }[];
    expect(rules.some((r) => r.name === 'DG-1/allow-web')).toBe(true);
    expect(rules.some((r) => r.name === 'DG-1/intrazone-default')).toBe(true);
    expect(warnings.some((w) => /device-group/i.test(w))).toBe(true);
  });

  it('returns a warning for invalid XML', () => {
    const { statements, warnings } = parsePaloAltoXml('<<<');
    expect(statements.length).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('captures IKE gateways as VPN notes without the pre-shared key, and IPv6 addresses', () => {
    const xml = `<config><devices><entry name="localhost.localdomain">
      <network>
        <ike><gateway><entry name="gw-branch">
          <authentication><pre-shared-key><key>-AQ==TopSecretPsk</key></pre-shared-key></authentication>
          <peer-address><ip>203.0.113.77</ip></peer-address>
          <local-address><interface>ethernet1/2</interface></local-address>
        </entry></gateway></ike>
      </network>
      <vsys><entry name="vsys1">
        <address>
          <entry name="v6-host"><ip-netmask>2001:db8::5/128</ip-netmask></entry>
          <entry name="v6-net"><ip-netmask>2001:db8:aa::/48</ip-netmask></entry>
          <entry name="v4-host"><ip-netmask>10.1.1.5/32</ip-netmask></entry>
        </address>
      </entry></vsys>
    </entry></devices></config>`;
    const { statements, warnings } = parsePaloAltoXml(xml);

    const gw = statements.find((s) => s.type === 'pan-ike-gateway') as {
      name: string;
      peer?: string;
      iface?: string;
      pskConfigured?: boolean;
    };
    expect(gw?.name).toBe('gw-branch');
    expect(gw?.peer).toBe('203.0.113.77');
    expect(gw?.iface).toBe('ethernet1/2');
    expect(gw?.pskConfigured).toBe(true);
    expect(JSON.stringify(statements)).not.toContain('TopSecretPsk');
    expect(warnings.some((w) => /IKE gateways captured/i.test(w))).toBe(true);

    const objs = statements.filter((s) => s.type === 'object-network') as Array<{
      name: string;
      host?: string;
      subnet?: string;
      subnetMask?: string;
    }>;
    const v6host = objs.find((o) => o.name === 'v6-host');
    expect(v6host?.host).toBe('2001:db8::5');
    const v6net = objs.find((o) => o.name === 'v6-net');
    expect(v6net?.subnet).toBe('2001:db8:aa::');
    expect(v6net?.subnetMask).toBe('48');
    const v4host = objs.find((o) => o.name === 'v4-host');
    expect(v4host?.host).toBe('10.1.1.5');
  });
});
