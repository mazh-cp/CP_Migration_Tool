import { describe, expect, it } from 'vitest';
import { redactForAi } from '../ai/redaction';

describe('AI redaction', () => {
  it('redacts sensitive keys and replaces IP/FQDN/email values', () => {
    const input = {
      password: 'SuperSecret!',
      tokenValue: 'abcd',
      host: 'app01.example.com',
      adminEmail: 'admin@example.com',
      srcIp: '10.5.170.254',
      nested: {
        apiKey: 'secret-key',
        destination: 'db01.example.com',
      },
      notes: 'Reach 10.5.170.254 from app01.example.com using admin@example.com',
    };

    const result = redactForAi(input);
    const out = result.redacted as Record<string, unknown>;

    expect(out.password).toBe('[REDACTED_SECRET]');
    expect(out.tokenValue).toBe('[REDACTED_SECRET]');
    expect(out.srcIp).toBe('IP_1');
    expect(out.host).toBe('FQDN_1');
    expect(out.adminEmail).toBe('EMAIL_1');
    expect((out.nested as Record<string, unknown>).apiKey).toBe('[REDACTED_SECRET]');
    expect((out.nested as Record<string, unknown>).destination).toBe('FQDN_2');
    expect(out.notes).toBe('Reach IP_1 from FQDN_1 using EMAIL_1');
    expect(result.summary.redactedSecrets).toBeGreaterThan(0);
    expect(result.summary.redactedIps).toBeGreaterThan(0);
    expect(result.summary.redactedFqdns).toBeGreaterThan(0);
    expect(result.summary.redactedEmails).toBeGreaterThan(0);
  });
});
