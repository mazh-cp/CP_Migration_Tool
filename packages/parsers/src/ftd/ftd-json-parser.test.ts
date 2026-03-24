import { describe, expect, it } from 'vitest';
import { parseFtdJson } from './ftd-json-parser';

describe('FTD JSON parser', () => {
  it('parses FMC AccessRule shape with object names and port literals', () => {
    const input = [
      {
        type: 'AccessRule',
        name: 'Global-ADDC-Services-kbpasswd5-ADWS',
        action: 'ALLOW',
        sourceZones: {
          objects: [{ name: 'SOM-ACCESS-ZONE', type: 'SecurityZone' }],
        },
        destinationZones: {
          objects: [{ name: 'SOM-GLOBAL-ZONE', type: 'SecurityZone' }],
        },
        destinationNetworks: {
          objects: [{ type: 'NetworkGroup', id: 'abc', name: 'Demant-Global-IP-DCs' }],
        },
        destinationPorts: {
          literals: [{ type: 'PortLiteral', port: '464', protocol: '6' }],
        },
        applications: {
          applications: [{ name: 'NTP' }],
        },
      },
    ];

    const result = parseFtdJson(input);
    const acl = result.statements.find((s) => (s as { type: string }).type === 'access-list-extended') as {
      name: string;
      action: string;
      proto: string;
      src: string;
      dst: string;
      dstPort?: string;
      options?: string[];
    };

    expect(acl).toBeTruthy();
    expect(acl.name).toBe('Global-ADDC-Services-kbpasswd5-ADWS');
    expect(acl.action).toBe('permit');
    expect(acl.proto).toBe('tcp');
    expect(acl.src).toBe('any');
    expect(acl.dst).toBe('Demant-Global-IP-DCs');
    expect(acl.dstPort).toBe('464');
    expect(acl.options).toContain('src-zones:SOM-ACCESS-ZONE');
    expect(acl.options).toContain('dst-zones:SOM-GLOBAL-ZONE');
    expect(acl.options).toContain('apps:NTP');
  });

  it('expands access rules across multiple source and destination objects', () => {
    const input = [
      {
        type: 'AccessRule',
        name: 'Multi-src-dst-rule',
        action: 'ALLOW',
        sourceNetworks: {
          objects: [
            { type: 'Host', name: 'SRC-APP-1' },
            { type: 'Host', name: 'SRC-APP-2' },
          ],
        },
        destinationNetworks: {
          objects: [
            { type: 'NetworkGroup', name: 'DST-DB-1' },
            { type: 'NetworkGroup', name: 'DST-DB-2' },
          ],
        },
      },
    ];

    const result = parseFtdJson(input);
    const rules = result.statements.filter(
      (s) => (s as { type: string }).type === 'access-list-extended'
    ) as Array<{ src: string; dst: string; name: string }>;

    expect(rules).toHaveLength(4);
    expect(rules.map((r) => `${r.src}->${r.dst}`)).toEqual(
      expect.arrayContaining([
        'SRC-APP-1->DST-DB-1',
        'SRC-APP-1->DST-DB-2',
        'SRC-APP-2->DST-DB-1',
        'SRC-APP-2->DST-DB-2',
      ])
    );
    expect(rules.every((r) => r.name === 'Multi-src-dst-rule')).toBe(true);
  });

  it('expands access rules across multiple destination ports', () => {
    const input = [
      {
        type: 'AccessRule',
        name: 'Multi-port-rule',
        action: 'ALLOW',
        sourceNetworks: {
          objects: [{ type: 'Host', name: 'SRC-APP-1' }],
        },
        destinationNetworks: {
          objects: [{ type: 'NetworkGroup', name: 'DST-DB-1' }],
        },
        destinationPorts: {
          literals: [
            { type: 'PortLiteral', port: '53', protocol: '17' },
            { type: 'PortLiteral', port: '123', protocol: '17' },
            { type: 'PortLiteral', port: '443', protocol: '6' },
          ],
        },
      },
    ];

    const result = parseFtdJson(input);
    const rules = result.statements.filter(
      (s) => (s as { type: string }).type === 'access-list-extended'
    ) as Array<{ src: string; dst: string; name: string; dstPort?: string }>;

    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.dstPort)).toEqual(expect.arrayContaining(['53', '123', '443']));
    expect(rules.every((r) => r.src === 'SRC-APP-1')).toBe(true);
    expect(rules.every((r) => r.dst === 'DST-DB-1')).toBe(true);
    expect(rules.every((r) => r.name === 'Multi-port-rule')).toBe(true);
  });

  it('caps rule expansion and emits warning when combinations are too large', () => {
    const srcObjects = Array.from({ length: 30 }, (_, i) => ({
      type: 'Host',
      name: `SRC-${i + 1}`,
    }));
    const dstObjects = Array.from({ length: 30 }, (_, i) => ({
      type: 'Host',
      name: `DST-${i + 1}`,
    }));
    const dstPorts = Array.from({ length: 2 }, (_, i) => ({
      type: 'PortLiteral',
      port: `${1000 + i}`,
      protocol: '6',
    }));

    const input = [
      {
        type: 'AccessRule',
        name: 'Huge-rule',
        action: 'ALLOW',
        sourceNetworks: { objects: srcObjects },
        destinationNetworks: { objects: dstObjects },
        destinationPorts: { literals: dstPorts },
      },
    ];

    const result = parseFtdJson(input);
    const rules = result.statements.filter(
      (s) => (s as { type: string }).type === 'access-list-extended'
    );

    expect(rules).toHaveLength(500);
    expect(result.warnings.some((w) => w.includes('expansion capped at 500'))).toBe(true);
  });
});
