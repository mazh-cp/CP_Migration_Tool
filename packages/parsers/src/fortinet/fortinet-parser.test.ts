import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseFortinetConfig, parseSetValues } from './fortinet-parser';

const sample = fs.readFileSync(
  path.join(process.cwd(), 'testdata/sample-fortinet.conf'),
  'utf-8'
);

describe('parseSetValues', () => {
  it('parses quoted and unquoted tokens', () => {
    expect(parseSetValues(`"a b" c`)).toEqual(['a b', 'c']);
    expect(parseSetValues(`member1 member2`)).toEqual(['member1', 'member2']);
  });
});

describe('parseFortinetConfig', () => {
  it('parses sample FortiOS backup with addresses, groups, services, policies', () => {
    const { statements, warnings } = parseFortinetConfig(sample);
    expect(Array.isArray(warnings)).toBe(true);
    expect(statements.some((s) => s.type === 'object-network' && (s as { name: string }).name === 'web-srv')).toBe(
      true
    );
    expect(statements.some((s) => s.type === 'fortinet-vip')).toBe(true);
    expect(statements.some((s) => s.type === 'fortinet-ippool')).toBe(true);
    const policies = statements.filter((s) => s.type === 'explicit-policy-rule');
    expect(policies.length).toBe(3);
    const allowRule = policies.find((s) => (s as { name?: string }).name === 'allow-internal-to-web') as {
      serviceNames: string[];
      action: string;
    };
    expect(allowRule?.action).toBe('permit');
    expect(allowRule?.serviceNames).toContain('HTTP');
    expect(statements.filter((s) => s.type === 'interface').length).toBeGreaterThanOrEqual(2);
    const disabled = policies.find((s) => (s as { name?: string }).name === 'utm-then-disabled') as {
      enabled: boolean;
      utmProfileRefs?: Record<string, string>;
      scheduleName?: string;
    };
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.utmProfileRefs?.['av-profile']).toBe('default');
    expect(disabled?.scheduleName).toBe('always');
  });

  it('captures vpn ipsec phase1-interface as site-to-site notes without the psksecret', () => {
    const cfg = `
config vpn ipsec phase1-interface
    edit "to-branch"
        set interface "wan1"
        set remote-gw 203.0.113.9
        set proposal aes256-sha256
        set psksecret ENC SuperSecretPsk==
    next
end
`;
    const { statements } = parseFortinetConfig(cfg);
    const vpn = statements.filter((s) => s.type === 'fortinet-vpn-phase1') as Array<{
      name: string;
      remoteGw?: string;
      pskConfigured?: boolean;
    }>;
    expect(vpn).toHaveLength(1);
    expect(vpn[0].name).toBe('to-branch');
    expect(vpn[0].remoteGw).toBe('203.0.113.9');
    expect(vpn[0].pskConfigured).toBe(true);
    expect(JSON.stringify(vpn)).not.toContain('SuperSecretPsk');
  });

  it('parses IPv6 addresses, groups, and policies (address6/addrgrp6/policy6)', () => {
    const cfg = `
config firewall address6
    edit "v6-net"
        set ip6 2001:db8:1::/64
    next
    edit "v6-host"
        set ip6 2001:db8::9/128
    next
end
config firewall addrgrp6
    edit "v6-grp"
        set member "v6-net" "v6-host"
    next
end
config firewall policy6
    edit 10
        set name "allow-v6"
        set srcaddr "v6-grp"
        set dstaddr "all"
        set service "HTTPS"
        set action accept
    next
end
`;
    const { statements } = parseFortinetConfig(cfg);
    const objs = statements.filter((s) => s.type === 'object-network') as Array<{
      name: string;
      host?: string;
      subnet?: string;
    }>;
    expect(objs.find((o) => o.name === 'v6-net')?.subnet).toBe('2001:db8:1::/64');
    expect(objs.find((o) => o.name === 'v6-host')?.host).toBe('2001:db8::9');
    const grp = statements.find((s) => s.type === 'object-group-network') as { name: string };
    expect(grp?.name).toBe('v6-grp');
    const rules = statements.filter((s) => s.type === 'explicit-policy-rule') as Array<{
      name?: string;
      action: string;
    }>;
    expect(rules.find((r) => r.name === 'allow-v6')?.action).toBe('permit');
  });

  it('does not apply set lines to outer edit when a nested config is open', () => {
    const cfg = `
config user local
    edit "u1"
        config quarantine
            set days 7
        end
        set passwd ENC ABCD
    next
end
`;
    const { statements } = parseFortinetConfig(cfg);
    expect(statements).toHaveLength(0);
  });
});
