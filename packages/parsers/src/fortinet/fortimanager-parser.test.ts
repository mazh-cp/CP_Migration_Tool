import { describe, it, expect } from 'vitest';
import { parseFortiManagerExport } from './fortimanager-parser';

describe('parseFortiManagerExport', () => {
  it('maps bundled CMDB-style JSON to rules and objects', () => {
    const bundle = {
      address: [
        { name: 'web', type: 'ipmask', subnet: '10.0.1.10 255.255.255.255' },
        { name: 'lan', type: 'ipmask', subnet: '10.0.0.0 255.255.255.0' },
      ],
      addrgrp: [{ name: 'grp1', member: [{ name: 'web' }, { name: 'lan' }] }],
      serviceCustom: [{ name: 'APP_TCP', protocol: 'TCP/UDP/SCTP', 'tcp-portrange': '8443' }],
      policy: [
        {
          policyid: 1,
          name: 'allow-web',
          status: 'enable',
          srcintf: [{ name: 'port1' }],
          dstintf: [{ name: 'port2' }],
          srcaddr: [{ name: 'lan' }],
          dstaddr: [{ name: 'web' }],
          service: [{ name: 'HTTP' }, { name: 'APP_TCP' }],
          action: 1,
          logtraffic: 'all',
        },
      ],
    };

    const { statements, warnings } = parseFortiManagerExport(bundle);
    expect(warnings.length).toBeGreaterThanOrEqual(0);
    const pol = statements.find((s) => s.type === 'explicit-policy-rule') as {
      name?: string;
      ruleId?: string;
      action: string;
    };
    expect(pol).toBeDefined();
    expect(pol?.name).toBe('allow-web');
    expect(pol?.ruleId).toBe('1');
    expect(pol?.action).toBe('permit');
    expect(statements.some((s) => s.type === 'object-network' && (s as { name: string }).name === 'web')).toBe(
      true
    );
  });

  it('accepts FortiManager flat map policyid → row', () => {
    const bundle = {
      policy: {
        '1': {
          policyid: 1,
          name: 'flat',
          status: 'enable',
          srcaddr: [{ name: 'all' }],
          dstaddr: [{ name: 'all' }],
          service: [{ name: 'ALL' }],
          action: 1,
        },
      },
    };
    const { statements } = parseFortiManagerExport(bundle);
    expect(statements.filter((s) => s.type === 'explicit-policy-rule')).toHaveLength(1);
  });
});
