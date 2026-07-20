import { describe, it, expect } from 'vitest';
import { parseASA } from '@cisco2cp/parsers';
import { normalizeAsa } from '@cisco2cp/core';
import { exportVpnNotes } from './export-vpn-notes';

const vpnConfig = [
  'ip local pool VPN-POOL 10.10.10.1-10.10.10.254 mask 255.255.255.0',
  'group-policy GP-RA attributes',
  ' vpn-tunnel-protocol ssl-client ikev2',
  ' split-tunnel-network-list value SPLIT-ACL',
  'tunnel-group RA-VPN type remote-access',
  'tunnel-group RA-VPN general-attributes',
  ' address-pool VPN-POOL',
  ' default-group-policy GP-RA',
  'tunnel-group 203.0.113.5 type ipsec-l2l',
  'tunnel-group 203.0.113.5 ipsec-attributes',
  ' ikev1 pre-shared-key TopSecretKey!',
  'crypto map OUTSIDE_MAP 10 match address VPN-ACL',
  'crypto map OUTSIDE_MAP 10 set peer 203.0.113.5',
].join('\n');

describe('VPN notes export', () => {
  it('builds remote-access and site-to-site notes from ASA VPN config', () => {
    const normalized = normalizeAsa(parseASA(vpnConfig).statements);
    expect(normalized.vpn).toBeDefined();

    const notes = exportVpnNotes(normalized.vpn);
    expect(notes.remoteAccess).toHaveLength(1);
    expect(notes.remoteAccess[0].poolRange).toBe('10.10.10.1-10.10.10.254');
    expect(notes.remoteAccess[0].splitTunnelList).toBe('SPLIT-ACL');
    expect(notes.remoteAccess[0].protocols).toContain('ikev2');

    const s2s = notes.siteToSite.find((s) => s.name === '203.0.113.5');
    expect(s2s?.pskConfigured).toBe(true);
    expect(s2s?.matchAcl).toBe('VPN-ACL');
    expect(s2s?.peer).toBe('203.0.113.5');
  });

  it('never emits pre-shared key material', () => {
    const normalized = normalizeAsa(parseASA(vpnConfig).statements);
    const notes = exportVpnNotes(normalized.vpn);
    expect(JSON.stringify(notes)).not.toContain('TopSecretKey');
  });

  it('returns empty notes when no VPN present', () => {
    const notes = exportVpnNotes(undefined);
    expect(notes.remoteAccess).toEqual([]);
    expect(notes.siteToSite).toEqual([]);
  });
});
