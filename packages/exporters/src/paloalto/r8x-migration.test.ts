import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parsePaloAltoXml } from '@cisco2cp/parsers';
import { buildR8xMigrationFromStatements, getR8xMigrationSummary } from './r8x-migration';

const sampleXml = readFileSync(
  join(process.cwd(), '../parsers/testdata/sample-panos-minimal.xml'),
  'utf-8'
);

describe('buildR8xMigrationFromStatements', () => {
  it('maps Palo Alto parser output to R8x shape', () => {
    const { statements, warnings } = parsePaloAltoXml(sampleXml);
    const r8x = buildR8xMigrationFromStatements(statements, warnings, { sourceVsys: 'vsys1' });
    expect(r8x['access-policy']['access-rules'].length).toBeGreaterThan(0);
    const sum = getR8xMigrationSummary(r8x);
    expect(sum.accessRules).toBe(r8x['access-policy']['access-rules'].length);
    expect(sum.hosts + sum.networks).toBeGreaterThan(0);
  });
});
