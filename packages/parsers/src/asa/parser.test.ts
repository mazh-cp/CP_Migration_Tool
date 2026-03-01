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
});
