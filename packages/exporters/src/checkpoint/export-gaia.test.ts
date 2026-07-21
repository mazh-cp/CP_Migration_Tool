import { describe, it, expect } from 'vitest';
import { parseASA } from '@cisco2cp/parsers';
import { normalizeAsa } from '@cisco2cp/core';
import { exportToGaiaClish } from './export-gaia';

describe('Gaia clish export', () => {
  it('emits IPv4 and IPv6 static routes in their respective clish forms', () => {
    const cfg = [
      'route outside 0.0.0.0 0.0.0.0 203.0.113.1 1',
      'route inside 10.20.0.0 255.255.0.0 10.0.0.254',
      'ipv6 route outside 2001:db8:abcd::/48 2001:db8::1',
    ].join('\n');
    const normalized = normalizeAsa(parseASA(cfg).statements);
    const out = exportToGaiaClish(normalized);

    expect(out).toContain('set static-route default nexthop gateway address 203.0.113.1 priority 1 on');
    expect(out).toContain('set static-route 10.20.0.0/16 nexthop gateway address 10.0.0.254 on');
    expect(out).toContain(
      'set ipv6 static-route 2001:db8:abcd::/48 nexthop gateway address 2001:db8::1 on'
    );
  });

  it('comments dynamic routing instead of converting it', () => {
    const cfg = ['router ospf 1', ' network 10.0.0.0 255.0.0.0 area 0'].join('\n');
    const normalized = normalizeAsa(parseASA(cfg).statements);
    const out = exportToGaiaClish(normalized);
    expect(out).toContain('# Dynamic routing detected');
    expect(out).toContain('#   OSPF 1');
  });
});
