import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parsePaloAltoXml } from './parse-paloalto-xml';

const sampleXml = readFileSync(join(process.cwd(), 'testdata/sample-panos-minimal.xml'), 'utf-8');

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
  });

  it('returns a warning for invalid XML', () => {
    const { statements, warnings } = parsePaloAltoXml('<<<');
    expect(statements.length).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
