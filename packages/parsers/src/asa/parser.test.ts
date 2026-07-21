import { describe, it, expect } from 'vitest';
import { parseASA } from './parser';

describe('ASA Parser', () => {
  it('parses object network host', () => {
    const result = parseASA('object network HOST-WEB\n host 192.168.1.10');
    const obj = result.statements.find((s) => (s as { type: string }).type === 'object-network') as {
      name: string;
      host?: string;
    };
    expect(obj?.name).toBe('HOST-WEB');
    expect(obj?.host).toBe('192.168.1.10');
  });

  it('parses object network subnet', () => {
    const result = parseASA('object network NET-DMZ\n subnet 192.168.1.0 255.255.255.0');
    const obj = result.statements.find((s) => (s as { type: string }).type === 'object-network') as {
      subnet?: string;
      subnetMask?: string;
    };
    expect(obj?.subnet).toBe('192.168.1.0');
    expect(obj?.subnetMask).toBe('255.255.255.0');
  });

  it('parses access-list extended', () => {
    const result = parseASA('access-list OUTSIDE_IN extended permit tcp any any eq 80');
    const acl = result.statements.find(
      (s) => (s as { type: string }).type === 'access-list-extended'
    ) as { action: string; proto: string };
    expect(acl?.action).toBe('permit');
    expect(acl?.proto).toBe('tcp');
  });

  it('parses access-list advanced (FTD/FMC) with ifc and rule-id', () => {
    const line =
      'access-list CSM_FW_ACL_ advanced permit ip ifc ACCESS-VRF any ifc Global-Routing object-group FMC_INLINE_dst_rule_268435666 rule-id 268435666';
    const result = parseASA(line);
    const acl = result.statements.find(
      (s) => (s as { type: string }).type === 'access-list-extended'
    ) as { name: string; action: string; src: string; dst: string };
    expect(acl?.name).toBe('CSM_FW_ACL_#268435666');
    expect(acl?.action).toBe('permit');
    expect(acl?.src).toContain('ACCESS-VRF');
    expect(acl?.dst).toContain('Global-Routing');
  });

  it('parses access-list advanced trust with two object-groups', () => {
    const line =
      'access-list CSM_FW_ACL_ advanced trust ip object-group A object-group B rule-id 1 event-log flow-end';
    const result = parseASA(line);
    const acl = result.statements.find(
      (s) => (s as { type: string }).type === 'access-list-extended'
    ) as { action: string; src: string; dst: string };
    expect(acl?.action).toBe('permit');
    expect(acl?.src).toBe('object-group A');
    expect(acl?.dst).toBe('object-group B');
  });

  it('ignores access-list remark without error', () => {
    const result = parseASA('access-list CSM_FW_ACL_ remark rule-id 1: RULE: test');
    expect(result.warnings).toHaveLength(0);
    expect(result.statements).toHaveLength(0);
  });

  it('parses remote-access VPN (tunnel-group + group-policy + pool) without capturing the key', () => {
    const cfg = [
      'ip local pool VPN-POOL 10.10.10.1-10.10.10.254 mask 255.255.255.0',
      'group-policy GP-RA internal',
      'group-policy GP-RA attributes',
      ' vpn-tunnel-protocol ssl-client ikev2',
      ' split-tunnel-network-list value SPLIT-ACL',
      'tunnel-group RA-VPN type remote-access',
      'tunnel-group RA-VPN general-attributes',
      ' address-pool VPN-POOL',
      ' default-group-policy GP-RA',
      'tunnel-group RA-VPN ipsec-attributes',
      ' ikev2 local-authentication pre-shared-key SuperSecret123',
    ].join('\n');
    const result = parseASA(cfg);
    // ASA splits a tunnel group across a `type` line and `*-attributes` blocks,
    // so the parser emits one fragment per line; normalization merges them by name.
    const frags = result.statements.filter(
      (s) => (s as { type: string }).type === 'tunnel-group'
    ) as Array<{ name: string; tunnelType?: string; addressPool?: string; pskConfigured?: boolean }>;
    expect(frags.every((f) => f.name === 'RA-VPN')).toBe(true);
    expect(frags.some((f) => f.tunnelType === 'remote-access')).toBe(true);
    expect(frags.some((f) => f.addressPool === 'VPN-POOL')).toBe(true);
    expect(frags.some((f) => f.pskConfigured === true)).toBe(true);
    // The actual key must never appear in any captured field.
    expect(JSON.stringify(frags)).not.toContain('SuperSecret123');
  });

  it('never captures routing authentication secrets in dynamic-routing details', () => {
    const cfg = [
      'router bgp 65001',
      ' neighbor 10.1.1.2 password S3cr3tBGP',
      ' network 10.0.0.0',
      'router ospf 1',
      ' area 0 virtual-link 1.2.3.4 authentication-key OspfK3y',
      ' network 10.0.0.0 255.0.0.0 area 0',
    ].join('\n');
    const result = parseASA(cfg);
    const blocks = result.statements.filter(
      (s) => (s as { type: string }).type === 'dynamic-routing'
    ) as Array<{ protocol: string; details: string[] }>;
    expect(blocks).toHaveLength(2);
    const serialized = JSON.stringify(blocks);
    expect(serialized).not.toContain('S3cr3tBGP');
    expect(serialized).not.toContain('OspfK3y');
    // The masked lines still record that auth is configured.
    const bgp = blocks.find((b) => b.protocol === 'bgp');
    expect(bgp?.details.some((d) => d.includes('password ***'))).toBe(true);
  });

  it('parses ipv6 route into a route statement with prefix length as mask', () => {
    const result = parseASA('ipv6 route outside 2001:db8:abcd::/48 2001:db8::1 2');
    const r = result.statements.find((s) => (s as { type: string }).type === 'route') as {
      ifName: string;
      dest: string;
      mask: string;
      nextHop: string;
      metric?: number;
    };
    expect(r?.ifName).toBe('outside');
    expect(r?.dest).toBe('2001:db8:abcd::');
    expect(r?.mask).toBe('48');
    expect(r?.nextHop).toBe('2001:db8::1');
    expect(r?.metric).toBe(2);
  });

  it('captures failover HA config with the failover key masked', () => {
    const cfg = [
      'failover',
      'failover lan unit primary',
      'failover lan interface FOLINK GigabitEthernet0/3',
      'failover key hexadecimal 0123456789abcdef',
    ].join('\n');
    const result = parseASA(cfg);
    const ha = result.statements.filter((s) => (s as { type: string }).type === 'ha-config') as Array<{
      detail: string;
    }>;
    expect(ha).toHaveLength(4);
    const serialized = JSON.stringify(ha);
    expect(serialized).not.toContain('0123456789abcdef');
    expect(ha.some((h) => h.detail.includes('failover key hexadecimal ***'))).toBe(true);
  });

  it('captures policy-map inspects and threat-detection as inspection notes', () => {
    const cfg = [
      'policy-map global_policy',
      ' class inspection_default',
      '  inspect dns',
      '  inspect ftp',
      '  inspect h323 h225',
      'threat-detection basic-threat',
      'policy-map shaping_only',
      ' class class-default',
      '  police output 100000',
    ].join('\n');
    const result = parseASA(cfg);
    const inspections = result.statements.filter(
      (s) => (s as { type: string }).type === 'inspection'
    ) as Array<{ source: string; name?: string; inspects: string[] }>;
    const pm = inspections.find((i) => i.source === 'policy-map');
    expect(pm?.name).toBe('global_policy');
    expect(pm?.inspects).toEqual(['dns', 'ftp', 'h323']);
    expect(inspections.some((i) => i.source === 'threat-detection')).toBe(true);
    // police-only policy-map emits no statement
    expect(inspections.filter((i) => i.source === 'policy-map')).toHaveLength(1);
  });

  it('parses site-to-site crypto map (peer + match address)', () => {
    const cfg = [
      'crypto map OUTSIDE_MAP 10 match address VPN-ACL',
      'crypto map OUTSIDE_MAP 10 set peer 203.0.113.5',
    ].join('\n');
    const result = parseASA(cfg);
    const maps = result.statements.filter((s) => (s as { type: string }).type === 'crypto-map') as Array<{
      matchAcl?: string;
      peer?: string;
    }>;
    expect(maps.some((m) => m.matchAcl === 'VPN-ACL')).toBe(true);
    expect(maps.some((m) => m.peer === '203.0.113.5')).toBe(true);
  });
});
