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
